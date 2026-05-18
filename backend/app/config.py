from functools import lru_cache
from pathlib import Path

from pydantic import Field, ValidationInfo, field_validator
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
