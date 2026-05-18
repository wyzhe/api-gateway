"""TPM (tokens-per-minute) sliding-window rate limit.

Mirrors reservation_service in spirit: prededuct an upper bound now,
reconcile with the real usage later.

Redis layout per api_key:
    ZSET key = f"tpm:k{api_key_id}"
    Members: unique entry id (uuid4 hex), score = unix epoch seconds when created.
    HASH key = f"tpm:h:k{api_key_id}"
    Fields: entry_id -> token count (str)

On every operation:
    1) Snapshot stale entries (score < now - window_seconds), delete them from
       both the sorted set and the hash side table.
    2) Sum remaining hash values to get current_used.
    3) Decide allow/reject vs the tpm_limit.

Cancellation contract:
- `try_prededuct` returns a TpmHandle on success (None if denied). NULL
  `tpm_limit` always succeeds without consuming budget.
- `reconcile` adjusts the prededucted entry to the actual usage (smaller
  refunds budget; larger consumes more).
- `release_fully` removes the entry entirely (use when the upstream call
  failed before tokens were consumed).
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass

from redis.asyncio import Redis


DEFAULT_WINDOW = 60  # seconds


@dataclass
class TpmHandle:
    api_key_id: int
    entry_id: str
    prededucted: int  # 0 if no limit was set


def _zkey(api_key_id: int) -> str:
    return f"tpm:k{api_key_id}"


def _hkey(api_key_id: int) -> str:
    return f"tpm:h:k{api_key_id}"


async def _evict_and_sum(r: Redis, api_key_id: int, window_seconds: int, now: float) -> int:
    """Drop stale entries from the sorted set + hash, return remaining total tokens."""
    zkey = _zkey(api_key_id)
    hkey = _hkey(api_key_id)
    cutoff = now - window_seconds
    stale_ids = await r.zrangebyscore(zkey, "-inf", cutoff)
    if stale_ids:
        await r.zremrangebyscore(zkey, "-inf", cutoff)
        await r.hdel(hkey, *stale_ids)
    fresh_ids = await r.zrange(zkey, 0, -1)
    if not fresh_ids:
        return 0
    raw = await r.hmget(hkey, *fresh_ids)
    total = 0
    for v in raw:
        if v is not None:
            try:
                total += int(v)
            except (TypeError, ValueError):
                pass
    return total


async def try_prededuct(
    r: Redis,
    *,
    api_key_id: int,
    tokens: int,
    tpm_limit: int | None,
    window_seconds: int = DEFAULT_WINDOW,
) -> TpmHandle | None:
    """Attempt to reserve `tokens` against the per-api_key TPM budget.

    Returns a handle on success; None on denial.
    NULL `tpm_limit` always returns a handle with prededucted=0 (no limit)."""
    if tpm_limit is None or tokens <= 0:
        return TpmHandle(api_key_id=api_key_id, entry_id="", prededucted=0)

    now = time.time()
    used = await _evict_and_sum(r, api_key_id, window_seconds, now)
    if used + tokens > tpm_limit:
        return None

    entry_id = uuid.uuid4().hex
    pipe = r.pipeline(transaction=False)
    pipe.zadd(_zkey(api_key_id), {entry_id: now})
    pipe.hset(_hkey(api_key_id), entry_id, tokens)
    pipe.expire(_zkey(api_key_id), window_seconds * 4)
    pipe.expire(_hkey(api_key_id), window_seconds * 4)
    await pipe.execute()
    return TpmHandle(api_key_id=api_key_id, entry_id=entry_id, prededucted=tokens)


async def reconcile(r: Redis, handle: TpmHandle, *, actual_tokens: int) -> None:
    """Adjust the prededucted entry to actual usage. Does NOT change the entry's
    score - the window still expires at the original prededuct time, which is
    the conservative choice (we don't extend the limit window)."""
    if not handle.entry_id:
        return
    actual_tokens = max(0, int(actual_tokens))
    await r.hset(_hkey(handle.api_key_id), handle.entry_id, actual_tokens)


async def release_fully(r: Redis, handle: TpmHandle) -> None:
    """Cancel a prededuct (e.g. upstream failed before consuming any tokens)."""
    if not handle.entry_id:
        return
    pipe = r.pipeline(transaction=False)
    pipe.zrem(_zkey(handle.api_key_id), handle.entry_id)
    pipe.hdel(_hkey(handle.api_key_id), handle.entry_id)
    await pipe.execute()
