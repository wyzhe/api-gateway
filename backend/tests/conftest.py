"""Test fixtures. Integration tests share one Postgres connection and clean up
their own rows. DB-touching tests skip if Postgres isn't reachable."""
from collections.abc import Iterator
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.config import get_settings
from app.database import SessionLocal, engine
from app.main import app
from app.models import User
from app.security import hash_password
from app.services import billing_service

TEST_USER_EMAIL = "pytest-user@example.com"
TEST_USER_PASSWORD = "test-pass-123"


def _db_reachable() -> bool:
    try:
        with engine.connect() as c:
            c.execute(text("select 1"))
        return True
    except Exception:
        return False


def _redis_reachable() -> bool:
    import os
    import socket
    from urllib.parse import urlparse

    url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    p = urlparse(url)
    try:
        with socket.create_connection((p.hostname or "localhost", p.port or 6379), 0.5):
            return True
    except OSError:
        return False


needs_redis = pytest.mark.skipif(not _redis_reachable(), reason="Redis unreachable")


def _reset_login_rate_limit() -> None:
    """Best-effort: delete any fastapi-limiter Redis keys so tests can log in.

    Login is rate-limited (10/15min by IP). Repeat test runs share state and
    trip 429s; clearing the keys lets each test start with a fresh window.
    """
    import os

    try:
        import redis  # type: ignore[import-not-found]
    except Exception:  # pragma: no cover
        return
    url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    try:
        client = redis.Redis.from_url(url)
        for key in client.scan_iter("fastapi-limiter:*"):
            client.delete(key)
        client.close()
    except Exception:  # pragma: no cover
        pass


@pytest.fixture(scope="session")
def settings():
    return get_settings()


@pytest.fixture
def db_session() -> Iterator:
    if not _db_reachable():
        pytest.skip("Postgres not reachable")
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture(scope="session")
def client() -> Iterator[TestClient]:
    """Session-scoped so we don't re-run lifespan (seed) per test."""
    if not _db_reachable():
        pytest.skip("Postgres not reachable")
    with TestClient(app) as c:
        yield c


def _delete_test_user(db, email: str) -> None:
    u = db.query(User).filter(User.email == email).one_or_none()
    if u:
        db.delete(u)
        db.commit()


@pytest.fixture
def test_user(db_session) -> Iterator[User]:
    _delete_test_user(db_session, TEST_USER_EMAIL)
    u = User(
        email=TEST_USER_EMAIL,
        password_hash=hash_password(TEST_USER_PASSWORD),
        display_name="Pytest User",
        role="user",
        status="active",
        balance=Decimal("0"),
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    yield u
    _delete_test_user(db_session, TEST_USER_EMAIL)


@pytest.fixture
def test_user_funded(db_session, test_user) -> User:
    billing_service.recharge(db_session, test_user.id, Decimal("100"), admin_id=None, note="pytest")
    db_session.refresh(test_user)
    return test_user


@pytest.fixture
def jwt(client, test_user) -> str:
    """Logged-in user's access token."""
    r = client.post("/api/auth/login", json={"email": test_user.email, "password": TEST_USER_PASSWORD})
    return r.json()["access_token"]


@pytest.fixture
def jwt_funded(client, test_user_funded) -> str:
    r = client.post(
        "/api/auth/login", json={"email": test_user_funded.email, "password": TEST_USER_PASSWORD}
    )
    return r.json()["access_token"]


@pytest.fixture
def user_api_key(client, jwt) -> str:
    """Freshly-created sk- key for /v1/* calls. Returns the plaintext."""
    r = client.post(
        "/api/keys", headers={"Authorization": f"Bearer {jwt}"}, json={"name": "pytest"}
    )
    return r.json()["key"]


@pytest.fixture
def user_api_key_funded(client, jwt_funded) -> str:
    r = client.post(
        "/api/keys", headers={"Authorization": f"Bearer {jwt_funded}"}, json={"name": "pytest"}
    )
    return r.json()["key"]


TEST_ADMIN_EMAIL = "pytest-admin@example.com"


@pytest.fixture
def admin_user(db_session) -> Iterator[User]:
    u = db_session.query(User).filter(User.email == TEST_ADMIN_EMAIL).one_or_none()
    if u is None:
        u = User(
            email=TEST_ADMIN_EMAIL,
            password_hash=hash_password(TEST_USER_PASSWORD),
            display_name="Pytest Admin",
            role="admin",
            status="active",
            balance=Decimal("0"),
        )
        db_session.add(u)
        db_session.commit()
        db_session.refresh(u)
    else:
        u.role = "admin"
        u.status = "active"
        u.password_hash = hash_password(TEST_USER_PASSWORD)
        db_session.commit()
        db_session.refresh(u)
    yield u
    # don't delete: keep admin around between tests in case multiple use it concurrently


@pytest.fixture
def admin_jwt(client, admin_user) -> str:
    r = client.post(
        "/api/auth/login", json={"email": admin_user.email, "password": TEST_USER_PASSWORD}
    )
    return r.json()["access_token"]
