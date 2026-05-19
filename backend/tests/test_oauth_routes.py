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
