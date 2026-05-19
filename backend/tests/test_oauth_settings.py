"""Settings 新增 OAuth 和反滥用阈值字段 + 启动校验。"""
import pytest
from pydantic import ValidationError

from app.config import Settings


def _make(**overrides):
    base = dict(
        env="production",
        jwt_secret="a" * 64,
        admin_password="x" * 32,
        cors_origins="https://app.example.com",
    )
    base.update(overrides)
    return Settings(**base)


def test_oauth_disabled_when_no_credentials():
    s = _make()
    assert s.google_oauth_client_id is None
    assert s.github_oauth_client_id is None


def test_oauth_client_id_without_secret_fails_in_production():
    with pytest.raises(ValidationError, match="client_secret"):
        _make(google_oauth_client_id="abc123")


def test_oauth_backend_url_must_be_https_in_production():
    with pytest.raises(ValidationError, match="https"):
        _make(
            google_oauth_client_id="abc",
            google_oauth_client_secret="def",
            oauth_backend_base_url="http://api.example.com",
            oauth_frontend_base_url="https://app.example.com",
        )


def test_oauth_same_site_requirement_in_production():
    with pytest.raises(ValidationError, match="same site"):
        _make(
            google_oauth_client_id="abc",
            google_oauth_client_secret="def",
            oauth_backend_base_url="https://api.example.com",
            oauth_frontend_base_url="https://app.other-domain.com",
        )


def test_oauth_same_site_subdomain_passes_in_production():
    s = _make(
        google_oauth_client_id="abc",
        google_oauth_client_secret="def",
        oauth_backend_base_url="https://api.example.com",
        oauth_frontend_base_url="https://app.example.com",
    )
    assert s.oauth_backend_base_url == "https://api.example.com"


def test_abuse_thresholds_must_be_positive():
    with pytest.raises(ValidationError, match=">= 1"):
        Settings(jwt_secret="a" * 64, admin_password="x" * 32, signup_per_ip_per_day=0)


def test_abuse_thresholds_have_defaults():
    s = Settings(jwt_secret="a" * 64, admin_password="x" * 32)
    assert s.signup_per_ip_per_day == 10
    assert s.api_key_per_user_per_day == 5
