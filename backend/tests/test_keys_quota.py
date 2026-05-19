import asyncio

import pytest

from tests.conftest import _db_reachable, _redis_reachable

pytestmark = pytest.mark.skipif(
    not (_db_reachable() and _redis_reachable()),
    reason="needs Postgres + Redis",
)


@pytest.fixture(autouse=True)
def _reset_redis_client():
    """Drop the cached async Redis client between tests (event-loop binding)."""
    from app import redis_client

    redis_client.set_redis_for_tests(None)
    yield
    redis_client.set_redis_for_tests(None)


def test_api_key_creation_blocked_after_quota(monkeypatch, client, jwt):
    # Force a low cap directly on the service's cached settings — reloading
    # would not update the live FastAPI route (its endpoint is captured by
    # the app at registration time).
    from app.services import abuse_mitigation_service
    monkeypatch.setattr(
        abuse_mitigation_service.settings, "api_key_per_user_per_day", 2
    )

    hdr = {"Authorization": f"Bearer {jwt}"}

    # Start clean: delete any existing keys for this user.
    existing = client.get("/api/keys", headers=hdr).json()
    for k in existing:
        client.delete(f"/api/keys/{k['id']}", headers=hdr)

    # Resolve uid and clear that user's Redis counter.
    me = client.get("/api/auth/me", headers=hdr).json()
    uid = me["id"]
    today = abuse_mitigation_service._today()
    from app import redis_client as _rc
    from app.redis_client import get_redis

    async def _clear():
        r = get_redis()
        await r.delete(f"api_key_quota:{uid}:{today}")
        await _rc.close_redis()

    asyncio.get_event_loop().run_until_complete(_clear())

    # First two succeed; third trips the quota.
    r1 = client.post("/api/keys", headers=hdr, json={"name": "qk1"})
    assert r1.status_code == 201, r1.text
    # Drop the cached Redis client so the next TestClient call binds Redis
    # to its own fresh event loop.
    _rc.set_redis_for_tests(None)

    r2 = client.post("/api/keys", headers=hdr, json={"name": "qk2"})
    assert r2.status_code == 201, r2.text
    _rc.set_redis_for_tests(None)

    r3 = client.post("/api/keys", headers=hdr, json={"name": "qk3"})
    assert r3.status_code == 429, r3.text

    # cleanup keys (monkeypatch auto-restores the cap)
    _rc.set_redis_for_tests(None)
    for k in client.get("/api/keys", headers=hdr).json():
        client.delete(f"/api/keys/{k['id']}", headers=hdr)
