from functools import lru_cache
from pathlib import Path

from pydantic import Field, ValidationInfo, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent


_WEAK_JWT_SECRETS = {
    "",
    "change-me",
    "changeme",
    "secret",
    "test",
    "dev",
    "default",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(PROJECT_ROOT / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- Environment mode ---
    env: str = Field(default="development")  # development | production | test

    # --- DB / Redis ---
    database_url: str = Field(
        default="postgresql+psycopg://postgres:postgres@localhost:5432/llm_gateway"
    )
    redis_url: str = Field(default="redis://localhost:6379/0")

    # --- Upstream ---
    apimart_api_key: str = Field(default="")
    apimart_base_url: str = Field(default="https://api.apimart.ai/v1")
    apimart_timeout_connect: float = Field(default=10.0)
    apimart_timeout_read: float = Field(default=120.0)
    apimart_timeout_write: float = Field(default=30.0)

    # --- Auth ---
    jwt_secret: str = Field(default="")
    jwt_algorithm: str = Field(default="HS256")
    jwt_access_ttl_minutes: int = Field(default=15)
    jwt_refresh_ttl_days: int = Field(default=30)

    # --- Initial admin ---
    admin_email: str = Field(default="admin@example.com")
    admin_password: str = Field(default="")  # empty -> generate random on first boot

    # --- CORS ---
    cors_origins: str = Field(default="http://localhost:5173")

    # --- Rate limits ---
    rate_limit_login_per_15m: int = Field(default=10)
    rate_limit_refresh_per_hour: int = Field(default=60)
    rate_limit_gateway_rpm: int = Field(default=60)

    # --- OAuth ---
    google_oauth_client_id: str | None = Field(default=None)
    google_oauth_client_secret: str | None = Field(default=None)
    github_oauth_client_id: str | None = Field(default=None)
    github_oauth_client_secret: str | None = Field(default=None)
    oauth_backend_base_url: str | None = Field(default=None)
    oauth_frontend_base_url: str | None = Field(default=None)

    # --- Anti-abuse thresholds ---
    signup_per_ip_per_day: int = Field(default=10)
    api_key_per_user_per_day: int = Field(default=5)

    # --- Worker ---
    worker_task_scan_interval_seconds: int = Field(default=30)

    @property
    def is_production(self) -> bool:
        return self.env.lower() == "production"

    @property
    def is_test(self) -> bool:
        return self.env.lower() == "test"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    # ---- Validators ----

    @field_validator("jwt_secret")
    @classmethod
    def _validate_jwt_secret(cls, v: str, info: ValidationInfo) -> str:
        # In production, require a strong secret. In dev/test, accept any non-empty
        # value (but still reject the literal "change-me" — that's never useful).
        env_val = (info.data.get("env") or "development").lower()
        if env_val == "production":
            if len(v) < 32 or v.lower() in _WEAK_JWT_SECRETS:
                raise ValueError(
                    "JWT_SECRET must be at least 32 chars and not a known weak value in production. "
                    "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
                )
        else:
            if v.lower() in _WEAK_JWT_SECRETS - {""}:
                raise ValueError(
                    "JWT_SECRET is set to a known weak placeholder. Set a non-trivial value even in dev."
                )
            if not v:
                # In dev/test, allow empty by substituting a deterministic but obviously-dev value
                # — code that calls into JWT will still fail loudly if you point a prod build at it
                # (env=production re-runs this validator with the strict branch).
                return "dev-only-not-a-real-secret-do-not-use-in-prod-0123456789"
        return v

    @field_validator("admin_password")
    @classmethod
    def _validate_admin_password(cls, v: str, info: ValidationInfo) -> str:
        env_val = (info.data.get("env") or "development").lower()
        if env_val == "production" and v and v.lower() in {"admin", "admin123", "password", "changeme"}:
            raise ValueError(
                "ADMIN_PASSWORD is set to a known weak value in production. Leave it blank to "
                "auto-generate, or set a strong password."
            )
        return v

    @field_validator("signup_per_ip_per_day", "api_key_per_user_per_day")
    @classmethod
    def _positive_quota(cls, v: int, info: ValidationInfo) -> int:
        if v < 1:
            raise ValueError(f"{info.field_name} must be >= 1 (0 disables anti-abuse)")
        return v

    @field_validator("oauth_backend_base_url", "oauth_frontend_base_url")
    @classmethod
    def _oauth_url_https_in_prod(cls, v: str | None, info: ValidationInfo) -> str | None:
        env = (info.data.get("env") or "").lower()
        if env == "production" and v and not v.startswith("https://"):
            raise ValueError(
                f"{info.field_name} must use https:// in production (got {v!r})"
            )
        return v

    @field_validator("google_oauth_client_secret", "github_oauth_client_secret")
    @classmethod
    def _client_id_requires_secret(cls, v: str | None, info: ValidationInfo) -> str | None:
        env = (info.data.get("env") or "").lower()
        if env != "production":
            return v
        provider = info.field_name.split("_oauth_client_secret")[0]
        cid = info.data.get(f"{provider}_oauth_client_id")
        if cid and not v:
            raise ValueError(
                f"{provider}_oauth_client_id is set but client_secret is missing"
            )
        return v

    @model_validator(mode="after")
    def _oauth_urls_same_site(self) -> "Settings":
        if not self.is_production:
            return self
        if not (self.oauth_backend_base_url and self.oauth_frontend_base_url):
            return self
        from urllib.parse import urlparse
        b = urlparse(self.oauth_backend_base_url).hostname or ""
        f = urlparse(self.oauth_frontend_base_url).hostname or ""

        def _registrable(h: str) -> str:
            parts = h.rsplit(".", 2)
            return ".".join(parts[-2:]) if len(parts) >= 2 else h

        if _registrable(b) != _registrable(f):
            raise ValueError(
                f"oauth_backend_base_url ({b}) and oauth_frontend_base_url ({f}) "
                f"must be same site (share registrable domain), otherwise SameSite=Strict cookies fail"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
