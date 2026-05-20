import pytest

from tests.conftest import _db_reachable, _redis_reachable, _reset_login_rate_limit

pytestmark = pytest.mark.skipif(
    not (_db_reachable() and _redis_reachable()),
    reason="needs Postgres + Redis",
)


@pytest.fixture(autouse=True)
def _reset_redis_client():
    """Drop the cached async Redis client between tests (event-loop binding),
    and clear the login rate-limiter so each test can log in fresh."""
    from app import redis_client

    _reset_login_rate_limit()
    redis_client.set_redis_for_tests(None)
    yield
    redis_client.set_redis_for_tests(None)


def test_reveal_returns_full_key(client, jwt):
    hdr = {"Authorization": f"Bearer {jwt}"}
    created = client.post("/api/keys", headers=hdr, json={"name": "reveal-ok"})
    assert created.status_code == 201, created.text
    body = created.json()
    key_id, full = body["id"], body["key"]

    revealed = client.post(f"/api/keys/{key_id}/reveal", headers=hdr)
    assert revealed.status_code == 200, revealed.text
    assert revealed.json()["key"] == full

    client.delete(f"/api/keys/{key_id}", headers=hdr)


def test_reveal_null_encrypted_returns_409(client, jwt, db_session):
    hdr = {"Authorization": f"Bearer {jwt}"}
    created = client.post("/api/keys", headers=hdr, json={"name": "reveal-null"})
    assert created.status_code == 201, created.text
    key_id = created.json()["id"]

    # Simulate a key created before the key_encrypted column existed.
    from app.models import ApiKey
    row = db_session.get(ApiKey, key_id)
    row.key_encrypted = None
    db_session.commit()

    revealed = client.post(f"/api/keys/{key_id}/reveal", headers=hdr)
    assert revealed.status_code == 409, revealed.text

    client.delete(f"/api/keys/{key_id}", headers=hdr)


def test_reveal_other_users_key_404(client, jwt, admin_jwt):
    """The reveal route hands out a plaintext secret — it must enforce ownership."""
    hdr = {"Authorization": f"Bearer {jwt}"}
    created = client.post("/api/keys", headers=hdr, json={"name": "reveal-owner"})
    assert created.status_code == 201, created.text
    key_id = created.json()["id"]

    other = client.post(
        f"/api/keys/{key_id}/reveal",
        headers={"Authorization": f"Bearer {admin_jwt}"},
    )
    assert other.status_code == 404, other.text

    client.delete(f"/api/keys/{key_id}", headers=hdr)
