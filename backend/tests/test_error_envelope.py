"""All HTTP errors must come back as {"error": {"message", "type", "code"}}."""
from __future__ import annotations


def test_404_uses_unified_envelope(client):
    r = client.get("/api/this-route-does-not-exist")
    assert r.status_code == 404
    body = r.json()
    assert "error" in body
    assert "message" in body["error"]
    assert body["error"]["code"] == "http_404"


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
    assert body["error"]["code"] == "http_401"
    assert body["error"]["message"]
