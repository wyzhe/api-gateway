"""OAuth route integration tests."""
from fastapi.testclient import TestClient

import pytest

from app.main import app
from tests.conftest import _db_reachable, _redis_reachable

pytestmark = pytest.mark.skipif(
    not (_db_reachable() and _redis_reachable()),
    reason="needs Postgres + Redis",
)

client = TestClient(app, base_url="http://testserver")


@pytest.fixture(autouse=True)
def _reset_redis_client():
    """Drop the cached async Redis client between tests.

    `TestClient` spins a fresh asyncio loop per request, but `redis.asyncio`
    binds its connection to whichever loop first touched it. Reusing the
    cached client across tests then raises "Event loop is closed" on teardown.
    """
    from app import redis_client

    redis_client.set_redis_for_tests(None)
    yield
    redis_client.set_redis_for_tests(None)


def test_providers_endpoint_reports_unconfigured_when_no_env():
    r = client.get("/api/auth/oauth/providers")
    assert r.status_code == 200
    body = r.json()
    assert body == {"google": False, "github": False}


def test_providers_endpoint_reports_configured(monkeypatch):
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "abc")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_SECRET", "def")

    import importlib
    from app import config
    from app.services import oauth_providers

    config.get_settings.cache_clear()
    importlib.reload(oauth_providers)
    # also reload the api/oauth.py module so its OAUTH_PROVIDERS reference refreshes if needed
    try:
        from app.api import oauth as oauth_api
        importlib.reload(oauth_api)
    except ModuleNotFoundError:
        pass

    r = client.get("/api/auth/oauth/providers")
    assert r.status_code == 200
    body = r.json()
    assert body["google"] is True
    assert body["github"] is False

    monkeypatch.delenv("GOOGLE_OAUTH_CLIENT_ID")
    monkeypatch.delenv("GOOGLE_OAUTH_CLIENT_SECRET")
    config.get_settings.cache_clear()
    importlib.reload(oauth_providers)
    try:
        from app.api import oauth as oauth_api
        importlib.reload(oauth_api)
    except ModuleNotFoundError:
        pass


import base64
import hashlib
from urllib.parse import parse_qs, urlparse


def _set_google_configured(monkeypatch):
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "google-cid")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_SECRET", "google-csecret")
    monkeypatch.setenv("OAUTH_BACKEND_BASE_URL", "http://testserver")
    monkeypatch.setenv("OAUTH_FRONTEND_BASE_URL", "http://testserver")
    import importlib
    from app import config
    from app.services import oauth_providers
    from app.api import oauth as oauth_api
    config.get_settings.cache_clear()
    importlib.reload(oauth_providers)
    importlib.reload(oauth_api)


def test_start_returns_404_when_unconfigured():
    r = client.get("/api/auth/oauth/google/start", follow_redirects=False)
    assert r.status_code == 404


def test_start_redirects_to_provider_with_pkce_and_state(monkeypatch):
    _set_google_configured(monkeypatch)
    r = client.get("/api/auth/oauth/google/start?return_to=/dashboard",
                   follow_redirects=False)
    assert r.status_code in (302, 307)
    loc = r.headers["location"]
    qs = parse_qs(urlparse(loc).query)
    assert qs["client_id"] == ["google-cid"]
    assert qs["response_type"] == ["code"]
    assert qs["scope"][0] == "openid email profile"
    assert qs["code_challenge_method"] == ["S256"]
    assert "code_challenge" in qs
    assert qs["state"]
    assert qs["redirect_uri"][0].endswith("/api/auth/oauth/google/callback")


def test_start_validates_return_to_against_open_redirect(monkeypatch):
    _set_google_configured(monkeypatch)
    r = client.get("/api/auth/oauth/google/start?return_to=http://evil.com/x",
                   follow_redirects=False)
    assert r.status_code in (302, 307)


from app.services.oauth_providers import NormalizedProfile


def _stub_profile(monkeypatch, provider: str, profile: NormalizedProfile):
    async def fake_handle_callback(p, code, code_verifier):
        return profile
    monkeypatch.setattr(
        "app.api.oauth._handle_callback_fetch",
        fake_handle_callback,
    )


async def _seed_state(provider: str = "google", mode: str = "login",
                      linker_user_id: int | None = None) -> str:
    from app.services import oauth_state_service
    from app import redis_client
    state = oauth_state_service.new_token()
    await oauth_state_service.put_state(
        state, provider=provider, return_to="/", code_verifier="v",
        mode=mode, linker_user_id=linker_user_id,
    )
    # Close + drop cached client so the TestClient request handler creates a
    # fresh one bound to its own event loop.
    await redis_client.close_redis()
    return state


def test_callback_rejects_unknown_state(monkeypatch):
    _set_google_configured(monkeypatch)
    r = client.get("/api/auth/oauth/google/callback?code=x&state=does-not-exist",
                   follow_redirects=False)
    assert r.status_code in (302, 307)
    loc = r.headers["location"]
    assert "/login?error=state_expired" in loc


def test_callback_rejects_mismatched_provider_in_state(monkeypatch):
    import asyncio
    _set_google_configured(monkeypatch)
    state = asyncio.get_event_loop().run_until_complete(_seed_state(provider="github"))
    r = client.get(f"/api/auth/oauth/google/callback?code=x&state={state}",
                   follow_redirects=False)
    assert r.status_code in (302, 307)
    assert "error=state_expired" in r.headers["location"]


def test_callback_rejects_unverified_email(monkeypatch):
    import asyncio
    _set_google_configured(monkeypatch)
    _stub_profile(monkeypatch, "google", NormalizedProfile(
        sub="u-1", email="x@example.com", email_verified=False, name="X",
    ))
    state = asyncio.get_event_loop().run_until_complete(_seed_state())
    r = client.get(f"/api/auth/oauth/google/callback?code=x&state={state}",
                   follow_redirects=False)
    assert "error=email_unverified" in r.headers["location"]


def test_callback_signup_sets_exchange_cookie_and_redirects_to_frontend(monkeypatch):
    import asyncio
    _set_google_configured(monkeypatch)
    _stub_profile(monkeypatch, "google", NormalizedProfile(
        sub="signup-1", email="signup-1@example.com", email_verified=True, name="Sign",
    ))
    state = asyncio.get_event_loop().run_until_complete(_seed_state())
    r = client.get(f"/api/auth/oauth/google/callback?code=x&state={state}",
                   follow_redirects=False)
    assert r.status_code in (302, 307)
    loc = r.headers["location"]
    assert loc.startswith("http://testserver/auth/oauth/complete")
    assert "code=" not in loc  # exchange code 不进 URL
    cookies = r.headers.get_list("set-cookie")
    assert any(c.startswith("oauth_exchange=") for c in cookies)
    cookie_line = [c for c in cookies if c.startswith("oauth_exchange=")][0]
    assert "HttpOnly" in cookie_line
    assert "SameSite=Strict" in cookie_line.replace("samesite", "SameSite")
    assert "Path=/api/auth/oauth/exchange" in cookie_line
    assert "Max-Age=60" in cookie_line

    from app.database import SessionLocal
    from app.models import OAuthIdentity, User
    db = SessionLocal()
    try:
        db.query(OAuthIdentity).filter(
            OAuthIdentity.provider_subject == "signup-1"
        ).delete()
        db.query(User).filter(User.email == "signup-1@example.com").delete()
        db.commit()
    finally:
        db.close()


def test_exchange_401_when_no_cookie():
    r = client.post("/api/auth/oauth/exchange")
    assert r.status_code == 401


def test_exchange_returns_tokens_and_clears_cookie(monkeypatch):
    import asyncio
    from app.services import oauth_state_service
    from app import redis_client
    from app.database import SessionLocal
    from app.models import User
    from decimal import Decimal
    from datetime import datetime, timezone

    db = SessionLocal()
    email = "exchange-target@example.com"
    try:
        db.query(User).filter(User.email == email).delete()
        u = User(email=email, password_hash="x", role="user", status="active",
                 balance=Decimal("0"),
                 email_verified_at=datetime.now(timezone.utc))
        db.add(u); db.commit(); db.refresh(u)
        uid = u.id

        async def _put():
            code = await oauth_state_service.put_exchange_code(uid)
            await redis_client.close_redis()
            return code

        code = asyncio.get_event_loop().run_until_complete(_put())

        r = client.post(
            "/api/auth/oauth/exchange",
            cookies={"oauth_exchange": code},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["access_token"]
        assert body["refresh_token"]
        assert body["user"]["email"] == email

        cookies = r.headers.get_list("set-cookie")
        cleared = [c for c in cookies if c.startswith("oauth_exchange=")]
        assert cleared and "Max-Age=0" in cleared[0]
    finally:
        db.query(User).filter(User.email == email).delete()
        db.commit()
        db.close()


def test_exchange_401_when_code_already_used(monkeypatch):
    import asyncio
    from app.services import oauth_state_service
    from app import redis_client
    from app.database import SessionLocal
    from app.models import User
    from decimal import Decimal
    from datetime import datetime, timezone

    db = SessionLocal()
    email = "exchange-reuse@example.com"
    try:
        db.query(User).filter(User.email == email).delete()
        u = User(email=email, password_hash="x", role="user", status="active",
                 balance=Decimal("0"),
                 email_verified_at=datetime.now(timezone.utc))
        db.add(u); db.commit(); db.refresh(u)

        async def _put():
            code = await oauth_state_service.put_exchange_code(u.id)
            await redis_client.close_redis()
            return code

        code = asyncio.get_event_loop().run_until_complete(_put())
        assert client.post("/api/auth/oauth/exchange",
                           cookies={"oauth_exchange": code}).status_code == 200
        # Drop the cached Redis client between requests (each TestClient call
        # creates a fresh event loop; the cached async client would otherwise
        # bind to a dead loop).
        redis_client.set_redis_for_tests(None)
        assert client.post("/api/auth/oauth/exchange",
                           cookies={"oauth_exchange": code}).status_code == 401
    finally:
        db.query(User).filter(User.email == email).delete()
        db.commit()
        db.close()


def test_link_start_requires_jwt(monkeypatch):
    _set_google_configured(monkeypatch)
    r = client.post("/api/auth/oauth/google/link/start", json={"return_to": "/settings/connections"})
    assert r.status_code == 401


def test_link_start_returns_redirect_url_with_link_mode(monkeypatch, jwt):
    _set_google_configured(monkeypatch)
    r = client.post(
        "/api/auth/oauth/google/link/start",
        headers={"Authorization": f"Bearer {jwt}"},
        json={"return_to": "/settings/connections"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["redirect_url"].startswith("https://accounts.google.com/")
    qs = parse_qs(urlparse(body["redirect_url"]).query)
    assert qs["code_challenge_method"] == ["S256"]


def test_link_callback_attaches_identity_to_current_user(monkeypatch, jwt, test_user):
    import asyncio
    _set_google_configured(monkeypatch)
    _stub_profile(monkeypatch, "google", NormalizedProfile(
        sub="link-cb-1", email="alt-email@example.com",
        email_verified=True, name="Linker",
    ))
    state = asyncio.get_event_loop().run_until_complete(
        _seed_state(provider="google", mode="link", linker_user_id=test_user.id)
    )
    r = client.get(f"/api/auth/oauth/google/callback?code=x&state={state}",
                   follow_redirects=False)
    assert r.status_code in (302, 307)
    assert "/account?linked=google" in r.headers["location"]
    cookies = r.headers.get_list("set-cookie")
    assert not any(c.startswith("oauth_exchange=") and "Max-Age=60" in c for c in cookies)

    from app.database import SessionLocal
    from app.models import OAuthIdentity
    db = SessionLocal()
    try:
        db.query(OAuthIdentity).filter(OAuthIdentity.provider_subject == "link-cb-1").delete()
        db.commit()
    finally:
        db.close()


def test_callback_signup_blocked_after_ip_quota_reached(monkeypatch):
    import asyncio
    _set_google_configured(monkeypatch)

    # Force a low cap directly on the service's cached settings — reloading
    # would not update the live FastAPI route (its endpoint reference is
    # captured by the app at registration time).
    from app.services import abuse_mitigation_service
    monkeypatch.setattr(
        abuse_mitigation_service.settings, "signup_per_ip_per_day", 1
    )

    # Clear Redis counter for this test (then drop the cached client so the
    # next TestClient call binds Redis to a fresh event loop).
    from app import redis_client as _rc
    from app.redis_client import get_redis

    async def _clear_and_close():
        r = get_redis()
        await r.delete(f"signup_ip_count:testclient:{abuse_mitigation_service._today()}")
        await _rc.close_redis()

    asyncio.get_event_loop().run_until_complete(_clear_and_close())

    # 1st signup OK
    _stub_profile(monkeypatch, "google", NormalizedProfile(
        sub="quota-1", email="quota-1@example.com",
        email_verified=True, name="Q1",
    ))
    state1 = asyncio.get_event_loop().run_until_complete(_seed_state())
    r1 = client.get(f"/api/auth/oauth/google/callback?code=x&state={state1}",
                    follow_redirects=False)
    assert any(c.startswith("oauth_exchange=") for c in r1.headers.get_list("set-cookie")), r1.headers

    # Drop the cached Redis client so the next TestClient call binds Redis
    # to its own fresh event loop.
    _rc.set_redis_for_tests(None)

    # 2nd different email/sub — blocked
    _stub_profile(monkeypatch, "google", NormalizedProfile(
        sub="quota-2", email="quota-2@example.com",
        email_verified=True, name="Q2",
    ))
    state2 = asyncio.get_event_loop().run_until_complete(_seed_state())
    r2 = client.get(f"/api/auth/oauth/google/callback?code=x&state={state2}",
                    follow_redirects=False)
    assert "error=signup_rate_limited" in r2.headers["location"]

    # cleanup DB rows (monkeypatch auto-restores the settings cap)
    from app.database import SessionLocal
    from app.models import OAuthIdentity, User
    db = SessionLocal()
    try:
        db.query(OAuthIdentity).filter(
            OAuthIdentity.provider_subject.in_(["quota-1", "quota-2"])
        ).delete(synchronize_session=False)
        db.query(User).filter(
            User.email.in_(["quota-1@example.com", "quota-2@example.com"])
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()
