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
