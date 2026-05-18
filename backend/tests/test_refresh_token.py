"""Refresh-token rotation. End-to-end against the live FastAPI app."""
from __future__ import annotations

from tests.conftest import TEST_USER_PASSWORD


def test_login_returns_both_tokens(client, test_user):
    r = client.post(
        "/api/auth/login", json={"email": test_user.email, "password": TEST_USER_PASSWORD}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["refresh_token"].startswith("rft_")
    assert body["access_expires_in"] > 0


def test_refresh_rotates_token(client, test_user):
    login = client.post(
        "/api/auth/login", json={"email": test_user.email, "password": TEST_USER_PASSWORD}
    ).json()
    rt = login["refresh_token"]

    r1 = client.post("/api/auth/refresh", json={"refresh_token": rt})
    assert r1.status_code == 200
    new = r1.json()
    assert new["access_token"]
    assert new["refresh_token"]
    assert new["refresh_token"] != rt  # rotated

    # The old token is now revoked: a second refresh with it fails.
    r2 = client.post("/api/auth/refresh", json={"refresh_token": rt})
    assert r2.status_code == 401


def test_refresh_invalid_returns_401(client):
    r = client.post("/api/auth/refresh", json={"refresh_token": "rft_not-a-real-token"})
    assert r.status_code == 401
