from collections.abc import Generator

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from .database import SessionLocal
from .models import ApiKey, User
from .security import decode_access_token, hash_api_key


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def client_ip(request: Request) -> str | None:
    """Extract client IP, honoring ``X-Forwarded-For`` for proxied requests.

    Returns the first forwarded hop trimmed to 64 chars, or the direct peer
    address. Returns ``None`` when neither is available (e.g. ASGI test
    contexts without a client tuple).
    """
    fwd = request.headers.get("X-Forwarded-For")
    if fwd:
        first = fwd.split(",")[0].strip()[:64]
        return first or None
    if request.client is None:
        return None
    return request.client.host


def _unauthorized(detail: str = "Not authenticated") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise _unauthorized()
    token = authorization.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    if not payload:
        raise _unauthorized("Invalid or expired token")
    sub = payload.get("sub")
    if not sub:
        raise _unauthorized()
    try:
        user_id = int(sub)
    except ValueError:
        raise _unauthorized()
    user = db.get(User, user_id)
    if not user or user.status != "active":
        raise _unauthorized("User inactive or not found")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")
    return user


def get_api_key_user(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> tuple[User, ApiKey]:
    """For /v1/* gateway endpoints. Validates user API key (sk-...)."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Bearer API key",
            headers={"WWW-Authenticate": "Bearer"},
        )
    presented = authorization.split(" ", 1)[1].strip()
    if not presented.startswith("sk-"):
        raise HTTPException(status_code=401, detail="Invalid API key format")
    key_hash = hash_api_key(presented)
    api_key = db.query(ApiKey).filter(ApiKey.key_hash == key_hash).one_or_none()
    if not api_key or api_key.status != "active":
        raise HTTPException(status_code=401, detail="Invalid or disabled API key")
    user = db.get(User, api_key.user_id)
    if not user or user.status != "active":
        raise HTTPException(status_code=403, detail="User account inactive")
    return user, api_key
