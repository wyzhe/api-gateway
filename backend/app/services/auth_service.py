"""Refresh-token issue / rotate / revoke.

Refresh tokens are opaque (`rft_*`), stored as sha256(plaintext) in DB. Rotation
on each successful refresh: the old token is marked revoked and the new one
is created in the same transaction.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import RefreshToken
from ..security import generate_refresh_token, hash_refresh_token


def issue_refresh_token(
    db: Session, *, user_id: int, user_agent: str | None = None, ip: str | None = None,
    replaces_id: int | None = None,
) -> tuple[str, RefreshToken]:
    plain, h, exp = generate_refresh_token()
    row = RefreshToken(
        user_id=user_id,
        token_hash=h,
        expires_at=exp,
        user_agent=user_agent,
        ip=ip,
        replaced_by_id=None,
    )
    db.add(row)
    db.flush()
    if replaces_id is not None:
        old = db.get(RefreshToken, replaces_id)
        if old is not None and old.revoked_at is None:
            old.revoked_at = datetime.now(timezone.utc)
            old.replaced_by_id = row.id
    db.commit()
    db.refresh(row)
    return plain, row


def consume_and_rotate(
    db: Session, *, presented_plain: str, user_agent: str | None = None, ip: str | None = None,
) -> tuple[str, RefreshToken] | None:
    """Look up + revoke + issue a new pair atomically. Returns (new_plain, new_row)
    or None on invalid/expired/revoked token."""
    h = hash_refresh_token(presented_plain)
    stmt = select(RefreshToken).where(RefreshToken.token_hash == h).with_for_update()
    row = db.execute(stmt).scalar_one_or_none()
    if row is None:
        return None
    now = datetime.now(timezone.utc)
    if row.revoked_at is not None:
        return None
    if row.expires_at <= now:
        return None
    # Mint + rotate.
    new_plain, new_h, new_exp = generate_refresh_token()
    new_row = RefreshToken(
        user_id=row.user_id,
        token_hash=new_h,
        expires_at=new_exp,
        user_agent=user_agent,
        ip=ip,
    )
    db.add(new_row)
    db.flush()
    row.revoked_at = now
    row.replaced_by_id = new_row.id
    db.commit()
    db.refresh(new_row)
    return new_plain, new_row


def revoke(db: Session, presented_plain: str) -> bool:
    h = hash_refresh_token(presented_plain)
    row = db.query(RefreshToken).filter(RefreshToken.token_hash == h).one_or_none()
    if not row or row.revoked_at is not None:
        return False
    row.revoked_at = datetime.now(timezone.utc)
    db.commit()
    return True


def revoke_all_for_user(db: Session, user_id: int) -> int:
    rows = (
        db.query(RefreshToken)
        .filter(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .all()
    )
    now = datetime.now(timezone.utc)
    for r in rows:
        r.revoked_at = now
    db.commit()
    return len(rows)
