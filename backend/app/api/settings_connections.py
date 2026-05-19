"""User-facing settings endpoints for managing linked OAuth identities."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db
from ..models import User
from ..schemas.oauth import OAuthIdentityOut
from ..services import audit_service, oauth_linking_service

router = APIRouter(prefix="/api/settings/connections", tags=["settings"])


def _ip(request: Request) -> str | None:
    fwd = request.headers.get("X-Forwarded-For")
    if fwd:
        return fwd.split(",")[0].strip()[:64]
    if request.client is None:
        return None
    return request.client.host


@router.get("", response_model=list[OAuthIdentityOut])
def list_connections(user: User = Depends(get_current_user)) -> list[OAuthIdentityOut]:
    return [OAuthIdentityOut.model_validate(i) for i in user.oauth_identities]


@router.delete("/{identity_id}", status_code=204)
def detach(
    identity_id: int,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    try:
        oauth_linking_service.detach(db, user_id=user.id, identity_id=identity_id)
    except oauth_linking_service.OAuthIdentityNotFound:
        raise HTTPException(status_code=404, detail="identity not found")
    except oauth_linking_service.OAuthCannotDetachLast:
        raise HTTPException(
            status_code=409,
            detail=(
                "Cannot detach the last login method. "
                "Set a password first or link another provider."
            ),
        )
    audit_service.record(
        db,
        actor_user_id=user.id,
        action="oauth_unlink",
        target_type="user",
        target_id=user.id,
        before={"identity_id": identity_id},
        after=None,
        ip=_ip(request),
    )
    db.commit()
    return None
