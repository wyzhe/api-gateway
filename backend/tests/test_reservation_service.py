"""reservation_service — monthly-cap pre-reservation counter.

The counter holds integer 1e-8-dollar units mutated with exact INCRBY/DECRBY,
so accounting never drifts the way INCRBYFLOAT would. The Redis-backed tests
each build their own client (no shared singleton) so they stay loop-clean.
"""
from __future__ import annotations

import socket
import uuid
from decimal import Decimal
from urllib.parse import urlparse

import pytest
from redis.asyncio import Redis

from app.config import get_settings
from app.services import reservation_service as rs


def _redis_reachable() -> bool:
    p = urlparse(get_settings().redis_url)
    try:
        with socket.create_connection((p.hostname or "localhost", p.port or 6379), 0.5):
            return True
    except OSError:
        return False


pytestmark = pytest.mark.skipif(not _redis_reachable(), reason="Redis unreachable")


@pytest.fixture
async def redis():
    client = Redis.from_url(get_settings().redis_url)
    try:
        yield client
    finally:
        await client.aclose()


def _key_id() -> int:
    """A high, random api_key_id that never collides with real rows."""
    return 900_000_000 + (uuid.uuid4().int % 10_000_000)


# ---------------- pure conversion ----------------


def test_to_units_is_exact():
    assert rs._to_units(Decimal("0")) == 0
    assert rs._to_units(Decimal("0.00000001")) == 1
    assert rs._to_units(Decimal("1.23456789")) == 123456789
    assert rs._to_units(Decimal("100")) == 10_000_000_000


# ---------------- reserve / cap ----------------


async def test_init_and_reserve_then_reject_at_cap(redis):
    kid = _key_id()
    key = rs._redis_key(kid)
    await redis.delete(key)
    try:
        # committed 0, reserve 6, cap 10 -> ok
        first = await rs.init_and_reserve(
            redis, api_key_id=kid, committed_mtd=Decimal("0"),
            reservation_amount=Decimal("6"), monthly_limit=Decimal("10"),
        )
        assert first is not None

        # another 6 -> 12 > 10 -> rejected, and the counter is rolled back
        res, status = await rs.try_reserve(
            redis, api_key_id=kid,
            reservation_amount=Decimal("6"), monthly_limit=Decimal("10"),
        )
        assert status == "rejected" and res is None
        assert int(await redis.get(key)) == rs._to_units(Decimal("6"))

        # 3 more -> 9 <= 10 -> ok
        res2, status2 = await rs.try_reserve(
            redis, api_key_id=kid,
            reservation_amount=Decimal("3"), monthly_limit=Decimal("10"),
        )
        assert status2 == "ok" and res2 is not None
        assert int(await redis.get(key)) == rs._to_units(Decimal("9"))
    finally:
        await redis.delete(key)


async def test_try_reserve_needs_init_when_counter_missing(redis):
    kid = _key_id()
    await redis.delete(rs._redis_key(kid))
    res, status = await rs.try_reserve(
        redis, api_key_id=kid,
        reservation_amount=Decimal("1"), monthly_limit=Decimal("10"),
    )
    assert res is None and status == "needs_init"


# ---------------- release exactness (the point of integer units) ----------------


async def test_release_converges_to_actual_cost(redis):
    kid = _key_id()
    key = rs._redis_key(kid)
    await redis.delete(key)
    try:
        reservation = await rs.init_and_reserve(
            redis, api_key_id=kid, committed_mtd=Decimal("0"),
            reservation_amount=Decimal("0.10000000"), monthly_limit=Decimal("1000"),
        )
        assert reservation is not None
        # an awkward actual cost that binary float would not represent cleanly
        await rs.release(redis, reservation, actual_cost=Decimal("0.03333333"))
        assert int(await redis.get(key)) == rs._to_units(Decimal("0.03333333"))
    finally:
        await redis.delete(key)


async def test_many_reserve_release_cycles_stay_exact(redis):
    """50 cycles with fiddly decimals: an INCRBYFLOAT counter would drift in the
    low digits; the integer counter lands on the exact expected total."""
    kid = _key_id()
    key = rs._redis_key(kid)
    await redis.delete(key)
    try:
        await rs.init_and_reserve(
            redis, api_key_id=kid, committed_mtd=Decimal("0"),
            reservation_amount=Decimal("0"), monthly_limit=Decimal("1000000000"),
        )
        total = Decimal("0")
        for i in range(50):
            res, status = await rs.try_reserve(
                redis, api_key_id=kid,
                reservation_amount=Decimal("0.07"), monthly_limit=Decimal("1000000000"),
            )
            assert status == "ok" and res is not None
            actual = Decimal("0.00000007") * (i + 1)
            await rs.release(redis, res, actual_cost=actual)
            total += actual
        assert int(await redis.get(key)) == rs._to_units(total)
    finally:
        await redis.delete(key)


async def test_force_release_full_zeroes_the_reservation(redis):
    kid = _key_id()
    key = rs._redis_key(kid)
    await redis.delete(key)
    try:
        reservation = await rs.init_and_reserve(
            redis, api_key_id=kid, committed_mtd=Decimal("0"),
            reservation_amount=Decimal("2.5"), monthly_limit=Decimal("100"),
        )
        assert reservation is not None
        assert int(await redis.get(key)) == rs._to_units(Decimal("2.5"))
        await rs.force_release_full(redis, reservation)
        assert int(await redis.get(key)) == 0
    finally:
        await redis.delete(key)
