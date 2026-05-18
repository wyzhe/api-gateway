"""Monthly-cap pre-reservation via Redis.

Why this exists: the monthly cap check used to be a `SUM(cost) >= limit` query
that ran *before* the upstream call. A single expensive request could overshoot
the cap by its full amount, and concurrent requests could each pass the check
and collectively overshoot.

Fix: we maintain a Redis counter per (api_key, utc-month) holding
"committed cost + outstanding reservations". On each request:

  1. Atomically: read the counter; if it exists, INCR by the request's
     pessimistic upper-bound cost; check against the cap.
  2. If the counter is missing (first request of the month, or evicted),
     caller computes committed MTD from the DB once and re-tries with init.

This keeps the hot path Redis-only — the DB `SUM(cost)` is paid once per
api_key per Redis TTL window (default 32 days).

After the request resolves, `release()` decrements by (reservation − actual_cost)
so the counter converges to true committed spend.

Key naming: `ratelimit:mtd:{api_key_id}:{YYYYMM}`.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from redis.asyncio import Redis

_TTL_SECONDS = 32 * 24 * 3600


def _redis_key(api_key_id: int, ts: datetime | None = None) -> str:
    ts = ts or datetime.now(timezone.utc)
    return f"ratelimit:mtd:{api_key_id}:{ts.strftime('%Y%m')}"


@dataclass
class Reservation:
    api_key_id: int
    amount: Decimal
    reservation_id: str
    redis_key: str


_TRY_INCR_LUA = """
-- KEYS[1] = mtd key
-- ARGV[1] = reservation amount  (string decimal)
-- ARGV[2] = limit               (string decimal)
-- returns: -1 if key missing (caller must initialize from DB),
--          0  if reservation would exceed cap,
--          1  if reserved successfully
if redis.call('EXISTS', KEYS[1]) == 0 then
    return -1
end
local newval = redis.call('INCRBYFLOAT', KEYS[1], ARGV[1])
if tonumber(newval) > tonumber(ARGV[2]) then
    redis.call('INCRBYFLOAT', KEYS[1], '-' .. ARGV[1])
    return 0
end
return 1
"""

_INIT_AND_INCR_LUA = """
-- KEYS[1] = mtd key
-- ARGV[1] = committed_mtd  (string decimal)
-- ARGV[2] = reservation    (string decimal)
-- ARGV[3] = limit          (string decimal)
-- ARGV[4] = ttl seconds
if redis.call('EXISTS', KEYS[1]) == 0 then
    redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[4]))
end
local newval = redis.call('INCRBYFLOAT', KEYS[1], ARGV[2])
if tonumber(newval) > tonumber(ARGV[3]) then
    redis.call('INCRBYFLOAT', KEYS[1], '-' .. ARGV[2])
    return 0
end
return 1
"""


class ReservationBackendUnavailable(Exception):
    """Raised when Redis is unreachable and the caller asked for strict mode."""


async def try_reserve(
    redis: Redis,
    *,
    api_key_id: int,
    reservation_amount: Decimal,
    monthly_limit: Decimal,
    strict: bool = True,
) -> tuple[Reservation | None, str]:
    """Fast path — uses the Redis counter without touching the DB.

    Returns (reservation, status) where status is one of:
      "ok"         — reserved; use the Reservation handle.
      "rejected"   — would exceed the cap.
      "needs_init" — Redis counter missing; caller should compute committed MTD
                     from the DB and call `init_and_reserve`.
    """
    key = _redis_key(api_key_id)
    try:
        ret = await redis.eval(
            _TRY_INCR_LUA, 1, key, str(reservation_amount), str(monthly_limit)
        )
    except Exception as exc:
        if strict:
            raise ReservationBackendUnavailable(str(exc)) from exc
        # Redis unreachable in dev/test — fall through to init path so the
        # caller still does a DB-side cap check.
        return None, "needs_init"

    code = int(ret)
    if code == 1:
        return _new(api_key_id, reservation_amount, key), "ok"
    if code == 0:
        return None, "rejected"
    return None, "needs_init"


async def init_and_reserve(
    redis: Redis,
    *,
    api_key_id: int,
    committed_mtd: Decimal,
    reservation_amount: Decimal,
    monthly_limit: Decimal,
    strict: bool = True,
) -> Reservation | None:
    """Slow path — sets the counter from the caller-supplied DB SUM, then
    increments. Returns None if the request would exceed the cap."""
    key = _redis_key(api_key_id)
    try:
        ok = await redis.eval(
            _INIT_AND_INCR_LUA, 1, key,
            str(committed_mtd), str(reservation_amount),
            str(monthly_limit), str(_TTL_SECONDS),
        )
    except Exception as exc:
        if strict:
            raise ReservationBackendUnavailable(str(exc)) from exc
        return _stub(api_key_id, reservation_amount, key)
    if not int(ok):
        return None
    return _new(api_key_id, reservation_amount, key)


async def release(redis: Redis, reservation: Reservation, *, actual_cost: Decimal) -> None:
    """Release a reservation, optionally accounting for the actual cost.

    Net effect on the counter: `-(reservation.amount - actual_cost)`.
    """
    if reservation.reservation_id.startswith("stub-"):
        return
    delta = actual_cost - reservation.amount
    try:
        await redis.incrbyfloat(reservation.redis_key, str(delta))
    except Exception:
        pass


async def force_release_full(redis: Redis, reservation: Reservation) -> None:
    """Convenience: release the full reservation (request failed)."""
    await release(redis, reservation, actual_cost=Decimal("0"))


async def reset_for_api_key(redis: Redis, api_key_id: int) -> None:
    """Forget the cached counter (e.g. after admin raises the cap). The next
    request will re-initialize from the DB SUM."""
    await redis.delete(_redis_key(api_key_id))


def _new(api_key_id: int, amount: Decimal, key: str) -> Reservation:
    return Reservation(
        api_key_id=api_key_id, amount=amount,
        reservation_id=uuid.uuid4().hex, redis_key=key,
    )


def _stub(api_key_id: int, amount: Decimal, key: str) -> Reservation:
    return Reservation(
        api_key_id=api_key_id, amount=amount,
        reservation_id="stub-" + uuid.uuid4().hex, redis_key=key,
    )
