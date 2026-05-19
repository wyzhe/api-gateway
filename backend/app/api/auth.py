from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from ..config import get_settings
from ..deps import get_current_user, get_db
from ..logging_config import get_logger
from ..metrics import auth_logins_total, auth_password_changes_total
from ..models import AuditLog, RefreshToken, User
from ..rate_limit import make_limiter
from ..schemas.auth import (
    LoginRequest,
    LoginResponse,
    PasswordChangeRequest,
    PasswordChangeResponse,
    RefreshRequest,
    RefreshResponse,
    UserOut,
)
from ..security import create_access_token, hash_password, verify_password
from ..services import auth_service, password_policy_service

router = APIRouter(prefix="/api/auth", tags=["auth"])
log = get_logger(__name__)
settings = get_settings()


_login_limiter = make_limiter(settings.rate_limit_login_per_15m, seconds=15 * 60)
_refresh_limiter = make_limiter(settings.rate_limit_refresh_per_hour, seconds=3600)


def _access_expires_in() -> int:
    return settings.jwt_access_ttl_minutes * 60


@router.post("/login", response_model=LoginResponse, dependencies=[Depends(_login_limiter)])
def login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
    user_agent: str | None = Header(default=None, alias="User-Agent"),
) -> LoginResponse:
    user = db.query(User).filter(User.email == payload.email.lower()).one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        auth_logins_total.labels(outcome="bad_creds").inc()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if user.status != "active":
        auth_logins_total.labels(outcome="disabled").inc()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User disabled")
    access = create_access_token(str(user.id), extra={"role": user.role})
    refresh, _ = auth_service.issue_refresh_token(
        db, user_id=user.id,
        user_agent=(user_agent or "")[:255] or None,
        ip=_client_ip(request),
    )
    auth_logins_total.labels(outcome="ok").inc()
    log.info("login_ok", user_id=user.id)
    return LoginResponse(
        access_token=access,
        refresh_token=refresh,
        access_expires_in=_access_expires_in(),
        user=UserOut.model_validate(user),
    )


@router.post(
    "/refresh",
    response_model=RefreshResponse,
    dependencies=[Depends(_refresh_limiter)],
)
def refresh(
    payload: RefreshRequest,
    request: Request,
    db: Session = Depends(get_db),
    user_agent: str | None = Header(default=None, alias="User-Agent"),
) -> RefreshResponse:
    rotated = auth_service.consume_and_rotate(
        db,
        presented_plain=payload.refresh_token,
        user_agent=(user_agent or "")[:255] or None,
        ip=_client_ip(request),
    )
    if rotated is None:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
    new_plain, new_row = rotated
    user = db.get(User, new_row.user_id)
    if not user or user.status != "active":
        raise HTTPException(status_code=403, detail="User inactive")
    access = create_access_token(str(user.id), extra={"role": user.role})
    return RefreshResponse(
        access_token=access,
        refresh_token=new_plain,
        access_expires_in=_access_expires_in(),
    )


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)


@router.post("/logout")
def logout(
    payload: RefreshRequest | None = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> dict[str, bool]:
    """Revoke the presented refresh token. Access tokens are short-lived; clients
    should also drop them on logout."""
    if payload is not None and payload.refresh_token:
        auth_service.revoke(db, payload.refresh_token)
    return {"ok": True}


def _client_ip(request: Request) -> str | None:
    fwd = request.headers.get("X-Forwarded-For")
    if fwd:
        return fwd.split(",")[0].strip()[:64]
    if request.client is None:
        return None
    return request.client.host


_password_limiter_jwt = make_limiter(5, seconds=60)
_password_limiter_ip = make_limiter(10, seconds=60)


@router.post(
    "/me/password",
    response_model=PasswordChangeResponse,
    dependencies=[Depends(_password_limiter_jwt), Depends(_password_limiter_ip)],
)
def change_password(
    payload: PasswordChangeRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    user_agent: str | None = Header(default=None, alias="User-Agent"),
) -> PasswordChangeResponse:
    password_was_null = user.password_hash is None

    if not password_was_null:
        if not payload.current_password:
            raise HTTPException(400, "current_password required")
        if not verify_password(payload.current_password, user.password_hash):
            raise HTTPException(401, "current_password incorrect")

    err = password_policy_service.validate_password(payload.new_password, email=user.email)
    if err is not None:
        raise HTTPException(422, detail=f"password_rejected:{err}")

    user.password_hash = hash_password(payload.new_password)
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id).delete()
    db.add(AuditLog(
        actor_user_id=user.id,
        action=("password_set" if password_was_null else "password_changed"),
        target_type="user", target_id=str(user.id),
    ))
    db.commit()

    access = create_access_token(str(user.id), extra={"role": user.role})
    refresh, _ = auth_service.issue_refresh_token(
        db, user_id=user.id,
        user_agent=(user_agent or "")[:255] or None,
        ip=_client_ip(request),
    )

    auth_password_changes_total.labels(
        kind=("set" if password_was_null else "changed"),
    ).inc()
    log.info(
        "password_change_ok",
        user_id=user.id,
        kind=("set" if password_was_null else "changed"),
    )

    return PasswordChangeResponse(
        access_token=access,
        refresh_token=refresh,
        access_expires_in=_access_expires_in(),
    )
