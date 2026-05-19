"""UserOut 加 has_password 和 email_verified_at 字段。"""
from datetime import datetime, timezone
from decimal import Decimal

from app.models import User
from app.schemas.auth import UserOut


def test_user_out_includes_has_password_true_when_hash_set():
    u = User(
        id=1, email="a@b.com", password_hash="bcrypt-hash",
        role="user", status="active", balance=Decimal("0"),
        created_at=datetime.now(timezone.utc),
    )
    out = UserOut.model_validate(u)
    assert out.has_password is True


def test_user_out_includes_has_password_false_when_hash_none():
    u = User(
        id=1, email="a@b.com", password_hash=None,
        role="user", status="active", balance=Decimal("0"),
        created_at=datetime.now(timezone.utc),
    )
    out = UserOut.model_validate(u)
    assert out.has_password is False


def test_user_out_includes_email_verified_at():
    verified_at = datetime.now(timezone.utc)
    u = User(
        id=1, email="a@b.com", password_hash="x",
        role="user", status="active", balance=Decimal("0"),
        email_verified_at=verified_at,
        created_at=datetime.now(timezone.utc),
    )
    out = UserOut.model_validate(u)
    assert out.email_verified_at == verified_at
