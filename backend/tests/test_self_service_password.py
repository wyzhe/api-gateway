"""Self-service password endpoint."""
from datetime import datetime, timezone
from decimal import Decimal

import pytest

from app.database import SessionLocal
from app.models import RefreshToken, User
from app.security import hash_password
from tests.conftest import (
    TEST_USER_PASSWORD,
    _db_reachable,
    _redis_reachable,
    _reset_login_rate_limit,
)

pytestmark = pytest.mark.skipif(not _db_reachable(), reason="needs Postgres")


@pytest.fixture(autouse=True)
def _flush_rate_limits():
    """Reset rate limiters between tests so the 10/min password limiter doesn't 429."""
    if _redis_reachable():
        _reset_login_rate_limit()
    yield


def _make_user(db, email: str, *, password_hash: str | None) -> User:
    db.query(User).filter(User.email == email).delete()
    db.commit()
    u = User(
        email=email, password_hash=password_hash,
        role="user", status="active", balance=Decimal("0"),
        email_verified_at=datetime.now(timezone.utc),
    )
    db.add(u); db.commit(); db.refresh(u)
    return u


def _jwt_for(client, email: str, password: str) -> str:
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def test_oauth_only_user_can_set_first_password(client):
    db = SessionLocal()
    email = "pwd-oauth-only@example.com"
    u = _make_user(db, email, password_hash=None)
    try:
        from app.security import create_access_token
        token = create_access_token(str(u.id), extra={"role": "user"})

        r = client.post(
            "/api/auth/me/password",
            headers={"Authorization": f"Bearer {token}"},
            json={"new_password": "passphrase-very-strong-q9"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["access_token"]
        assert body["refresh_token"]

        db.refresh(u)
        assert u.password_hash is not None
    finally:
        db.query(RefreshToken).filter(RefreshToken.user_id == u.id).delete()
        db.query(User).filter(User.email == email).delete()
        db.commit()
        db.close()


def test_too_short_password_rejected(client):
    db = SessionLocal()
    email = "pwd-short@example.com"
    u = _make_user(db, email, password_hash=hash_password(TEST_USER_PASSWORD))
    try:
        token = _jwt_for(client, email, TEST_USER_PASSWORD)
        r = client.post(
            "/api/auth/me/password",
            headers={"Authorization": f"Bearer {token}"},
            json={"current_password": TEST_USER_PASSWORD, "new_password": "short"},
        )
        assert r.status_code == 422
        # error indicates rejection reason
        assert "too_short" in r.text.lower() or "12" in r.text
    finally:
        db.query(RefreshToken).filter(RefreshToken.user_id == u.id).delete()
        db.query(User).filter(User.email == email).delete()
        db.commit()
        db.close()


def test_breached_password_rejected(client):
    db = SessionLocal()
    email = "pwd-breached@example.com"
    u = _make_user(db, email, password_hash=hash_password(TEST_USER_PASSWORD))
    try:
        token = _jwt_for(client, email, TEST_USER_PASSWORD)
        # "masterbating" is 12 chars and in the SecLists top-10k breach list.
        r = client.post(
            "/api/auth/me/password",
            headers={"Authorization": f"Bearer {token}"},
            json={"current_password": TEST_USER_PASSWORD, "new_password": "masterbating"},
        )
        assert r.status_code == 422
    finally:
        db.query(RefreshToken).filter(RefreshToken.user_id == u.id).delete()
        db.query(User).filter(User.email == email).delete()
        db.commit()
        db.close()


def test_change_requires_correct_current(client):
    db = SessionLocal()
    email = "pwd-change-need-current@example.com"
    u = _make_user(db, email, password_hash=hash_password(TEST_USER_PASSWORD))
    try:
        token = _jwt_for(client, email, TEST_USER_PASSWORD)
        r1 = client.post(
            "/api/auth/me/password",
            headers={"Authorization": f"Bearer {token}"},
            json={"new_password": "passphrase-very-strong-q9"},
        )
        assert r1.status_code == 400
        r2 = client.post(
            "/api/auth/me/password",
            headers={"Authorization": f"Bearer {token}"},
            json={"current_password": "wrong", "new_password": "passphrase-very-strong-q9"},
        )
        assert r2.status_code == 401
    finally:
        db.query(RefreshToken).filter(RefreshToken.user_id == u.id).delete()
        db.query(User).filter(User.email == email).delete()
        db.commit()
        db.close()


def test_change_revokes_existing_refresh_tokens(client):
    db = SessionLocal()
    email = "pwd-change-revoke@example.com"
    u = _make_user(db, email, password_hash=hash_password(TEST_USER_PASSWORD))
    try:
        login1 = client.post("/api/auth/login", json={"email": email, "password": TEST_USER_PASSWORD})
        old_refresh = login1.json()["refresh_token"]
        login2 = client.post("/api/auth/login", json={"email": email, "password": TEST_USER_PASSWORD})
        token = login2.json()["access_token"]

        r = client.post(
            "/api/auth/me/password",
            headers={"Authorization": f"Bearer {token}"},
            json={"current_password": TEST_USER_PASSWORD,
                  "new_password": "new-strong-passphrase-x7q"},
        )
        assert r.status_code == 200

        r_old = client.post("/api/auth/refresh", json={"refresh_token": old_refresh})
        assert r_old.status_code == 401
    finally:
        db.query(RefreshToken).filter(
            RefreshToken.user_id == u.id
        ).delete()
        db.query(User).filter(User.email == email).delete()
        db.commit()
        db.close()


def test_password_change_writes_audit_log(client):
    db = SessionLocal()
    email = "pwd-audit@example.com"
    from app.models import AuditLog
    u = _make_user(db, email, password_hash=None)
    try:
        from app.security import create_access_token
        token = create_access_token(str(u.id), extra={"role": "user"})

        r = client.post(
            "/api/auth/me/password",
            headers={"Authorization": f"Bearer {token}"},
            json={"new_password": "fresh-strong-passphrase-z2"},
        )
        assert r.status_code == 200

        logs = (
            db.query(AuditLog)
              .filter_by(target_id=str(u.id), action="password_set")
              .all()
        )
        assert len(logs) == 1
    finally:
        db.query(RefreshToken).filter(RefreshToken.user_id == u.id).delete()
        db.query(AuditLog).filter(AuditLog.target_id == str(u.id)).delete()
        db.query(User).filter(User.email == email).delete()
        db.commit()
        db.close()
