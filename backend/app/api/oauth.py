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

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import RedirectResponse

from ..config import get_settings
from ..schemas.oauth import OAuthProvidersStatus
from ..services import oauth_state_service
from ..services.oauth_providers import OAUTH_PROVIDERS

router = APIRouter(prefix="/api/auth/oauth", tags=["oauth"])

settings = get_settings()


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
