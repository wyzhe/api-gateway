"""Per-request provider selection — sticky hook.

Current behavior: every model has a fixed `provider_id`. `pick_provider(model)`
returns that provider. This module exists so that when we add a second upstream,
no other file needs to change to support session-stickiness or per-key/per-user
routing.

Sticky model (when implemented):
- Caller passes a `session_key` (today: API key id; tomorrow: maybe a user-supplied
  cookie or a `chat_id`).
- If Redis holds a mapping `sticky:{session_key}:{model_id} -> provider_id`,
  we honor it (provided that provider is still active and supports the model).
- Otherwise we fall back to the model's default provider and write the sticky
  mapping for subsequent requests in the same session.

Until a second provider is connected, the sticky branch is *intentionally* a
no-op — we just expose the hook surface.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Awaitable, Callable

from fastapi import HTTPException
from redis.asyncio import Redis
from sqlalchemy.orm import Session

from ..models import ModelRow, Provider


@dataclass
class ProviderChoice:
    provider: Provider
    sticky: bool = False  # was this read from the sticky map?


def _sticky_key(session_key: str, model_id: int) -> str:
    return f"sticky:{session_key}:{model_id}"


async def pick_provider(
    db: Session,
    *,
    model: ModelRow,
    session_key: str | None = None,
    redis: Redis | None = None,
    sticky_ttl_seconds: int = 24 * 3600,
    candidate_filter: Callable[[Provider], bool] | None = None,
) -> ProviderChoice:
    """Returns the Provider to use for this request.

    Today this is a thin wrapper around `model.provider_id`. The `session_key`
    + `redis` parameters are reserved so that when a second provider lands,
    callers don't have to change shape.
    """
    if session_key and redis is not None:
        try:
            cached = await redis.get(_sticky_key(session_key, model.id))
        except Exception:
            cached = None
        if cached:
            try:
                pid = int(cached)
            except ValueError:
                pid = None
            if pid:
                p = db.get(Provider, pid)
                if p and p.status == "active" and (candidate_filter is None or candidate_filter(p)):
                    return ProviderChoice(provider=p, sticky=True)

    provider = db.get(Provider, model.provider_id)
    if provider is None:
        raise HTTPException(status_code=500, detail="Provider missing for model")
    if provider.status != "active":
        raise HTTPException(status_code=503, detail=f"Provider '{provider.name}' disabled")

    if session_key and redis is not None:
        try:
            await redis.setex(_sticky_key(session_key, model.id), sticky_ttl_seconds, provider.id)
        except Exception:
            pass

    return ProviderChoice(provider=provider, sticky=False)


async def pick_provider_async_helper(
    db: Session,
    model: ModelRow,
    session_key: str | None = None,
) -> Provider:
    """Convenience wrapper that pulls Redis from the global client. Returns the
    Provider directly for callers that don't need the sticky flag."""
    from ..redis_client import get_redis

    redis: Redis | None = None
    try:
        redis = get_redis()
    except Exception:
        redis = None
    choice = await pick_provider(db, model=model, session_key=session_key, redis=redis)
    return choice.provider


__all__ = ["pick_provider", "pick_provider_async_helper", "ProviderChoice"]


# Reserved for the moment a second provider lands: the build_provider switch.
# Today APIMart is the only adapter, so `gateway_service.build_provider()` does
# the actual instantiation. When a second provider connects, add the dispatch
# table there and keep this module focused on *selection*.
SELECTION_DISPATCH: dict[str, Callable[[Provider], Awaitable[Provider]]] = {}
