"""Redis helpers for OAuth state + one-time exchange code.

State key holds {provider, return_to, code_verifier, mode, linker_user_id?} for 300s.
Exchange code key holds {user_id} for 60s.
Both are GETDEL on consumption to guarantee one-time use.
"""
from __future__ import annotations

import json
import secrets
from typing import Literal

from ..redis_client import get_redis

_STATE_PREFIX = "oauth_state:"
_EXCHANGE_PREFIX = "oauth_exchange:"
_STATE_TTL = 300
_EXCHANGE_TTL = 60

Mode = Literal["login", "link"]


def new_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


async def put_state(
    state: str,
    *,
    provider: str,
    return_to: str,
    code_verifier: str,
    mode: Mode = "login",
    linker_user_id: int | None = None,
) -> None:
    redis = get_redis()
    payload = json.dumps({
        "provider": provider,
        "return_to": return_to,
        "code_verifier": code_verifier,
        "mode": mode,
        "linker_user_id": linker_user_id,
    })
    await redis.set(_STATE_PREFIX + state, payload, ex=_STATE_TTL)


async def consume_state(state: str) -> dict | None:
    redis = get_redis()
    raw = await redis.getdel(_STATE_PREFIX + state)
    if raw is None:
        return None
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    return json.loads(raw)


async def put_exchange_code(user_id: int) -> str:
    redis = get_redis()
    code = new_token(32)
    await redis.set(_EXCHANGE_PREFIX + code, json.dumps({"user_id": user_id}), ex=_EXCHANGE_TTL)
    return code


async def consume_exchange_code(code: str) -> int | None:
    redis = get_redis()
    raw = await redis.getdel(_EXCHANGE_PREFIX + code)
    if raw is None:
        return None
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    data = json.loads(raw)
    return int(data["user_id"])
