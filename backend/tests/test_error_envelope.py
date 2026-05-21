"""HTTP errors come back in OpenAI's `{"error": {message, type, param, code}}`
shape, with `type` drawn from OpenAI's vocabulary (not a gateway-private one)."""
from __future__ import annotations


def test_404_uses_unified_envelope(client):
    r = client.get("/api/this-route-does-not-exist")
    assert r.status_code == 404
    body = r.json()
    assert "error" in body
    assert body["error"]["message"]
    assert body["error"]["type"] == "invalid_request_error"
    assert body["error"]["code"] is None


def test_validation_error_envelope(client):
    r = client.post("/api/auth/login", json={"email": "not-an-email", "password": "x"})
    assert r.status_code == 422
    body = r.json()
    assert body["error"]["type"] == "validation_error"
    assert "details" in body["error"]


def test_unauthorized_envelope(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401
    body = r.json()
    assert body["error"]["type"] == "authentication_error"
    assert body["error"]["code"] is None
    assert body["error"]["message"]
