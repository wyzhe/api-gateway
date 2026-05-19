"""Per-IP signup counter and per-user daily API key quota.

Both backed by Redis daily-rotating counters.
"""
from __future__ import annotations

from datetime import datetime, timezone

from ..config import get_settings
from ..redis_client import get_redis

settings = get_settings()


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d")


async def check_and_incr_signup_ip(ip: str) -> tuple[bool, int]:
    """Returns (allowed, current_count)."""
    redis = get_redis()
    key = f"signup_ip_count:{ip}:{_today()}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 86400)
    if count > settings.signup_per_ip_per_day:
        return (False, count)
    return (True, count)


async def check_and_incr_api_key_quota(user_id: int) -> tuple[bool, int]:
    """Returns (allowed, current_count). Decrements on reject to avoid quota inflation."""
    redis = get_redis()
    key = f"api_key_quota:{user_id}:{_today()}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 86400)
    if count > settings.api_key_per_user_per_day:
        await redis.decr(key)
        return (False, count - 1)
    return (True, count)
