import asyncio
import time

import pytest

from app.redis_client import get_redis
from app.services import tpm_service

# pytest-asyncio is configured in mode=auto (pyproject.toml), so async test
# functions are auto-marked. No module-level pytestmark needed.
from .conftest import needs_redis as _needs_redis


@pytest.fixture
async def clean_key():
    r = get_redis()
    key_id = (int(time.time() * 1000) % 100000) + 11111
    await r.delete(f"tpm:k{key_id}", f"tpm:h:k{key_id}")
    yield key_id
    await r.delete(f"tpm:k{key_id}", f"tpm:h:k{key_id}")


@_needs_redis
async def test_prededuct_under_limit_returns_handle(clean_key):
    r = get_redis()
    handle = await tpm_service.try_prededuct(
        r, api_key_id=clean_key, tokens=1000, tpm_limit=10000
    )
    assert handle is not None
    assert handle.prededucted == 1000


@_needs_redis
async def test_prededuct_over_limit_returns_none(clean_key):
    r = get_redis()
    h1 = await tpm_service.try_prededuct(
        r, api_key_id=clean_key, tokens=9000, tpm_limit=10000
    )
    assert h1 is not None
    h2 = await tpm_service.try_prededuct(
        r, api_key_id=clean_key, tokens=2000, tpm_limit=10000
    )
    assert h2 is None


@_needs_redis
async def test_no_limit_returns_handle_with_zero(clean_key):
    r = get_redis()
    handle = await tpm_service.try_prededuct(
        r, api_key_id=clean_key, tokens=1000, tpm_limit=None
    )
    assert handle is not None
    assert handle.prededucted == 0


@_needs_redis
async def test_reconcile_adjusts_difference_down(clean_key):
    r = get_redis()
    handle = await tpm_service.try_prededuct(
        r, api_key_id=clean_key, tokens=1000, tpm_limit=2000
    )
    await tpm_service.reconcile(r, handle, actual_tokens=200)
    h2 = await tpm_service.try_prededuct(
        r, api_key_id=clean_key, tokens=1500, tpm_limit=2000
    )
    assert h2 is not None  # 200 used, 1800 left; 1500 fits


@_needs_redis
async def test_reconcile_with_higher_actual_blocks_next(clean_key):
    r = get_redis()
    handle = await tpm_service.try_prededuct(
        r, api_key_id=clean_key, tokens=500, tpm_limit=2000
    )
    await tpm_service.reconcile(r, handle, actual_tokens=1800)
    h2 = await tpm_service.try_prededuct(
        r, api_key_id=clean_key, tokens=1000, tpm_limit=2000
    )
    assert h2 is None


@_needs_redis
async def test_window_evicts_old_entries(clean_key):
    r = get_redis()
    handle = await tpm_service.try_prededuct(
        r, api_key_id=clean_key, tokens=1000, tpm_limit=1500, window_seconds=1,
    )
    assert handle is not None
    await asyncio.sleep(1.5)
    h2 = await tpm_service.try_prededuct(
        r, api_key_id=clean_key, tokens=1400, tpm_limit=1500, window_seconds=1,
    )
    assert h2 is not None


@_needs_redis
async def test_release_fully_returns_budget(clean_key):
    r = get_redis()
    handle = await tpm_service.try_prededuct(
        r, api_key_id=clean_key, tokens=1500, tpm_limit=2000
    )
    await tpm_service.release_fully(r, handle)
    h2 = await tpm_service.try_prededuct(
        r, api_key_id=clean_key, tokens=2000, tpm_limit=2000
    )
    assert h2 is not None
