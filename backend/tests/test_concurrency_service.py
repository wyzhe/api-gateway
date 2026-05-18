import asyncio
import time

import pytest

from app.redis_client import get_redis
from app.services import concurrency_service


def _redis_reachable() -> bool:
    import os, socket
    from urllib.parse import urlparse
    url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    p = urlparse(url)
    try:
        with socket.create_connection((p.hostname or "localhost", p.port or 6379), 0.5):
            return True
    except OSError:
        return False


# pytest-asyncio is configured in mode=auto (pyproject.toml), so async test
# functions are auto-marked. No module-level pytestmark needed — using one
# would wrongly mark the sync pure-function tests as asyncio too.
_needs_redis = pytest.mark.skipif(not _redis_reachable(), reason="Redis unreachable")


@pytest.fixture
async def clean_key():
    r = get_redis()
    key_id = (int(time.time() * 1000) % 100000) + 22222
    await r.delete(f"conc:k{key_id}")
    yield key_id
    await r.delete(f"conc:k{key_id}")


@_needs_redis
async def test_acquire_under_limit(clean_key):
    r = get_redis()
    slot = await concurrency_service.acquire(
        r, api_key_id=clean_key, max_concurrent=3
    )
    assert slot is not None
    assert slot.entry_id != ""


@_needs_redis
async def test_acquire_blocks_at_limit(clean_key):
    r = get_redis()
    s1 = await concurrency_service.acquire(r, api_key_id=clean_key, max_concurrent=2)
    s2 = await concurrency_service.acquire(r, api_key_id=clean_key, max_concurrent=2)
    assert s1 and s2
    s3 = await concurrency_service.acquire(r, api_key_id=clean_key, max_concurrent=2)
    assert s3 is None


@_needs_redis
async def test_release_frees_slot(clean_key):
    r = get_redis()
    s1 = await concurrency_service.acquire(r, api_key_id=clean_key, max_concurrent=1)
    assert s1 is not None
    assert await concurrency_service.acquire(r, api_key_id=clean_key, max_concurrent=1) is None
    await concurrency_service.release(r, s1)
    s2 = await concurrency_service.acquire(r, api_key_id=clean_key, max_concurrent=1)
    assert s2 is not None


@_needs_redis
async def test_no_limit_always_acquires(clean_key):
    r = get_redis()
    slots = []
    for _ in range(20):
        s = await concurrency_service.acquire(r, api_key_id=clean_key, max_concurrent=None)
        slots.append(s)
    assert all(s is not None for s in slots)
    # all returned no-op slots with empty entry_id
    assert all(s.entry_id == "" for s in slots)


@_needs_redis
async def test_stale_slot_evicted_after_timeout(clean_key):
    r = get_redis()
    s1 = await concurrency_service.acquire(
        r, api_key_id=clean_key, max_concurrent=1, hold_timeout_seconds=1
    )
    assert s1
    await asyncio.sleep(1.5)
    s2 = await concurrency_service.acquire(
        r, api_key_id=clean_key, max_concurrent=1, hold_timeout_seconds=1
    )
    assert s2 is not None


@_needs_redis
async def test_active_count_reflects_acquired_slots(clean_key):
    r = get_redis()
    await concurrency_service.acquire(r, api_key_id=clean_key, max_concurrent=5)
    await concurrency_service.acquire(r, api_key_id=clean_key, max_concurrent=5)
    n = await concurrency_service.active_count(r, api_key_id=clean_key)
    assert n == 2


def test_retry_after_seconds_caps_at_30():
    assert concurrency_service.compute_retry_after(active=5, max_concurrent=1) <= 30
    assert concurrency_service.compute_retry_after(active=100, max_concurrent=1) == 30
    assert concurrency_service.compute_retry_after(active=2, max_concurrent=1) >= 1


def test_retry_after_ms_matches_seconds_times_thousand():
    ms = concurrency_service.compute_retry_after_ms(active=2, max_concurrent=1)
    sec = concurrency_service.compute_retry_after(active=2, max_concurrent=1)
    assert ms == sec * 1000
