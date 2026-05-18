"""Gateway path tests — verify the user-key auth boundary + balance gate.
Does NOT call the real upstream (we don't want to burn credit in CI)."""
from decimal import Decimal


def _login(client, user) -> str:
    return client.post(
        "/api/auth/login", json={"email": user.email, "password": "test-pass-123"}
    ).json()["access_token"]


def _new_key(client, jwt: str) -> str:
    hdr = {"Authorization": f"Bearer {jwt}"}
    return client.post("/api/keys", headers=hdr, json={"name": "pytest"}).json()["key"]


def test_v1_models_via_user_key(client, test_user):
    jwt = _login(client, test_user)
    key = _new_key(client, jwt)
    r = client.get("/v1/models", headers={"Authorization": f"Bearer {key}"})
    assert r.status_code == 200
    body = r.json()
    assert body["object"] == "list"
    # seed loaded at least gpt-4o
    ids = {m["id"] for m in body["data"]}
    assert "gpt-4o" in ids


def test_v1_rejects_invalid_key(client):
    r = client.get("/v1/models", headers={"Authorization": "Bearer lgw_not-real"})
    assert r.status_code == 401


def test_v1_missing_auth(client):
    assert client.get("/v1/models").status_code == 401


def test_v1_unknown_model_returns_404(client, test_user_funded):
    jwt = _login(client, test_user_funded)
    key = _new_key(client, jwt)
    r = client.post(
        "/v1/chat/completions",
        headers={"Authorization": f"Bearer {key}"},
        json={"model": "nonexistent-model", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert r.status_code == 404


def test_v1_zero_balance_returns_402(client, test_user):
    """Unfunded user gets Payment Required."""
    jwt = _login(client, test_user)
    key = _new_key(client, jwt)
    assert test_user.balance == Decimal("0")
    r = client.post(
        "/v1/chat/completions",
        headers={"Authorization": f"Bearer {key}"},
        json={"model": "gpt-4o", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert r.status_code == 402


def test_v1_disabled_key_rejected(client, test_user_funded, db_session):
    from app.models import ApiKey

    jwt = _login(client, test_user_funded)
    key = _new_key(client, jwt)
    # Disable it
    api_key = db_session.query(ApiKey).filter(ApiKey.user_id == test_user_funded.id).first()
    api_key.status = "disabled"
    db_session.commit()

    r = client.get("/v1/models", headers={"Authorization": f"Bearer {key}"})
    assert r.status_code == 401


def test_task_id_malformed_returns_400(client, test_user_funded):
    jwt = _login(client, test_user_funded)
    key = _new_key(client, jwt)
    r = client.get("/v1/tasks/notanumber", headers={"Authorization": f"Bearer {key}"})
    assert r.status_code == 400


def test_task_id_other_user_returns_404(client, test_user_funded):
    """Even if a task exists, it must belong to the caller."""
    jwt = _login(client, test_user_funded)
    key = _new_key(client, jwt)
    # A non-existent local task id should 404 (not 500).
    r = client.get("/v1/tasks/task_999999", headers={"Authorization": f"Bearer {key}"})
    assert r.status_code == 404
