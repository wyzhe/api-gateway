from app.services.oauth_providers import OAUTH_PROVIDERS, get_provider


def test_known_providers_registered():
    assert set(OAUTH_PROVIDERS.keys()) == {"google", "github"}


def test_get_provider_returns_none_when_unconfigured():
    # In default env, no provider is configured
    import importlib
    from app import config
    from app.services import oauth_providers
    config.get_settings.cache_clear()
    importlib.reload(oauth_providers)
    assert oauth_providers.get_provider("google") is None
    assert oauth_providers.get_provider("github") is None


def test_get_provider_returns_config_when_configured(monkeypatch):
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "abc")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_SECRET", "def")
    import importlib
    from app import config
    from app.services import oauth_providers
    config.get_settings.cache_clear()
    importlib.reload(oauth_providers)

    p = oauth_providers.get_provider("google")
    assert p is not None
    assert p.client_id == "abc"
    assert p.scope == "openid email profile"

    monkeypatch.delenv("GOOGLE_OAUTH_CLIENT_ID")
    monkeypatch.delenv("GOOGLE_OAUTH_CLIENT_SECRET")
    config.get_settings.cache_clear()
    importlib.reload(oauth_providers)


def test_redirect_uri_uses_backend_base_url():
    from app.services.oauth_providers import OAUTH_PROVIDERS
    google = OAUTH_PROVIDERS["google"]
    uri = google.redirect_uri()
    assert uri.endswith("/api/auth/oauth/google/callback")
