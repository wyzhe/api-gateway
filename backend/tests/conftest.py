"""Test fixtures. Integration tests share one Postgres connection and clean up
their own rows. The DB-touching tests are auto-skipped if Postgres isn't reachable.
"""
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


def _db_reachable() -> bool:
    try:
        with engine.connect() as c:
            c.execute(text("select 1"))
        return True
    except Exception:
        return False


pytestmark_db = pytest.mark.skipif(not _db_reachable(), reason="Postgres not reachable")


@pytest.fixture(scope="session")
def settings():
    return get_settings()


@pytest.fixture
def db_session() -> Iterator:
    """Plain session for setup/teardown. Tests are responsible for cleanup
    of any rows they insert (use unique emails)."""
    if not _db_reachable():
        pytest.skip("Postgres not reachable")
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture
def client(db_session) -> Iterator[TestClient]:
    """FastAPI TestClient. Triggers lifespan (seed runs)."""
    with TestClient(app) as c:
        yield c


def _delete_test_user(db, email: str) -> None:
    u = db.query(User).filter(User.email == email).one_or_none()
    if u:
        # Cascade handles api_keys/transactions/logs/video_tasks.
        db.delete(u)
        db.commit()


@pytest.fixture
def test_user(db_session) -> Iterator[User]:
    email = "pytest-user@example.com"
    _delete_test_user(db_session, email)
    u = User(
        email=email,
        password_hash=hash_password("test-pass-123"),
        display_name="Pytest User",
        role="user",
        status="active",
        balance=Decimal("0"),
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    yield u
    _delete_test_user(db_session, email)


@pytest.fixture
def test_user_funded(db_session, test_user) -> User:
    billing_service.recharge(db_session, test_user.id, Decimal("100"), admin_id=None, note="pytest")
    db_session.refresh(test_user)
    return test_user
