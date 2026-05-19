"""Per-api_key concurrency slot manager.

Redis layout:
    KEY = f"conc:k{api_key_id}"
    Sorted set; member = uuid4 hex (entry_id), score = unix epoch when acquired.

On every acquire:
    1) ZREMRANGEBYSCORE KEY -inf (now - hold_timeout_seconds)
       Evicts slots whose holders crashed or got SIGKILLed before releasing.
    2) ZCARD KEY -> active count.
    3) If active >= max_concurrent: return None (denied).
    4) ZADD KEY {entry_id: now}; set TTL = hold_timeout_seconds * 2.

Streaming vs non-streaming requests share the same slot (one request = one slot).
GET /v1/tasks/{id} does NOT acquire a slot (polling endpoint, not work submission).

Cancellation contract: caller is responsible for calling release on every exit
path, including streaming generator finally. Slot also evicts on its own after
hold_timeout_seconds (10 min default) if the caller never released.
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass

from redis.asyncio import Redis
from redis.exceptions import RedisError


class ConcurrencyBackendUnavailable(RuntimeError):
    """Raised when Redis is unreachable in production mode."""


DEFAULT_MAX_CONCURRENT = 10
DEFAULT_HOLD_TIMEOUT = 600  # seconds - covers longest legitimate streaming chat
# Retry-After cap: Anthropic SDK ignores Retry-After > 60s
# (anthropic-sdk-python/_base_client.py:1097); we use 30s for safety.
RETRY_AFTER_CAP_SECONDS = 30


@dataclass
class ConcurrencySlot:
    api_key_id: int
    entry_id: str


def _key(api_key_id: int) -> str:
    return f"conc:k{api_key_id}"


async def acquire(
    r: Redis,
    *,
    api_key_id: int,
    max_concurrent: int | None,
    hold_timeout_seconds: int = DEFAULT_HOLD_TIMEOUT,
) -> ConcurrencySlot | None:
    """Acquire a slot. Returns the slot handle on success; None if denied.

    NULL `max_concurrent` means no limit and always succeeds without taking
    a slot (entry_id = "")."""
    if max_concurrent is None:
        return ConcurrencySlot(api_key_id=api_key_id, entry_id="")

    # Local import: keeps the module importable in tests / contexts where the
    # full settings env isn't loaded.
    from ..config import get_settings
    settings = get_settings()

    now = time.time()
    cutoff = now - hold_timeout_seconds
    key = _key(api_key_id)

    try:
        pipe = r.pipeline(transaction=False)
        pipe.zremrangebyscore(key, "-inf", cutoff)
        pipe.zcard(key)
        _, active = await pipe.execute()
    except RedisError as exc:
        # Past MVP: silently bypassing a concurrency gate in production is
        # unacceptable (matches reservation_service.try_reserve strict mode).
        # In dev/test we still degrade silently so unit tests without Redis
        # can exercise the surrounding logic.
        if settings.is_production:
            raise ConcurrencyBackendUnavailable(str(exc)) from exc
        return ConcurrencySlot(api_key_id=api_key_id, entry_id="")
    if int(active) >= max_concurrent:
        return None

    entry_id = uuid.uuid4().hex
    try:
        pipe = r.pipeline(transaction=False)
        pipe.zadd(key, {entry_id: now})
        pipe.expire(key, hold_timeout_seconds * 2)
        await pipe.execute()
    except RedisError as exc:
        if settings.is_production:
            raise ConcurrencyBackendUnavailable(str(exc)) from exc
        return ConcurrencySlot(api_key_id=api_key_id, entry_id="")
    return ConcurrencySlot(api_key_id=api_key_id, entry_id=entry_id)


async def release(r: Redis, slot: ConcurrencySlot) -> None:
    if not slot.entry_id:
        return
    await r.zrem(_key(slot.api_key_id), slot.entry_id)


async def active_count(
    r: Redis,
    *,
    api_key_id: int,
    hold_timeout_seconds: int = DEFAULT_HOLD_TIMEOUT,
) -> int:
    from ..config import get_settings
    settings = get_settings()

    now = time.time()
    cutoff = now - hold_timeout_seconds
    try:
        pipe = r.pipeline(transaction=False)
        pipe.zremrangebyscore(_key(api_key_id), "-inf", cutoff)
        pipe.zcard(_key(api_key_id))
        _, n = await pipe.execute()
    except RedisError as exc:
        if settings.is_production:
            raise ConcurrencyBackendUnavailable(str(exc)) from exc
        return 0
    return int(n)


def compute_retry_after(*, active: int, max_concurrent: int) -> int:
    """Crude heuristic: 2 seconds * (active - max + 1), capped at 30s."""
    over = max(1, active - max_concurrent + 1)
    return min(RETRY_AFTER_CAP_SECONDS, 2 * over)


def compute_retry_after_ms(*, active: int, max_concurrent: int) -> int:
    return compute_retry_after(active=active, max_concurrent=max_concurrent) * 1000
