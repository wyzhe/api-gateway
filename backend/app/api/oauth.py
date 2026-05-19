"""OAuth login/link routes.

- GET  /api/auth/oauth/providers
- GET  /api/auth/oauth/{provider}/start
- GET  /api/auth/oauth/{provider}/callback     (Phase 4 part 2)
- POST /api/auth/oauth/exchange                (Phase 4 part 2)
- POST /api/auth/oauth/{provider}/link/start   (Phase 4 part 2)
"""
from __future__ import annotations

import base64
import hashlib
from urllib.parse import urlencode, urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from ..config import get_settings
from ..deps import get_db
from ..logging_config import get_logger
from ..metrics import auth_oauth_total
from ..models import AuditLog
from ..schemas.oauth import OAuthProvidersStatus
from ..services import oauth_linking_service, oauth_state_service
from ..services.oauth_providers import (
    OAUTH_PROVIDERS,
    NormalizedProfile,
    make_oauth_client,
)

router = APIRouter(prefix="/api/auth/oauth", tags=["oauth"])

settings = get_settings()
log = get_logger(__name__)


@router.get("/providers", response_model=OAuthProvidersStatus)
def providers() -> OAuthProvidersStatus:
    return OAuthProvidersStatus(
        google=OAUTH_PROVIDERS["google"].configured,
        github=OAUTH_PROVIDERS["github"].configured,
    )


def _safe_return_to(raw: str | None) -> str:
    """Open redirect 防护:仅允许同源相对路径。"""
    if not raw:
        return "/"
    try:
        u = urlparse(raw)
    except ValueError:
        return "/"
    if u.scheme or u.netloc:
        return "/"
    if not raw.startswith("/") or raw.startswith("//"):
        return "/"
    return raw


def _pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def _frontend_url(path: str) -> str:
    base = (settings.oauth_frontend_base_url or "http://localhost:5173").rstrip("/")
    return f"{base}{path}"


def _audit(
    db: Session,
    action: str,
    *,
    target_id: int | None = None,
    actor_user_id: int | None = None,
) -> None:
    """Insert AuditLog row. Caller commits."""
    db.add(AuditLog(
        actor_user_id=actor_user_id,
        action=action,
        target_type="user" if target_id is not None else "system",
        target_id=str(target_id) if target_id is not None else None,
    ))


async def _handle_callback_fetch(p, code: str, code_verifier: str) -> NormalizedProfile:
    """Separate function so tests can monkeypatch it."""
    client_ = make_oauth_client(p)
    try:
        token = await client_.fetch_token(
            url=p.token_url,
            authorization_response=None,
            code=code,
            redirect_uri=p.redirect_uri(),
            code_verifier=code_verifier,
        )
    finally:
        await client_.aclose()
    return await p.fetch_profile(client_, token)


def _set_exchange_cookie(resp: Response, value: str, *, max_age: int) -> None:
    """Set the `oauth_exchange` cookie with `SameSite=Strict` (title-case).

    Starlette emits `samesite=strict` (lowercase value); we hand-build the
    header so the spec's normative `SameSite=Strict` capitalization is honored.
    """
    parts = [
        f"oauth_exchange={value}",
        "HttpOnly",
        f"Max-Age={max_age}",
        "Path=/api/auth/oauth/exchange",
        "SameSite=Strict",
    ]
    if settings.is_production:
        parts.append("Secure")
    resp.raw_headers.append((b"set-cookie", "; ".join(parts).encode("ascii")))


@router.get("/{provider}/start")
async def start(provider: str, request: Request) -> RedirectResponse:
    p = OAUTH_PROVIDERS.get(provider)
    if p is None or not p.configured:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    return_to = _safe_return_to(request.query_params.get("return_to"))
    state = oauth_state_service.new_token()
    verifier = oauth_state_service.new_token(64)
    challenge = _pkce_challenge(verifier)

    await oauth_state_service.put_state(
        state,
        provider=provider,
        return_to=return_to,
        code_verifier=verifier,
        mode="login",
    )

    qs = urlencode({
        "response_type": "code",
        "client_id": p.client_id,
        "scope": p.scope,
        "redirect_uri": p.redirect_uri(),
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    })
    return RedirectResponse(url=f"{p.authorize_url}?{qs}", status_code=302)


@router.get("/{provider}/callback")
async def callback(
    provider: str,
    request: Request,
    db: Session = Depends(get_db),
) -> RedirectResponse:
    p = OAUTH_PROVIDERS.get(provider)
    if p is None or not p.configured:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    code = request.query_params.get("code")
    state = request.query_params.get("state")
    if not code or not state:
        return RedirectResponse(_frontend_url("/login?error=state_expired"), status_code=302)

    state_data = await oauth_state_service.consume_state(state)
    if not state_data or state_data.get("provider") != provider:
        _audit(db, "oauth_state_mismatch")
        db.commit()
        auth_oauth_total.labels(provider=provider, outcome="error_state").inc()
        return RedirectResponse(_frontend_url("/login?error=state_expired"), status_code=302)

    mode = state_data.get("mode", "login")
    return_to = state_data.get("return_to", "/")
    code_verifier = state_data["code_verifier"]

    try:
        profile = await _handle_callback_fetch(p, code, code_verifier)
    except Exception as e:
        log.warning("oauth_upstream_failed", provider=provider, err=str(e))
        auth_oauth_total.labels(provider=provider, outcome="error_upstream").inc()
        return RedirectResponse(_frontend_url("/login?error=upstream_failure"), status_code=302)

    if not profile.email_verified:
        _audit(db, "oauth_unverified_email")
        db.commit()
        auth_oauth_total.labels(provider=provider, outcome="error_email").inc()
        return RedirectResponse(_frontend_url("/login?error=email_unverified"), status_code=302)

    # link mode
    if mode == "link":
        linker_id = state_data.get("linker_user_id")
        if not linker_id:
            return RedirectResponse(
                _frontend_url("/settings/connections?error=state_expired"),
                status_code=302,
            )
        try:
            with db.begin():
                oauth_linking_service.attach_to_existing(
                    db, user_id=linker_id, provider=provider,
                    subject=profile.sub, email=profile.email,
                )
            _audit(db, "oauth_link", target_id=linker_id, actor_user_id=linker_id)
            db.commit()
            auth_oauth_total.labels(provider=provider, outcome="link").inc()
            return RedirectResponse(
                _frontend_url(f"/settings/connections?linked={provider}"),
                status_code=302,
            )
        except oauth_linking_service.OAuthProviderInUse:
            _audit(db, "oauth_provider_in_use", target_id=linker_id, actor_user_id=linker_id)
            db.commit()
            auth_oauth_total.labels(provider=provider, outcome="error_in_use").inc()
            return RedirectResponse(
                _frontend_url("/settings/connections?error=provider_in_use"),
                status_code=302,
            )

    # login mode
    try:
        with db.begin():
            outcome, user = oauth_linking_service.find_or_create_user(
                db, provider=provider, subject=profile.sub,
                email=profile.email, name=profile.name,
            )
        action = {"signup": "oauth_signup", "login": "oauth_login", "link": "oauth_link"}[outcome]
        _audit(db, action, target_id=user.id, actor_user_id=user.id)
        db.commit()
    except oauth_linking_service.OAuthEmailConflict:
        _audit(db, "oauth_email_conflict")
        db.commit()
        auth_oauth_total.labels(provider=provider, outcome="error_conflict").inc()
        return RedirectResponse(
            _frontend_url("/login?error=email_already_registered"),
            status_code=302,
        )
    except oauth_linking_service.OAuthUserDisabled:
        auth_oauth_total.labels(provider=provider, outcome="error_disabled").inc()
        return RedirectResponse(
            _frontend_url("/login?error=account_disabled"),
            status_code=302,
        )

    auth_oauth_total.labels(provider=provider, outcome=outcome).inc()

    exchange_code = await oauth_state_service.put_exchange_code(user.id)

    resp = RedirectResponse(
        _frontend_url(f"/auth/oauth/complete?return_to={return_to}"),
        status_code=302,
    )
    _set_exchange_cookie(resp, exchange_code, max_age=60)
    return resp
