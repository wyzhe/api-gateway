"""Integration: login -> me -> api keys CRUD -> admin-required gate."""
from tests.conftest import TEST_USER_PASSWORD


def test_login_returns_token(client, test_user):
    r = client.post("/api/auth/login", json={"email": test_user.email, "password": TEST_USER_PASSWORD})
    assert r.status_code == 200
    body = r.json()
    assert body["access_token"]
    assert body["user"]["email"] == test_user.email
    assert body["user"]["role"] == "user"


def test_login_wrong_password_401(client, test_user):
    r = client.post("/api/auth/login", json={"email": test_user.email, "password": "bad"})
    assert r.status_code == 401


def test_me_requires_token(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-jwt"}).status_code == 401


def test_me_returns_self(client, jwt, test_user):
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {jwt}"})
    assert r.status_code == 200
    assert r.json()["email"] == test_user.email


def test_api_key_lifecycle(client, jwt):
    hdr = {"Authorization": f"Bearer {jwt}"}

    assert client.get("/api/keys", headers=hdr).json() == []

    created = client.post("/api/keys", headers=hdr, json={"name": "test-key"}).json()
    full = created["key"]
    assert full.startswith("lgw_")
    assert created["key_prefix"] == full[:11]

    rows = client.get("/api/keys", headers=hdr).json()
    assert len(rows) == 1
    assert "key" not in rows[0]
    assert rows[0]["status"] == "active"

    kid = rows[0]["id"]
    assert client.post(f"/api/keys/{kid}/disable", headers=hdr).json()["status"] == "disabled"
    assert client.post(f"/api/keys/{kid}/enable", headers=hdr).json()["status"] == "active"

    assert client.delete(f"/api/keys/{kid}", headers=hdr).status_code == 204
    assert client.get("/api/keys", headers=hdr).json() == []


def test_non_admin_cannot_access_admin_routes(client, jwt):
    r = client.get("/api/admin/overview", headers={"Authorization": f"Bearer {jwt}"})
    assert r.status_code == 403


def test_gateway_endpoint_rejects_jwt(client, jwt):
    """`/v1/*` must use the user API key (lgw_), not the dashboard JWT."""
    r = client.get("/v1/models", headers={"Authorization": f"Bearer {jwt}"})
    assert r.status_code == 401
