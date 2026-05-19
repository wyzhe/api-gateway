import pytest

from app import redis_client
from app.services import oauth_state_service as svc
from tests.conftest import needs_redis


@pytest.fixture(autouse=True)
def _reset_redis_client():
    """Each async test runs on its own event loop. The module-level Redis
    client caches a connection bound to the first loop it touches, so we reset
    it per test to avoid 'Event loop is closed' across tests in this file."""
    redis_client.set_redis_for_tests(None)
    yield
    redis_client.set_redis_for_tests(None)


@needs_redis
async def test_put_then_consume_state_returns_payload():
    state = svc.new_token()
    await svc.put_state(state, provider="google", return_to="/",
                        code_verifier="vvv", mode="login")
    got = await svc.consume_state(state)
    assert got == {
        "provider": "google", "return_to": "/", "code_verifier": "vvv",
        "mode": "login", "linker_user_id": None,
    }


@needs_redis
async def test_consume_state_is_one_time():
    state = svc.new_token()
    await svc.put_state(state, provider="google", return_to="/",
                        code_verifier="vvv")
    first = await svc.consume_state(state)
    second = await svc.consume_state(state)
    assert first is not None
    assert second is None


@needs_redis
async def test_consume_unknown_state_returns_none():
    assert await svc.consume_state("does-not-exist") is None


@needs_redis
async def test_put_then_consume_exchange_code():
    code = await svc.put_exchange_code(user_id=42)
    got = await svc.consume_exchange_code(code)
    assert got == 42


@needs_redis
async def test_exchange_code_is_one_time():
    code = await svc.put_exchange_code(user_id=42)
    await svc.consume_exchange_code(code)
    assert await svc.consume_exchange_code(code) is None
