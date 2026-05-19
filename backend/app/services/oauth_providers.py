"""OAuth provider registration with Authlib.

Each provider has:
- A registered Authlib client(for token exchange / id_token validation)
- A `fetch_profile` async callable returning normalized {sub, email, email_verified, name}
- A boolean `configured`(env vars present)
"""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from authlib.integrations.httpx_client import AsyncOAuth2Client

from ..config import get_settings

settings = get_settings()


@dataclass(frozen=True)
class NormalizedProfile:
    sub: str
    email: str
    email_verified: bool
    name: str | None


UserinfoFetcher = Callable[[AsyncOAuth2Client, dict], Awaitable[NormalizedProfile]]


class OAuthError(Exception):
    """Raised when OAuth flow fails."""


@dataclass(frozen=True)
class ProviderConfig:
    name: str
    authorize_url: str
    token_url: str
    scope: str
    fetch_profile: UserinfoFetcher
    client_id: str | None
    client_secret: str | None

    @property
    def configured(self) -> bool:
        return bool(self.client_id and self.client_secret)

    def redirect_uri(self) -> str:
        base = (settings.oauth_backend_base_url or "http://localhost:8000").rstrip("/")
        return f"{base}/api/auth/oauth/{self.name}/callback"


_JWKS_CACHE: dict[str, tuple[float, Any]] = {}  # url -> (expires_at_monotonic, jwks)
_JWKS_TTL_SECONDS = 3600  # 1h — Google rotates on days, not requests
_JWKS_LOCK = asyncio.Lock()


async def _fetch_jwks_cached(url: str) -> Any:
    """Cache JWKS for `_JWKS_TTL_SECONDS`. Lazily refreshes on expiry.

    Concurrent callers race on first miss; the lock keeps only one network
    fetch in flight at a time.
    """
    from authlib.jose import JsonWebKey
    import httpx

    now = time.monotonic()
    cached = _JWKS_CACHE.get(url)
    if cached and cached[0] > now:
        return cached[1]

    async with _JWKS_LOCK:
        # Double-check after acquiring lock
        cached = _JWKS_CACHE.get(url)
        if cached and cached[0] > time.monotonic():
            return cached[1]
        async with httpx.AsyncClient(timeout=5.0) as h:
            resp = await h.get(url)
            resp.raise_for_status()
            jwks = JsonWebKey.import_key_set(resp.json())
        _JWKS_CACHE[url] = (time.monotonic() + _JWKS_TTL_SECONDS, jwks)
        return jwks


async def _google_profile(client: AsyncOAuth2Client, token: dict) -> NormalizedProfile:
    from authlib.jose import jwt

    id_token = token.get("id_token")
    if not id_token:
        raise OAuthError("google id_token missing in token response")

    jwks = await _fetch_jwks_cached("https://www.googleapis.com/oauth2/v3/certs")

    claims = jwt.decode(
        id_token,
        jwks,
        claims_options={
            "iss": {"essential": True, "values": [
                "https://accounts.google.com",
                "accounts.google.com",
            ]},
            "aud": {"essential": True, "value": settings.google_oauth_client_id},
            "exp": {"essential": True},
        },
    )
    claims.validate()

    return NormalizedProfile(
        sub=str(claims["sub"]),
        email=claims.get("email", "").lower(),
        email_verified=bool(claims.get("email_verified", False)),
        name=claims.get("name"),
    )


async def _github_profile(client: AsyncOAuth2Client, token: dict) -> NormalizedProfile:
    import httpx

    access = token.get("access_token")
    if not access:
        raise OAuthError("github access_token missing in token response")

    async with httpx.AsyncClient(
        timeout=5.0,
        headers={
            "Authorization": f"Bearer {access}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    ) as h:
        user_resp, emails_resp = await asyncio.gather(
            h.get("https://api.github.com/user"),
            h.get("https://api.github.com/user/emails"),
        )
        user_resp.raise_for_status()
        emails_resp.raise_for_status()
        user = user_resp.json()
        emails = emails_resp.json()

    primary_verified = next(
        (e for e in emails if e.get("primary") and e.get("verified")),
        None,
    )
    if not primary_verified:
        return NormalizedProfile(
            sub=str(user["id"]),
            email=(user.get("email") or "").lower(),
            email_verified=False,
            name=user.get("name") or user.get("login"),
        )

    return NormalizedProfile(
        sub=str(user["id"]),
        email=primary_verified["email"].lower(),
        email_verified=True,
        name=user.get("name") or user.get("login"),
    )


OAUTH_PROVIDERS: dict[str, ProviderConfig] = {
    "google": ProviderConfig(
        name="google",
        authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
        token_url="https://oauth2.googleapis.com/token",
        scope="openid email profile",
        fetch_profile=_google_profile,
        client_id=settings.google_oauth_client_id,
        client_secret=settings.google_oauth_client_secret,
    ),
    "github": ProviderConfig(
        name="github",
        authorize_url="https://github.com/login/oauth/authorize",
        token_url="https://github.com/login/oauth/access_token",
        scope="read:user user:email",
        fetch_profile=_github_profile,
        client_id=settings.github_oauth_client_id,
        client_secret=settings.github_oauth_client_secret,
    ),
}


def get_provider(name: str) -> ProviderConfig | None:
    p = OAUTH_PROVIDERS.get(name)
    if p is None or not p.configured:
        return None
    return p


def make_oauth_client(p: ProviderConfig) -> AsyncOAuth2Client:
    return AsyncOAuth2Client(
        client_id=p.client_id,
        client_secret=p.client_secret,
        scope=p.scope,
        token_endpoint=p.token_url,
    )
