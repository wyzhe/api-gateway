import pytest

from app.services import abuse_mitigation_service as svc
from tests.conftest import needs_redis


@pytest.fixture(autouse=True)
def _reset_redis():
    """Drop the cached async Redis client between tests (event-loop binding)."""
    from app import redis_client

    redis_client.set_redis_for_tests(None)
    yield
    redis_client.set_redis_for_tests(None)


@needs_redis
@pytest.mark.asyncio
async def test_ip_signup_allows_up_to_limit_then_blocks(monkeypatch):
    monkeypatch.setattr(svc.settings, "signup_per_ip_per_day", 3)
    ip = "test-ip-allow-block-1"
    from app.redis_client import get_redis
    r = get_redis()
    await r.delete(f"signup_ip_count:{ip}:{svc._today()}")

    for i in range(3):
        allowed, count = await svc.check_and_incr_signup_ip(ip)
        assert allowed
        assert count == i + 1
    allowed, count = await svc.check_and_incr_signup_ip(ip)
    assert not allowed


@needs_redis
@pytest.mark.asyncio
async def test_api_key_quota_allows_up_to_limit(monkeypatch):
    monkeypatch.setattr(svc.settings, "api_key_per_user_per_day", 2)
    uid = 999999
    from app.redis_client import get_redis
    r = get_redis()
    await r.delete(f"api_key_quota:{uid}:{svc._today()}")

    allowed, _ = await svc.check_and_incr_api_key_quota(uid)
    assert allowed
    allowed, _ = await svc.check_and_incr_api_key_quota(uid)
    assert allowed
    allowed, _ = await svc.check_and_incr_api_key_quota(uid)
    assert not allowed
