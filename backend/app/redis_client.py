"""Shared async Redis client.

Used by:
  - fastapi-limiter (rate limiting)
  - app.services.reservation_service (monthly-cap pre-reservation)
  - arq worker (queue + cron)

Single connection pool; closed in `main.lifespan`. Tests may inject a
fakeredis instance via `set_redis_for_tests()`.
"""
from __future__ import annotations

import redis.asyncio as redis_async

from .config import get_settings

_redis: "redis_async.Redis | None" = None


def get_redis() -> redis_async.Redis:
    global _redis
    if _redis is None:
        settings = get_settings()
        _redis = redis_async.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=2.0,
            socket_timeout=5.0,
        )
    return _redis


def set_redis_for_tests(client: redis_async.Redis | None) -> None:
    global _redis
    _redis = client


async def close_redis() -> None:
    global _redis
    if _redis is not None:
        try:
            await _redis.aclose()
        except Exception:
            pass
        _redis = None


async def ping() -> bool:
    try:
        return bool(await get_redis().ping())
    except Exception:
        return False
