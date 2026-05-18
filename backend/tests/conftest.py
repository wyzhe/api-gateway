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
    """Freshly-created lgw_ key for /v1/* calls. Returns the plaintext."""
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
