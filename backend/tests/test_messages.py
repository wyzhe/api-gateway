"""/v1/messages (Anthropic Messages API) — auth boundary, balance gate, monthly cap.
No upstream call: we don't want to burn credit in CI."""
from __future__ import annotations

from decimal import Decimal


def test_messages_requires_api_key(client):
    r = client.post("/v1/messages", json={"model": "claude-sonnet-4.6", "messages": []})
    assert r.status_code == 401


def test_messages_unknown_model_returns_404(client, user_api_key_funded):
    r = client.post(
        "/v1/messages",
        headers={"Authorization": f"Bearer {user_api_key_funded}"},
        json={
            "model": "nope-not-a-model",
            "max_tokens": 4,
            "messages": [{"role": "user", "content": "hi"}],
        },
    )
    assert r.status_code == 404


def test_messages_zero_balance_returns_402(client, user_api_key, test_user):
    assert test_user.balance == Decimal("0")
    r = client.post(
        "/v1/messages",
        headers={"Authorization": f"Bearer {user_api_key}"},
        json={
            "model": "claude-sonnet-4.6",
            "max_tokens": 16,
            "messages": [{"role": "user", "content": "hi"}],
        },
    )
    assert r.status_code == 402


def test_messages_monthly_limit_returns_429(client, user_api_key_funded, test_user_funded, db_session):
    from app.models import ApiKey, RequestLog

    key = db_session.query(ApiKey).filter(ApiKey.user_id == test_user_funded.id).first()
    key.monthly_limit = Decimal("0.01")
    db_session.add(
        RequestLog(
            user_id=test_user_funded.id, api_key_id=key.id,
            request_type="text", status="success", cost=Decimal("0.01"),
        )
    )
    db_session.commit()
    r = client.post(
        "/v1/messages",
        headers={"Authorization": f"Bearer {user_api_key_funded}"},
        json={
            "model": "claude-sonnet-4.6",
            "max_tokens": 16,
            "messages": [{"role": "user", "content": "hi"}],
        },
    )
    assert r.status_code == 429
    assert "monthly limit" in r.json()["error"]["message"].lower()


def test_messages_missing_model_field_returns_400(client, user_api_key_funded):
    r = client.post(
        "/v1/messages",
        headers={"Authorization": f"Bearer {user_api_key_funded}"},
        json={"messages": [{"role": "user", "content": "hi"}]},
    )
    assert r.status_code == 400


def test_anthropic_usage_estimate_includes_system_and_tools():
    from app.services.token_estimator import estimate_anthropic_messages_usage

    payload = {
        "system": "You are a helpful coding assistant.",
        "messages": [{"role": "user", "content": "Tell me about Python."}],
        "tools": [
            {"name": "search", "description": "Search the web", "input_schema": {"type": "object"}}
        ],
        "max_tokens": 256,
    }
    prompt, completion, total = estimate_anthropic_messages_usage(payload, "claude-sonnet-4.6")
    # System + user + tool definition should produce a meaningfully bigger prompt
    # than the bare user message.
    just_user, _, _ = estimate_anthropic_messages_usage(
        {"messages": payload["messages"], "max_tokens": 256}, "claude-sonnet-4.6"
    )
    assert prompt > just_user
    assert completion == 256
    assert total == prompt + completion
