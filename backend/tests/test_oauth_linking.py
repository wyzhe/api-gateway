"""OAuthLinkingService.find_or_create_user — 3 cases:
1. identity 已绑 → login
2. 同 email 已有 verified User → link
3. 新建 → signup

加上拒绝路径:
- email_verified_at IS NULL 的现有 User → OAuthEmailConflict (account pre-hijacking 防护)
- disabled User → OAuthUserDisabled
"""
from datetime import datetime, timezone
from decimal import Decimal

import pytest

from app.database import SessionLocal
from app.models import OAuthIdentity, User
from app.services import oauth_linking_service as svc
from tests.conftest import _db_reachable


pytestmark = pytest.mark.skipif(not _db_reachable(), reason="Postgres not reachable")


def _cleanup(db, emails: list[str]):
    db.query(OAuthIdentity).filter(
        OAuthIdentity.user_id.in_(
            db.query(User.id).filter(User.email.in_(emails))
        )
    ).delete(synchronize_session=False)
    db.query(User).filter(User.email.in_(emails)).delete(synchronize_session=False)
    db.commit()


def test_creates_new_user_when_no_match():
    db = SessionLocal()
    email = "oauth-new@example.com"
    _cleanup(db, [email])
    try:
        with db.begin():
            outcome, user = svc.find_or_create_user(
                db, provider="google", subject="google-sub-1",
                email=email, name="New User",
            )
        assert outcome == "signup"
        assert user.email == email
        assert user.password_hash is None
        assert user.balance == Decimal("0")
        assert user.email_verified_at is not None
        assert len(user.oauth_identities) == 1
    finally:
        _cleanup(db, [email])
        db.close()


def test_returns_login_when_identity_already_bound():
    db = SessionLocal()
    email = "oauth-bound@example.com"
    _cleanup(db, [email])
    try:
        with db.begin():
            _, user1 = svc.find_or_create_user(
                db, provider="google", subject="google-sub-2",
                email=email, name="Bound",
            )
        with db.begin():
            outcome, user2 = svc.find_or_create_user(
                db, provider="google", subject="google-sub-2",
                email=email, name="Bound",
            )
        assert outcome == "login"
        assert user2.id == user1.id
    finally:
        _cleanup(db, [email])
        db.close()


def test_links_to_verified_existing_user():
    db = SessionLocal()
    email = "oauth-verified-existing@example.com"
    _cleanup(db, [email])
    try:
        with db.begin():
            u = User(
                email=email, password_hash="bcrypt-hash",
                role="user", status="active", balance=Decimal("0"),
                email_verified_at=datetime.now(timezone.utc),
            )
            db.add(u)
            db.flush()
            uid = u.id
        with db.begin():
            outcome, user = svc.find_or_create_user(
                db, provider="github", subject="gh-sub-1",
                email=email, name="Linked",
            )
        assert outcome == "link"
        assert user.id == uid
        assert len(user.oauth_identities) == 1
        assert user.oauth_identities[0].provider == "github"
    finally:
        _cleanup(db, [email])
        db.close()


def test_refuses_unverified_existing_user_account_prehijacking_guard():
    db = SessionLocal()
    email = "oauth-unverified-existing@example.com"
    _cleanup(db, [email])
    try:
        with db.begin():
            u = User(
                email=email, password_hash="bcrypt-hash",
                role="user", status="active", balance=Decimal("0"),
                email_verified_at=None,
            )
            db.add(u)
        with pytest.raises(svc.OAuthEmailConflict):
            with db.begin():
                svc.find_or_create_user(
                    db, provider="google", subject="google-sub-3",
                    email=email, name="Attacker",
                )
    finally:
        _cleanup(db, [email])
        db.close()


def test_refuses_disabled_user_via_identity():
    db = SessionLocal()
    email = "oauth-disabled@example.com"
    _cleanup(db, [email])
    try:
        with db.begin():
            _, user = svc.find_or_create_user(
                db, provider="google", subject="google-sub-4",
                email=email, name="Was Active",
            )
            user.status = "disabled"
        with pytest.raises(svc.OAuthUserDisabled):
            with db.begin():
                svc.find_or_create_user(
                    db, provider="google", subject="google-sub-4",
                    email=email, name="Disabled now",
                )
    finally:
        _cleanup(db, [email])
        db.close()


# ---- attach_to_existing ----

def test_attach_to_existing_adds_identity_when_no_conflict():
    db = SessionLocal()
    email = "attach-1@example.com"
    _cleanup(db, [email])
    try:
        with db.begin():
            _, user = svc.find_or_create_user(
                db, provider="google", subject="g-1",
                email=email, name="X",
            )
            uid = user.id
        with db.begin():
            attached = svc.attach_to_existing(
                db, user_id=uid, provider="github",
                subject="gh-1", email=email,
            )
        assert attached.id == uid
        db.refresh(attached)
        assert {i.provider for i in attached.oauth_identities} == {"google", "github"}
    finally:
        _cleanup(db, [email])
        db.close()


def test_attach_to_existing_idempotent_for_same_user():
    db = SessionLocal()
    email = "attach-2@example.com"
    _cleanup(db, [email])
    try:
        with db.begin():
            _, user = svc.find_or_create_user(
                db, provider="google", subject="g-2",
                email=email, name="X",
            )
            uid = user.id
        with db.begin():
            svc.attach_to_existing(db, user_id=uid, provider="github",
                                   subject="gh-2", email=email)
        with db.begin():
            svc.attach_to_existing(db, user_id=uid, provider="github",
                                   subject="gh-2", email=email)
        u = db.query(User).filter_by(id=uid).one()
        assert len([i for i in u.oauth_identities if i.provider == "github"]) == 1
    finally:
        _cleanup(db, [email])
        db.close()


def test_attach_to_existing_rejects_provider_in_use_by_other_user():
    db = SessionLocal()
    emails = ["attach-3a@example.com", "attach-3b@example.com"]
    _cleanup(db, emails)
    try:
        with db.begin():
            _, u1 = svc.find_or_create_user(
                db, provider="github", subject="gh-3",
                email=emails[0], name="A",
            )
            _, u2 = svc.find_or_create_user(
                db, provider="google", subject="g-3",
                email=emails[1], name="B",
            )
            u1_id, u2_id = u1.id, u2.id
        with pytest.raises(svc.OAuthProviderInUse):
            with db.begin():
                svc.attach_to_existing(
                    db, user_id=u2_id, provider="github",
                    subject="gh-3", email=emails[1],
                )
    finally:
        _cleanup(db, emails)
        db.close()


def test_attach_sets_email_verified_when_matches_and_was_null():
    db = SessionLocal()
    email = "attach-verify@example.com"
    _cleanup(db, [email])
    try:
        with db.begin():
            u = User(email=email, password_hash="x", role="user",
                    status="active", balance=Decimal("0"),
                    email_verified_at=None)
            db.add(u); db.flush()
            uid = u.id
        with db.begin():
            svc.attach_to_existing(db, user_id=uid, provider="github",
                                   subject="gh-verify", email=email)
        u = db.query(User).filter_by(id=uid).one()
        assert u.email_verified_at is not None
    finally:
        _cleanup(db, [email])
        db.close()


# ---- detach ----

def test_detach_fails_when_last_login_method_oauth_only():
    db = SessionLocal()
    email = "detach-last@example.com"
    _cleanup(db, [email])
    try:
        with db.begin():
            _, user = svc.find_or_create_user(
                db, provider="google", subject="g-last",
                email=email, name="X",
            )
            iid = user.oauth_identities[0].id
            uid = user.id
        with pytest.raises(svc.OAuthCannotDetachLast):
            with db.begin():
                svc.detach(db, user_id=uid, identity_id=iid)
    finally:
        _cleanup(db, [email])
        db.close()


def test_detach_succeeds_when_password_exists():
    db = SessionLocal()
    email = "detach-with-pwd@example.com"
    _cleanup(db, [email])
    try:
        with db.begin():
            _, user = svc.find_or_create_user(
                db, provider="google", subject="g-pwd",
                email=email, name="X",
            )
            user.password_hash = "bcrypt-something"
            iid = user.oauth_identities[0].id
            uid = user.id
        with db.begin():
            svc.detach(db, user_id=uid, identity_id=iid)
        u = db.query(User).filter_by(id=uid).one()
        assert len(u.oauth_identities) == 0
    finally:
        _cleanup(db, [email])
        db.close()


def test_detach_succeeds_when_other_identity_remains():
    db = SessionLocal()
    email = "detach-other-id@example.com"
    _cleanup(db, [email])
    try:
        with db.begin():
            _, user = svc.find_or_create_user(
                db, provider="google", subject="g-other",
                email=email, name="X",
            )
            uid = user.id
            iid = user.oauth_identities[0].id
        with db.begin():
            svc.attach_to_existing(db, user_id=uid, provider="github",
                                   subject="gh-other", email=email)
        with db.begin():
            svc.detach(db, user_id=uid, identity_id=iid)
        u = db.query(User).filter_by(id=uid).one()
        assert {i.provider for i in u.oauth_identities} == {"github"}
    finally:
        _cleanup(db, [email])
        db.close()
