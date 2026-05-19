"""Find / create / link / detach OAuth identities, with safety guards.

Account pre-hijacking guard: only auto-link to existing User when
User.email_verified_at IS NOT NULL. Otherwise raise OAuthEmailConflict.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import OAuthIdentity, User


Outcome = Literal["signup", "login", "link"]


class OAuthEmailConflict(Exception):
    def __init__(self, email: str):
        super().__init__(f"email {email!r} owned by an unverified existing user")
        self.email = email


class OAuthUserDisabled(Exception):
    def __init__(self, user_id: int):
        super().__init__(f"user {user_id} is disabled")
        self.user_id = user_id


class OAuthProviderInUse(Exception):
    def __init__(self, provider: str):
        super().__init__(f"{provider} identity already bound to a different user")
        self.provider = provider


class OAuthIdentityNotFound(Exception):
    pass


class OAuthCannotDetachLast(Exception):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def find_or_create_user(
    db: Session,
    *,
    provider: str,
    subject: str,
    email: str,
    name: str | None,
) -> tuple[Outcome, User]:
    email = email.lower()

    identity = (
        db.query(OAuthIdentity)
          .filter_by(provider=provider, provider_subject=subject)
          .with_for_update()
          .one_or_none()
    )
    if identity is not None:
        if identity.user.status != "active":
            raise OAuthUserDisabled(identity.user_id)
        identity.last_login_at = _now()
        return ("login", identity.user)

    user = (
        db.query(User).filter_by(email=email)
          .with_for_update()
          .one_or_none()
    )
    if user is not None:
        if user.email_verified_at is None:
            raise OAuthEmailConflict(email)
        if user.status != "active":
            raise OAuthUserDisabled(user.id)
        db.add(OAuthIdentity(
            user_id=user.id,
            provider=provider,
            provider_subject=subject,
            last_login_at=_now(),
        ))
        return ("link", user)

    user = User(
        email=email,
        password_hash=None,
        display_name=name,
        role="user",
        status="active",
        balance=Decimal("0"),
        email_verified_at=_now(),
    )
    db.add(user)
    db.flush()
    db.add(OAuthIdentity(
        user_id=user.id,
        provider=provider,
        provider_subject=subject,
        last_login_at=_now(),
    ))
    return ("signup", user)
