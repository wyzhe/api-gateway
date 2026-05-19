import pytest
from decimal import Decimal
from datetime import datetime, timezone

from app.database import SessionLocal
from app.models import OAuthIdentity, User
from tests.conftest import _db_reachable, _redis_reachable, _reset_login_rate_limit

pytestmark = pytest.mark.skipif(not _db_reachable(), reason="needs Postgres")


@pytest.fixture(autouse=True)
def _flush_rate_limits():
    if _redis_reachable():
        _reset_login_rate_limit()
    yield


def test_list_connections_returns_user_identities(client, jwt, test_user):
    db = SessionLocal()
    try:
        db.query(OAuthIdentity).filter_by(provider_subject="g-list-1").delete()
        db.commit()
        identity = OAuthIdentity(
            user_id=test_user.id,
            provider="google",
            provider_subject="g-list-1",
        )
        db.add(identity)
        db.commit()
        db.refresh(identity)
        iid = identity.id

        r = client.get(
            "/api/settings/connections",
            headers={"Authorization": f"Bearer {jwt}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert any(i["id"] == iid and i["provider"] == "google" for i in body)
    finally:
        db.query(OAuthIdentity).filter_by(provider_subject="g-list-1").delete()
        db.commit()
        db.close()


def test_detach_succeeds_when_password_exists(client, jwt, test_user):
    db = SessionLocal()
    try:
        db.query(OAuthIdentity).filter_by(provider_subject="gh-detach-1").delete()
        db.commit()
        identity = OAuthIdentity(
            user_id=test_user.id,
            provider="github",
            provider_subject="gh-detach-1",
        )
        db.add(identity)
        db.commit()
        db.refresh(identity)
        iid = identity.id

        r = client.delete(
            f"/api/settings/connections/{iid}",
            headers={"Authorization": f"Bearer {jwt}"},
        )
        assert r.status_code == 204, r.text
    finally:
        db.query(OAuthIdentity).filter_by(provider_subject="gh-detach-1").delete()
        db.commit()
        db.close()


def test_detach_fails_when_last_method(client):
    db = SessionLocal()
    email = "detach-last-route@example.com"
    db.query(User).filter(User.email == email).delete()
    db.commit()
    u = None
    try:
        u = User(
            email=email,
            password_hash=None,
            role="user",
            status="active",
            balance=Decimal("0"),
            email_verified_at=datetime.now(timezone.utc),
        )
        db.add(u)
        db.commit()
        db.refresh(u)
        identity = OAuthIdentity(
            user_id=u.id,
            provider="google",
            provider_subject="g-detach-last",
        )
        db.add(identity)
        db.commit()
        db.refresh(identity)

        from app.security import create_access_token

        token = create_access_token(str(u.id), extra={"role": "user"})

        r = client.delete(
            f"/api/settings/connections/{identity.id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 409, r.text
    finally:
        if u is not None:
            db.query(OAuthIdentity).filter_by(user_id=u.id).delete()
        db.query(User).filter(User.email == email).delete()
        db.commit()
        db.close()
