"""OAuth login/link routes.

- GET  /api/auth/oauth/providers
- GET  /api/auth/oauth/{provider}/start
- GET  /api/auth/oauth/{provider}/callback     (Phase 4 part 2)
- POST /api/auth/oauth/exchange                (Phase 4 part 2)
- POST /api/auth/oauth/{provider}/link/start   (Phase 4 part 2)
"""
from __future__ import annotations

from fastapi import APIRouter

from ..schemas.oauth import OAuthProvidersStatus
from ..services.oauth_providers import OAUTH_PROVIDERS

router = APIRouter(prefix="/api/auth/oauth", tags=["oauth"])


@router.get("/providers", response_model=OAuthProvidersStatus)
def providers() -> OAuthProvidersStatus:
    return OAuthProvidersStatus(
        google=OAUTH_PROVIDERS["google"].configured,
        github=OAUTH_PROVIDERS["github"].configured,
    )
