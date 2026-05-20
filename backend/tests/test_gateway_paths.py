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
    r = client.get("/v1/models", headers={"Authorization": "Bearer sk-not-real"})
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


def test_monthly_limit_returns_429(client, user_api_key_funded, test_user_funded, db_session):
    """A key that has already spent up to its monthly limit gets 429."""
    from decimal import Decimal as D

    from app.models import ApiKey, RequestLog

    key = db_session.query(ApiKey).filter(ApiKey.user_id == test_user_funded.id).first()
    key.monthly_limit = D("0.01")
    # Insert a synthetic prior debit that already used the full cap.
    log = RequestLog(
        user_id=test_user_funded.id,
        api_key_id=key.id,
        request_type="text",
        status="success",
        cost=D("0.01"),
    )
    db_session.add(log)
    db_session.commit()

    r = client.post(
        "/v1/chat/completions",
        headers={"Authorization": f"Bearer {user_api_key_funded}"},
        json={"model": "gpt-4o", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert r.status_code == 429
    msg = r.json()["error"]["message"].lower()
    assert "monthly limit" in msg


def test_task_id_unknown_returns_404(client, user_api_key_funded):
    r = client.get(
        "/v1/tasks/task_999999", headers={"Authorization": f"Bearer {user_api_key_funded}"}
    )
    assert r.status_code == 404


def test_v1_models_lists_deepseek_when_active(client, db_session, user_api_key):
    """deepseek-v4-flash is seeded; force it active and confirm it shows in /v1/models."""
    from app.models import ModelRow

    row = db_session.query(ModelRow).filter(ModelRow.public_name == "deepseek-v4-flash").one()
    row.status = "active"
    row.visible = True
    db_session.commit()

    r = client.get("/v1/models", headers={"Authorization": f"Bearer {user_api_key}"})
    assert r.status_code == 200
    ids = {m["id"] for m in r.json()["data"]}
    assert "deepseek-v4-flash" in ids


def test_deepseek_models_seeded_under_deepseek_provider(db_session):
    from app.models import ModelRow, Provider

    deepseek = db_session.query(Provider).filter(Provider.name == "deepseek").one()
    for name in ("deepseek-v4-flash", "deepseek-v4-pro"):
        row = db_session.query(ModelRow).filter(ModelRow.public_name == name).one()
        assert row.provider_id == deepseek.id
        assert row.type == "text"
