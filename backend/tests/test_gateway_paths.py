"""Gateway path tests — verify the user-key auth boundary + balance gate.
Does NOT call the real upstream (we don't want to burn credit in CI)."""
from decimal import Decimal


def test_v1_models_via_user_key(client, user_api_key):
    r = client.get("/v1/models", headers={"Authorization": f"Bearer {user_api_key}"})
    assert r.status_code == 200
    body = r.json()
    assert body["object"] == "list"
    ids = {m["id"] for m in body["data"]}
    assert "gpt-4o" in ids


def test_v1_rejects_invalid_key(client):
    r = client.get("/v1/models", headers={"Authorization": "Bearer lgw_not-real"})
    assert r.status_code == 401


def test_v1_missing_auth(client):
    assert client.get("/v1/models").status_code == 401


def test_v1_unknown_model_returns_404(client, user_api_key_funded):
    r = client.post(
        "/v1/chat/completions",
        headers={"Authorization": f"Bearer {user_api_key_funded}"},
        json={"model": "nonexistent-model", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert r.status_code == 404


def test_v1_zero_balance_returns_402(client, user_api_key, test_user):
    """Unfunded user gets Payment Required."""
    assert test_user.balance == Decimal("0")
    r = client.post(
        "/v1/chat/completions",
        headers={"Authorization": f"Bearer {user_api_key}"},
        json={"model": "gpt-4o", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert r.status_code == 402


def test_v1_disabled_key_rejected(client, user_api_key_funded, test_user_funded, db_session):
    from app.models import ApiKey

    api_key = db_session.query(ApiKey).filter(ApiKey.user_id == test_user_funded.id).first()
    api_key.status = "disabled"
    db_session.commit()

    r = client.get("/v1/models", headers={"Authorization": f"Bearer {user_api_key_funded}"})
    assert r.status_code == 401


def test_task_id_malformed_returns_400(client, user_api_key_funded):
    r = client.get(
        "/v1/tasks/notanumber", headers={"Authorization": f"Bearer {user_api_key_funded}"}
    )
    assert r.status_code == 400


def test_task_id_unknown_returns_404(client, user_api_key_funded):
    r = client.get(
        "/v1/tasks/task_999999", headers={"Authorization": f"Bearer {user_api_key_funded}"}
    )
    assert r.status_code == 404
