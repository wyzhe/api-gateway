import pytest
from decimal import Decimal

from app.database import SessionLocal
from app.models import User

from tests.conftest import _db_reachable, _redis_reachable, _reset_login_rate_limit

pytestmark = pytest.mark.skipif(not _db_reachable(), reason="needs Postgres")


@pytest.fixture(autouse=True)
def _flush_rate_limits():
    """Reset the login limiter between tests so repeated runs don't hit 429."""
    if _redis_reachable():
        _reset_login_rate_limit()
    yield


def test_admin_mark_verified_sets_field(client, admin_jwt):
    db = SessionLocal()
    email = "to-be-verified@example.com"
    try:
        db.query(User).filter(User.email == email).delete()
        db.commit()
        u = User(
            email=email,
            password_hash="x",
            role="user",
            status="active",
            balance=Decimal("0"),
            email_verified_at=None,
        )
        db.add(u)
        db.commit()
        db.refresh(u)
        uid = u.id

        r = client.post(
            f"/api/admin/users/{uid}/mark-email-verified",
            headers={"Authorization": f"Bearer {admin_jwt}"},
        )
        assert r.status_code == 200, r.text

        db.refresh(u)
        assert u.email_verified_at is not None
    finally:
        db.query(User).filter(User.email == email).delete()
        db.commit()
        db.close()


def test_mark_verified_requires_admin(client, jwt):
    r = client.post(
        "/api/admin/users/1/mark-email-verified",
        headers={"Authorization": f"Bearer {jwt}"},
    )
    assert r.status_code in (401, 403)
