"""User 模型新增 email_verified_at + oauth_identities relationship + password_hash nullable."""
from datetime import datetime, timezone
from decimal import Decimal

from app.database import SessionLocal
from app.models import OAuthIdentity, User
from tests.conftest import _db_reachable

import pytest


pytestmark = pytest.mark.skipif(not _db_reachable(), reason="Postgres not reachable")


def test_user_email_verified_at_defaults_null():
    db = SessionLocal()
    try:
        u = User(
            email="t-email-verified@example.com",
            password_hash="x",
            role="user",
            status="active",
            balance=Decimal("0"),
        )
        db.add(u)
        db.flush()
        assert u.email_verified_at is None
        db.rollback()
    finally:
        db.close()


def test_user_password_hash_nullable():
    db = SessionLocal()
    try:
        u = User(
            email="t-no-password@example.com",
            password_hash=None,
            role="user",
            status="active",
            balance=Decimal("0"),
        )
        db.add(u)
        db.flush()
        assert u.password_hash is None
        db.rollback()
    finally:
        db.close()


def test_user_has_oauth_identities_relationship():
    db = SessionLocal()
    try:
        u = User(
            email="t-oauth-rel@example.com",
            password_hash=None,
            role="user",
            status="active",
            balance=Decimal("0"),
            email_verified_at=datetime.now(timezone.utc),
        )
        db.add(u); db.flush()
        identity = OAuthIdentity(
            user_id=u.id,
            provider="google",
            provider_subject="sub-12345",
        )
        db.add(identity); db.flush()
        db.refresh(u)
        assert len(u.oauth_identities) == 1
        assert u.oauth_identities[0].provider == "google"
        db.rollback()
    finally:
        db.close()
