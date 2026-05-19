# OAuth 登录 — Plan A:后端 OAuth 基础设施

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Google + GitHub OAuth 后端基础设施:数据模型、Authlib 集成、`/api/auth/oauth/*` 路由、账号关联服务、反滥用基线、admin 「标记邮箱已验证」端点、文档同步。完成后通过 curl 可跑通完整 OAuth 流。

**Architecture:** Backend-driven authorization_code + PKCE,Authlib 处理 token exchange / id_token 验证。Exchange code 走 HttpOnly + SameSite=Strict + 60s TTL cookie 传回 frontend。账号合并要求 `email_verified_at IS NOT NULL`(防 [Account Pre-hijacking](https://www.usenix.org/conference/usenixsecurity22/presentation/sudhodanan))。开放注册 + IP 限流 + balance=0 兜底。

**Tech Stack:** FastAPI 0.115、SQLAlchemy 2、Alembic、psycopg 3、Redis 7+、Authlib(新增)、bcrypt、python-jose、structlog、prometheus-client。

**Reference spec:** `docs/superpowers/specs/2026-05-19-oauth-login-design.md`

**Out of scope(留给 Plan B/C):**
- `POST /api/auth/me/password` 密码自助端点(Plan B)
- 前端登录页 OAuth 按钮、`/auth/oauth/complete`、settings 页(Plan C)
- 前端 admin panel「标记邮箱已验证」按钮(Plan C);本 plan 只实现后端 endpoint

---

## File Structure

### 新建文件

| 文件 | 责任 |
|---|---|
| `backend/app/models/oauth_identity.py` | `OAuthIdentity` ORM model |
| `backend/app/schemas/oauth.py` | OAuth-related Pydantic schemas |
| `backend/app/services/oauth_providers.py` | Authlib 注册 Google + GitHub OAuth2 clients |
| `backend/app/services/oauth_linking_service.py` | `find_or_create_user` / `attach_to_existing` / `detach` |
| `backend/app/services/oauth_state_service.py` | Redis state / exchange code helpers(原子 SET/GETDEL) |
| `backend/app/services/abuse_mitigation_service.py` | IP signup counter / api_key per-user daily quota |
| `backend/app/api/oauth.py` | `/api/auth/oauth/*` 路由(start / callback / exchange / link/start / providers) |
| `backend/app/api/settings_connections.py` | `/api/settings/connections` 列出 / 解绑 OAuth identity(详见 task 6.2) |
| `backend/alembic/versions/<rev>_oauth_identities_and_email_verified.py` | Alembic migration |
| `backend/tests/test_oauth_linking.py` | OAuthLinkingService 单元测 |
| `backend/tests/test_oauth_state.py` | state 一次性 / 过期 / provider mismatch 测试 |
| `backend/tests/test_oauth_routes.py` | 路由集成测(fake Authlib) |
| `backend/tests/test_abuse_mitigation.py` | IP signup 限流 + API key quota 测试 |
| `backend/tests/test_settings_connections.py` | 关联 / 解绑 端点测试 |

### 修改文件

| 文件 | 改动 |
|---|---|
| `backend/app/models/user.py` | `password_hash` 改 nullable;新增 `email_verified_at`;新增 `oauth_identities` relationship |
| `backend/app/models/__init__.py` | export `OAuthIdentity` |
| `backend/app/schemas/auth.py` | `UserOut` 加 `has_password: bool` 和 `email_verified_at: datetime \| None` |
| `backend/app/api/admin.py` | admin user-create 默认 `email_verified_at=now()`;新增「标记邮箱已验证」endpoint;审计 |
| `backend/app/api/keys.py` | 创建 key 前过 per-user daily quota |
| `backend/app/config.py` | 新增 OAuth env vars + 反滥用阈值 + 启动校验 |
| `backend/app/main.py` | 注册 `oauth` 和 `settings_connections` router |
| `backend/app/metrics.py` | 新增 OAuth 指标 + 反滥用计数指标 |
| `backend/pyproject.toml` | 加 `authlib>=1.3` 依赖 |
| `CLAUDE.md` | 6 处更新(见 spec § 10) |
| `README.md` | OAuth env vars + 部署 setup 一节 |

---

# Phase 1 — 数据模型 & Alembic 迁移

## Task 1.1 — User 模型修改 + OAuthIdentity 新模型

**Files:**
- Modify: `backend/app/models/user.py`
- Create: `backend/app/models/oauth_identity.py`
- Modify: `backend/app/models/__init__.py`

- [ ] **Step 1: 写失败测试 — User 关系和新字段存在**

新文件 `backend/tests/test_user_oauth_fields.py`:

```python
"""User 模型新增 email_verified_at + oauth_identities relationship + password_hash nullable."""
from datetime import datetime, timezone
from decimal import Decimal

from app.database import SessionLocal
from app.models import OAuthIdentity, User
from tests.conftest import _db_reachable

import pytest


pytestmark = pytest.mark.skipif(not _db_reachable(), reason="Postgres not reachable")


def test_user_email_verified_at_defaults_null():
    db = SessionLocal()
    try:
        u = User(
            email="t-email-verified@example.com",
            password_hash="x",  # placeholder
            role="user",
            status="active",
            balance=Decimal("0"),
        )
        db.add(u)
        db.flush()
        assert u.email_verified_at is None
        db.rollback()
    finally:
        db.close()


def test_user_password_hash_nullable():
    db = SessionLocal()
    try:
        u = User(
            email="t-no-password@example.com",
            password_hash=None,  # OAuth-only user
            role="user",
            status="active",
            balance=Decimal("0"),
        )
        db.add(u)
        db.flush()
        assert u.password_hash is None
        db.rollback()
    finally:
        db.close()


def test_user_has_oauth_identities_relationship():
    db = SessionLocal()
    try:
        u = User(
            email="t-oauth-rel@example.com",
            password_hash=None,
            role="user",
            status="active",
            balance=Decimal("0"),
            email_verified_at=datetime.now(timezone.utc),
        )
        db.add(u); db.flush()
        identity = OAuthIdentity(
            user_id=u.id,
            provider="google",
            provider_subject="sub-12345",
        )
        db.add(identity); db.flush()
        db.refresh(u)
        assert len(u.oauth_identities) == 1
        assert u.oauth_identities[0].provider == "google"
        db.rollback()
    finally:
        db.close()
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `.venv/bin/pytest backend/tests/test_user_oauth_fields.py -v`
Expected: ImportError 或 AttributeError(`OAuthIdentity` 不存在;`User.email_verified_at` 不存在)

- [ ] **Step 3: 创建 OAuthIdentity 模型**

新文件 `backend/app/models/oauth_identity.py`:

```python
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class OAuthIdentity(Base):
    __tablename__ = "oauth_identities"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider: Mapped[str] = mapped_column(String(16), nullable=False)  # "google" | "github"
    provider_subject: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        UniqueConstraint("provider", "provider_subject", name="uq_oauth_provider_subject"),
        Index("ix_oauth_user_provider", "user_id", "provider"),
    )

    user: Mapped["User"] = relationship(back_populates="oauth_identities")  # noqa: F821
```

- [ ] **Step 4: 修改 User 模型**

修改 `backend/app/models/user.py`:

```python
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="user")  # user | admin
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")  # active | disabled
    balance: Mapped[Decimal] = mapped_column(Numeric(18, 8), nullable=False, default=Decimal("0"))
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    oauth_identities: Mapped[list["OAuthIdentity"]] = relationship(  # noqa: F821
        back_populates="user", cascade="all, delete-orphan"
    )
```

- [ ] **Step 5: 在 `__init__.py` export OAuthIdentity**

修改 `backend/app/models/__init__.py`:

```python
from .api_key import ApiKey
from .audit_log import AuditLog
from .model import ModelRow
from .oauth_identity import OAuthIdentity
from .provider import Provider
from .refresh_token import RefreshToken
from .request_log import RequestLog
from .transaction import BalanceTransaction
from .user import User
from .video_task import VideoTask

__all__ = [
    "ApiKey",
    "AuditLog",
    "BalanceTransaction",
    "ModelRow",
    "OAuthIdentity",
    "Provider",
    "RefreshToken",
    "RequestLog",
    "User",
    "VideoTask",
]
```

- [ ] **Step 6: 跑 Alembic autogenerate**

Run:
```bash
cd backend && .venv/bin/alembic revision --autogenerate -m "oauth_identities_and_email_verified"
```

Expected: 生成新文件在 `backend/alembic/versions/<rev>_oauth_identities_and_email_verified.py`,包含:
- `op.create_table("oauth_identities", ...)`
- `op.create_index("ix_oauth_user_provider", ...)`
- `op.alter_column("users", "password_hash", existing_type=..., nullable=True)`
- `op.add_column("users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))`

人工 review 这个文件,确认上述 4 个操作都在,且 `downgrade()` 是反向操作。

- [ ] **Step 7: 跑 migration**

Run: `cd backend && .venv/bin/alembic upgrade head`
Expected: `INFO  [alembic.runtime.migration] Running upgrade ... -> <rev>, oauth_identities_and_email_verified`

- [ ] **Step 8: 跑测试**

Run: `cd backend && .venv/bin/pytest tests/test_user_oauth_fields.py -v`
Expected: 3 个测试全 PASS。

- [ ] **Step 9: Commit**

```bash
git add backend/app/models/user.py backend/app/models/oauth_identity.py \
        backend/app/models/__init__.py \
        backend/alembic/versions/*_oauth_identities_and_email_verified.py \
        backend/tests/test_user_oauth_fields.py
git commit -m "feat(models): add OAuthIdentity table and User email_verified_at"
```

---

## Task 1.2 — UserOut schema 加 has_password 和 email_verified_at

**Files:**
- Modify: `backend/app/schemas/auth.py`

- [ ] **Step 1: 写失败测试**

新文件 `backend/tests/test_user_schema.py`:

```python
"""UserOut 加 has_password 和 email_verified_at 字段。"""
from datetime import datetime, timezone
from decimal import Decimal

from app.models import User
from app.schemas.auth import UserOut


def test_user_out_includes_has_password_true_when_hash_set():
    u = User(
        id=1, email="a@b.com", password_hash="bcrypt-hash",
        role="user", status="active", balance=Decimal("0"),
        created_at=datetime.now(timezone.utc),
    )
    out = UserOut.model_validate(u)
    assert out.has_password is True


def test_user_out_includes_has_password_false_when_hash_none():
    u = User(
        id=1, email="a@b.com", password_hash=None,
        role="user", status="active", balance=Decimal("0"),
        created_at=datetime.now(timezone.utc),
    )
    out = UserOut.model_validate(u)
    assert out.has_password is False


def test_user_out_includes_email_verified_at():
    verified_at = datetime.now(timezone.utc)
    u = User(
        id=1, email="a@b.com", password_hash="x",
        role="user", status="active", balance=Decimal("0"),
        email_verified_at=verified_at,
        created_at=datetime.now(timezone.utc),
    )
    out = UserOut.model_validate(u)
    assert out.email_verified_at == verified_at
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `cd backend && .venv/bin/pytest tests/test_user_schema.py -v`
Expected: AttributeError 或 ValidationError(字段不存在)

- [ ] **Step 3: 修改 UserOut schema**

修改 `backend/app/schemas/auth.py`,把 `UserOut` 替换为:

```python
from typing import Any

class UserOut(BaseModel):
    id: int
    email: EmailStr
    display_name: str | None
    role: str
    status: str
    balance: Decimal
    has_password: bool
    email_verified_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def model_validate(cls, obj: Any, *args, **kwargs):  # type: ignore[override]
        # 从 User ORM 派生 has_password
        if hasattr(obj, "password_hash"):
            data = {
                "id": obj.id,
                "email": obj.email,
                "display_name": obj.display_name,
                "role": obj.role,
                "status": obj.status,
                "balance": obj.balance,
                "has_password": obj.password_hash is not None,
                "email_verified_at": obj.email_verified_at,
                "created_at": obj.created_at,
            }
            return super().model_validate(data, *args, **kwargs)
        return super().model_validate(obj, *args, **kwargs)
```

- [ ] **Step 4: 跑测试**

Run: `cd backend && .venv/bin/pytest tests/test_user_schema.py -v`
Expected: 3 个测试全 PASS。

- [ ] **Step 5: 跑现有 auth 测试确认无回归**

Run: `cd backend && .venv/bin/pytest tests/test_auth_flow.py -v`
Expected: 全 PASS(除非 has_password 字段没在已有断言里出现就行)。

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/auth.py backend/tests/test_user_schema.py
git commit -m "feat(schemas): UserOut adds has_password and email_verified_at"
```

---

# Phase 2 — Settings / Authlib config

## Task 2.1 — 加 Authlib 依赖

**Files:**
- Modify: `backend/pyproject.toml`

- [ ] **Step 1: 加 authlib 依赖**

修改 `backend/pyproject.toml` 的 `dependencies` 数组,加一行(放在 `httpx>=0.27` 后面):

```toml
    "httpx>=0.27",
    "authlib>=1.3",
```

- [ ] **Step 2: 安装**

Run:
```bash
cd backend && .venv/bin/pip install -e ".[dev]"
```

Expected: `Successfully installed authlib-1.x.x ...`(或更高版本)。

- [ ] **Step 3: 烟囱测 import**

Run:
```bash
cd backend && .venv/bin/python -c "from authlib.integrations.httpx_client import AsyncOAuth2Client; print('ok')"
```
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add backend/pyproject.toml
git commit -m "deps: add authlib for OAuth flows"
```

---

## Task 2.2 — Settings 加 OAuth + 反滥用 env vars + 启动校验

**Files:**
- Modify: `backend/app/config.py`

- [ ] **Step 1: 写失败测试**

新文件 `backend/tests/test_oauth_settings.py`:

```python
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
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `cd backend && .venv/bin/pytest tests/test_oauth_settings.py -v`
Expected: AttributeError(字段不存在)

- [ ] **Step 3: 加 settings 字段 + 校验**

修改 `backend/app/config.py`,在 `class Settings(BaseSettings):` 内部加(在 `# --- Worker ---` 之前):

```python
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
```

然后在文件底部、其它 `@field_validator` 旁边,加:

```python
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
```

并在 `Settings` 类底部,加一个 model_validator 验同站约束:

```python
    @model_validator(mode="after")
    def _oauth_urls_same_site(self) -> "Settings":
        if not self.is_production:
            return self
        if not (self.oauth_backend_base_url and self.oauth_frontend_base_url):
            return self
        from urllib.parse import urlparse
        b = urlparse(self.oauth_backend_base_url).hostname or ""
        f = urlparse(self.oauth_frontend_base_url).hostname or ""
        # 简化的 eTLD+1 比较:把最后两段拼起来比对(eTLD+1 比对的完整方案需 publicsuffix2)。
        # 对本项目足够:api.example.com vs app.example.com → 同站;api.foo.com vs app.bar.com → 不同站。
        def _registrable(h: str) -> str:
            parts = h.rsplit(".", 2)
            return ".".join(parts[-2:]) if len(parts) >= 2 else h
        if _registrable(b) != _registrable(f):
            raise ValueError(
                f"oauth_backend_base_url ({b}) and oauth_frontend_base_url ({f}) "
                f"must be same site (share registrable domain), otherwise SameSite=Strict cookies fail"
            )
        return self
```

`model_validator` 需要在文件顶部 import:

```python
from pydantic import Field, ValidationInfo, field_validator, model_validator
```

- [ ] **Step 4: 跑测试**

Run: `cd backend && .venv/bin/pytest tests/test_oauth_settings.py -v`
Expected: 7 个测试全 PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/app/config.py backend/tests/test_oauth_settings.py
git commit -m "feat(config): OAuth and abuse-mitigation env vars with strict prod validation"
```

---

## Task 2.3 — oauth_providers.py 注册 Google + GitHub clients

**Files:**
- Create: `backend/app/services/oauth_providers.py`

- [ ] **Step 1: 写文件**

```python
"""OAuth provider registration with Authlib.

Each provider has:
- A registered Authlib client(for token exchange / id_token validation)
- A `userinfo_fetcher` async callable returning normalized {sub, email, email_verified, name}
- A boolean `configured`(env vars present)

Adding a third provider in the future: add an entry to OAUTH_PROVIDERS dict.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Awaitable, Callable

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


# ---- Google ----

async def _google_profile(client: AsyncOAuth2Client, token: dict) -> NormalizedProfile:
    # Google returns id_token in `token`. Authlib's OIDCClient would validate
    # automatically but we don't use OIDCClient (httpx variant); we parse and trust
    # Google's well-known JWKS via authlib jose tools.
    from authlib.jose import jwt, JsonWebKey
    import httpx

    id_token = token.get("id_token")
    if not id_token:
        raise OAuthError("google id_token missing in token response")

    # Fetch + cache JWKS (TODO Plan A small future: cache in Redis for 24h; MVP fetches each time)
    async with httpx.AsyncClient(timeout=5.0) as h:
        jwks_resp = await h.get("https://www.googleapis.com/oauth2/v3/certs")
        jwks_resp.raise_for_status()
        jwks = JsonWebKey.import_key_set(jwks_resp.json())

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
    claims.validate()  # raises on bad iss/aud/exp

    return NormalizedProfile(
        sub=str(claims["sub"]),
        email=claims.get("email", "").lower(),
        email_verified=bool(claims.get("email_verified", False)),
        name=claims.get("name"),
    )


# ---- GitHub ----

async def _github_profile(client: AsyncOAuth2Client, token: dict) -> NormalizedProfile:
    """GitHub doesn't issue id_token. Fetch /user + /user/emails."""
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
        user_resp = await h.get("https://api.github.com/user")
        user_resp.raise_for_status()
        user = user_resp.json()

        emails_resp = await h.get("https://api.github.com/user/emails")
        emails_resp.raise_for_status()
        emails = emails_resp.json()

    primary_verified = next(
        (e for e in emails if e.get("primary") and e.get("verified")),
        None,
    )
    if not primary_verified:
        # No verified primary — treat as unverified
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


class OAuthError(Exception):
    """Raised when OAuth flow fails for any reason (upstream error, bad token, etc.)."""


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
```

- [ ] **Step 2: 烟囱测 — provider 加载逻辑**

新文件 `backend/tests/test_oauth_providers.py`:

```python
from app.services.oauth_providers import OAUTH_PROVIDERS, get_provider


def test_known_providers_registered():
    assert set(OAUTH_PROVIDERS.keys()) == {"google", "github"}


def test_get_provider_returns_none_when_unconfigured(monkeypatch):
    # 默认 env 里 client_id/client_secret 为 None,所以 configured=False
    import importlib

    from app.services import oauth_providers

    importlib.reload(oauth_providers)
    assert oauth_providers.get_provider("google") is None
    assert oauth_providers.get_provider("github") is None


def test_get_provider_returns_config_when_configured(monkeypatch):
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "abc")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_SECRET", "def")

    import importlib

    from app import config
    from app.services import oauth_providers

    # 强制 reload settings + providers
    config.get_settings.cache_clear()
    importlib.reload(oauth_providers)

    p = oauth_providers.get_provider("google")
    assert p is not None
    assert p.client_id == "abc"
    assert p.scope == "openid email profile"

    # 清理
    monkeypatch.delenv("GOOGLE_OAUTH_CLIENT_ID")
    monkeypatch.delenv("GOOGLE_OAUTH_CLIENT_SECRET")
    config.get_settings.cache_clear()
    importlib.reload(oauth_providers)


def test_redirect_uri_uses_backend_base_url():
    from app.services.oauth_providers import OAUTH_PROVIDERS

    google = OAUTH_PROVIDERS["google"]
    uri = google.redirect_uri()
    assert uri.endswith("/api/auth/oauth/google/callback")
```

- [ ] **Step 3: 跑测试**

Run: `cd backend && .venv/bin/pytest tests/test_oauth_providers.py -v`
Expected: 4 个测试全 PASS。

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/oauth_providers.py backend/tests/test_oauth_providers.py
git commit -m "feat(oauth): register Google + GitHub providers via Authlib"
```

---

## Task 2.4 — oauth_state_service.py — Redis state / exchange code helpers

**Files:**
- Create: `backend/app/services/oauth_state_service.py`

- [ ] **Step 1: 写实现**

```python
"""Redis helpers for OAuth state + one-time exchange code.

State key holds {provider, return_to, code_verifier, mode, linker_user_id?} for 300s.
Exchange code key holds {user_id} for 60s.
Both are GETDEL on consumption to guarantee one-time use.
"""
from __future__ import annotations

import json
import secrets
from typing import Literal

from ..redis_client import get_redis

_STATE_PREFIX = "oauth_state:"
_EXCHANGE_PREFIX = "oauth_exchange:"
_STATE_TTL = 300
_EXCHANGE_TTL = 60

Mode = Literal["login", "link"]


def new_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


async def put_state(
    state: str,
    *,
    provider: str,
    return_to: str,
    code_verifier: str,
    mode: Mode = "login",
    linker_user_id: int | None = None,
) -> None:
    redis = get_redis()
    payload = json.dumps(
        {
            "provider": provider,
            "return_to": return_to,
            "code_verifier": code_verifier,
            "mode": mode,
            "linker_user_id": linker_user_id,
        }
    )
    await redis.set(_STATE_PREFIX + state, payload, ex=_STATE_TTL)


async def consume_state(state: str) -> dict | None:
    redis = get_redis()
    # GETDEL — atomic one-time read
    raw = await redis.getdel(_STATE_PREFIX + state)
    if raw is None:
        return None
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    return json.loads(raw)


async def put_exchange_code(user_id: int) -> str:
    redis = get_redis()
    code = new_token(32)
    await redis.set(_EXCHANGE_PREFIX + code, json.dumps({"user_id": user_id}), ex=_EXCHANGE_TTL)
    return code


async def consume_exchange_code(code: str) -> int | None:
    redis = get_redis()
    raw = await redis.getdel(_EXCHANGE_PREFIX + code)
    if raw is None:
        return None
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    data = json.loads(raw)
    return int(data["user_id"])
```

- [ ] **Step 2: 写测试**

新文件 `backend/tests/test_oauth_state.py`:

```python
import pytest

from app.services import oauth_state_service as svc
from tests.conftest import needs_redis


@needs_redis
async def test_put_then_consume_state_returns_payload():
    state = svc.new_token()
    await svc.put_state(state, provider="google", return_to="/",
                        code_verifier="vvv", mode="login")
    got = await svc.consume_state(state)
    assert got == {
        "provider": "google", "return_to": "/", "code_verifier": "vvv",
        "mode": "login", "linker_user_id": None,
    }


@needs_redis
async def test_consume_state_is_one_time():
    state = svc.new_token()
    await svc.put_state(state, provider="google", return_to="/",
                        code_verifier="vvv")
    first = await svc.consume_state(state)
    second = await svc.consume_state(state)
    assert first is not None
    assert second is None


@needs_redis
async def test_consume_unknown_state_returns_none():
    assert await svc.consume_state("does-not-exist") is None


@needs_redis
async def test_put_then_consume_exchange_code():
    code = await svc.put_exchange_code(user_id=42)
    got = await svc.consume_exchange_code(code)
    assert got == 42


@needs_redis
async def test_exchange_code_is_one_time():
    code = await svc.put_exchange_code(user_id=42)
    await svc.consume_exchange_code(code)
    assert await svc.consume_exchange_code(code) is None
```

- [ ] **Step 3: 跑测试**

Run: `cd backend && .venv/bin/pytest tests/test_oauth_state.py -v`
Expected: 5 个测试全 PASS(如果 Redis 没起,会 skip——记得起 Redis:`docker compose up -d redis`)。

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/oauth_state_service.py backend/tests/test_oauth_state.py
git commit -m "feat(oauth): Redis state + exchange-code helpers (one-time GETDEL)"
```

---

# Phase 3 — OAuth 账号关联服务

## Task 3.1 — `find_or_create_user`

**Files:**
- Create: `backend/app/services/oauth_linking_service.py`(部分)
- Create: `backend/tests/test_oauth_linking.py`

- [ ] **Step 1: 写失败测试 — `find_or_create_user` 三个 case**

新文件 `backend/tests/test_oauth_linking.py`:

```python
"""OAuthLinkingService.find_or_create_user — 3 cases:
1. identity 已绑 → login
2. 同 email 已有 verified User → link
3. 新建 → signup

加上拒绝路径:
- email_verified_at IS NULL 的现有 User → OAuthEmailConflict (account pre-hijacking 防护)
- disabled User → OAuthUserDisabled
"""
from datetime import datetime, timezone
from decimal import Decimal

import pytest

from app.database import SessionLocal
from app.models import OAuthIdentity, User
from app.services import oauth_linking_service as svc
from tests.conftest import _db_reachable


pytestmark = pytest.mark.skipif(not _db_reachable(), reason="Postgres not reachable")


def _cleanup(db, emails: list[str]):
    db.query(OAuthIdentity).filter(
        OAuthIdentity.user_id.in_(
            db.query(User.id).filter(User.email.in_(emails))
        )
    ).delete(synchronize_session=False)
    db.query(User).filter(User.email.in_(emails)).delete(synchronize_session=False)
    db.commit()


def test_creates_new_user_when_no_match():
    db = SessionLocal()
    email = "oauth-new@example.com"
    _cleanup(db, [email])
    try:
        with db.begin():
            outcome, user = svc.find_or_create_user(
                db, provider="google", subject="google-sub-1",
                email=email, name="New User",
            )
        assert outcome == "signup"
        assert user.email == email
        assert user.password_hash is None
        assert user.balance == Decimal("0")
        assert user.email_verified_at is not None
        assert len(user.oauth_identities) == 1
    finally:
        _cleanup(db, [email])
        db.close()


def test_returns_login_when_identity_already_bound():
    db = SessionLocal()
    email = "oauth-bound@example.com"
    _cleanup(db, [email])
    try:
        with db.begin():
            _, user1 = svc.find_or_create_user(
                db, provider="google", subject="google-sub-2",
                email=email, name="Bound",
            )
        with db.begin():
            outcome, user2 = svc.find_or_create_user(
                db, provider="google", subject="google-sub-2",
                email=email, name="Bound",
            )
        assert outcome == "login"
        assert user2.id == user1.id
    finally:
        _cleanup(db, [email])
        db.close()


def test_links_to_verified_existing_user():
    db = SessionLocal()
    email = "oauth-verified-existing@example.com"
    _cleanup(db, [email])
    try:
        # 先建一个 verified 的密码用户
        with db.begin():
            u = User(
                email=email, password_hash="bcrypt-hash",
                role="user", status="active", balance=Decimal("0"),
                email_verified_at=datetime.now(timezone.utc),
            )
            db.add(u)
            db.flush()
            uid = u.id
        with db.begin():
            outcome, user = svc.find_or_create_user(
                db, provider="github", subject="gh-sub-1",
                email=email, name="Linked",
            )
        assert outcome == "link"
        assert user.id == uid
        assert len(user.oauth_identities) == 1
        assert user.oauth_identities[0].provider == "github"
    finally:
        _cleanup(db, [email])
        db.close()


def test_refuses_unverified_existing_user_account_prehijacking_guard():
    db = SessionLocal()
    email = "oauth-unverified-existing@example.com"
    _cleanup(db, [email])
    try:
        # 现有密码用户 email_verified_at=NULL
        with db.begin():
            u = User(
                email=email, password_hash="bcrypt-hash",
                role="user", status="active", balance=Decimal("0"),
                email_verified_at=None,
            )
            db.add(u)
        with pytest.raises(svc.OAuthEmailConflict):
            with db.begin():
                svc.find_or_create_user(
                    db, provider="google", subject="google-sub-3",
                    email=email, name="Attacker",
                )
    finally:
        _cleanup(db, [email])
        db.close()


def test_refuses_disabled_user_via_identity():
    db = SessionLocal()
    email = "oauth-disabled@example.com"
    _cleanup(db, [email])
    try:
        with db.begin():
            _, user = svc.find_or_create_user(
                db, provider="google", subject="google-sub-4",
                email=email, name="Was Active",
            )
            user.status = "disabled"
        with pytest.raises(svc.OAuthUserDisabled):
            with db.begin():
                svc.find_or_create_user(
                    db, provider="google", subject="google-sub-4",
                    email=email, name="Disabled now",
                )
    finally:
        _cleanup(db, [email])
        db.close()
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `cd backend && .venv/bin/pytest tests/test_oauth_linking.py -v`
Expected: ImportError(模块不存在)

- [ ] **Step 3: 写 service 第一版**

新文件 `backend/app/services/oauth_linking_service.py`:

```python
"""Find / create / link / detach OAuth identities, with safety guards.

Account pre-hijacking guard: only auto-link to existing User when
User.email_verified_at IS NOT NULL. Otherwise raise OAuthEmailConflict.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import OAuthIdentity, User


Outcome = Literal["signup", "login", "link"]


class OAuthEmailConflict(Exception):
    def __init__(self, email: str):
        super().__init__(f"email {email!r} owned by an unverified existing user")
        self.email = email


class OAuthUserDisabled(Exception):
    def __init__(self, user_id: int):
        super().__init__(f"user {user_id} is disabled")
        self.user_id = user_id


class OAuthProviderInUse(Exception):
    def __init__(self, provider: str):
        super().__init__(f"{provider} identity already bound to a different user")
        self.provider = provider


class OAuthIdentityNotFound(Exception):
    pass


class OAuthCannotDetachLast(Exception):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def find_or_create_user(
    db: Session,
    *,
    provider: str,
    subject: str,
    email: str,
    name: str | None,
) -> tuple[Outcome, User]:
    email = email.lower()

    # Case 1: identity 已绑 → login
    identity = (
        db.query(OAuthIdentity)
          .filter_by(provider=provider, provider_subject=subject)
          .with_for_update()
          .one_or_none()
    )
    if identity is not None:
        if identity.user.status != "active":
            raise OAuthUserDisabled(identity.user_id)
        identity.last_login_at = _now()
        return ("login", identity.user)

    # Case 2: 同 email 现有 User
    user = (
        db.query(User).filter_by(email=email)
          .with_for_update()
          .one_or_none()
    )
    if user is not None:
        if user.email_verified_at is None:
            raise OAuthEmailConflict(email)
        if user.status != "active":
            raise OAuthUserDisabled(user.id)
        db.add(OAuthIdentity(
            user_id=user.id,
            provider=provider,
            provider_subject=subject,
            last_login_at=_now(),
        ))
        return ("link", user)

    # Case 3: 全新用户
    user = User(
        email=email,
        password_hash=None,
        display_name=name,
        role="user",
        status="active",
        balance=Decimal("0"),
        email_verified_at=_now(),
    )
    db.add(user)
    db.flush()
    db.add(OAuthIdentity(
        user_id=user.id,
        provider=provider,
        provider_subject=subject,
        last_login_at=_now(),
    ))
    return ("signup", user)
```

- [ ] **Step 4: 跑测试**

Run: `cd backend && .venv/bin/pytest tests/test_oauth_linking.py -v`
Expected: 5 个测试全 PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/oauth_linking_service.py backend/tests/test_oauth_linking.py
git commit -m "feat(oauth): linking service find_or_create_user with pre-hijacking guard"
```

---

## Task 3.2 — `attach_to_existing` 和 `detach`

**Files:**
- Modify: `backend/app/services/oauth_linking_service.py`
- Modify: `backend/tests/test_oauth_linking.py`

- [ ] **Step 1: 加测试**

在 `backend/tests/test_oauth_linking.py` 末尾追加:

```python
# ---- attach_to_existing ----

def test_attach_to_existing_adds_identity_when_no_conflict():
    db = SessionLocal()
    email = "attach-1@example.com"
    _cleanup(db, [email])
    try:
        with db.begin():
            _, user = svc.find_or_create_user(
                db, provider="google", subject="g-1",
                email=email, name="X",
            )
            uid = user.id
        with db.begin():
            attached = svc.attach_to_existing(
                db, user_id=uid, provider="github",
                subject="gh-1", email=email,
            )
        assert attached.id == uid
        db.refresh(attached)
        assert {i.provider for i in attached.oauth_identities} == {"google", "github"}
    finally:
        _cleanup(db, [email])
        db.close()


def test_attach_to_existing_idempotent_for_same_user():
    db = SessionLocal()
    email = "attach-2@example.com"
    _cleanup(db, [email])
    try:
        with db.begin():
            _, user = svc.find_or_create_user(
                db, provider="google", subject="g-2",
                email=email, name="X",
            )
            uid = user.id
        with db.begin():
            svc.attach_to_existing(db, user_id=uid, provider="github",
                                   subject="gh-2", email=email)
        with db.begin():
            svc.attach_to_existing(db, user_id=uid, provider="github",
                                   subject="gh-2", email=email)
        u = db.query(User).filter_by(id=uid).one()
        assert len([i for i in u.oauth_identities if i.provider == "github"]) == 1
    finally:
        _cleanup(db, [email])
        db.close()


def test_attach_to_existing_rejects_provider_in_use_by_other_user():
    db = SessionLocal()
    emails = ["attach-3a@example.com", "attach-3b@example.com"]
    _cleanup(db, emails)
    try:
        with db.begin():
            _, u1 = svc.find_or_create_user(
                db, provider="github", subject="gh-3",
                email=emails[0], name="A",
            )
            _, u2 = svc.find_or_create_user(
                db, provider="google", subject="g-3",
                email=emails[1], name="B",
            )
            u1_id, u2_id = u1.id, u2.id
        with pytest.raises(svc.OAuthProviderInUse):
            with db.begin():
                svc.attach_to_existing(
                    db, user_id=u2_id, provider="github",
                    subject="gh-3", email=emails[1],
                )
    finally:
        _cleanup(db, emails)
        db.close()


def test_attach_sets_email_verified_when_matches_and_was_null():
    db = SessionLocal()
    email = "attach-verify@example.com"
    _cleanup(db, [email])
    try:
        with db.begin():
            u = User(email=email, password_hash="x", role="user",
                    status="active", balance=Decimal("0"),
                    email_verified_at=None)
            db.add(u); db.flush()
            uid = u.id
        with db.begin():
            svc.attach_to_existing(db, user_id=uid, provider="github",
                                   subject="gh-verify", email=email)
        u = db.query(User).filter_by(id=uid).one()
        assert u.email_verified_at is not None
    finally:
        _cleanup(db, [email])
        db.close()


# ---- detach ----

def test_detach_fails_when_last_login_method_oauth_only():
    db = SessionLocal()
    email = "detach-last@example.com"
    _cleanup(db, [email])
    try:
        with db.begin():
            _, user = svc.find_or_create_user(
                db, provider="google", subject="g-last",
                email=email, name="X",
            )
            iid = user.oauth_identities[0].id
            uid = user.id
        with pytest.raises(svc.OAuthCannotDetachLast):
            with db.begin():
                svc.detach(db, user_id=uid, identity_id=iid)
    finally:
        _cleanup(db, [email])
        db.close()


def test_detach_succeeds_when_password_exists():
    db = SessionLocal()
    email = "detach-with-pwd@example.com"
    _cleanup(db, [email])
    try:
        with db.begin():
            _, user = svc.find_or_create_user(
                db, provider="google", subject="g-pwd",
                email=email, name="X",
            )
            user.password_hash = "bcrypt-something"
            iid = user.oauth_identities[0].id
            uid = user.id
        with db.begin():
            svc.detach(db, user_id=uid, identity_id=iid)
        u = db.query(User).filter_by(id=uid).one()
        assert len(u.oauth_identities) == 0
    finally:
        _cleanup(db, [email])
        db.close()


def test_detach_succeeds_when_other_identity_remains():
    db = SessionLocal()
    email = "detach-other-id@example.com"
    _cleanup(db, [email])
    try:
        with db.begin():
            _, user = svc.find_or_create_user(
                db, provider="google", subject="g-other",
                email=email, name="X",
            )
            uid = user.id
            iid = user.oauth_identities[0].id
        with db.begin():
            svc.attach_to_existing(db, user_id=uid, provider="github",
                                   subject="gh-other", email=email)
        with db.begin():
            svc.detach(db, user_id=uid, identity_id=iid)
        u = db.query(User).filter_by(id=uid).one()
        assert {i.provider for i in u.oauth_identities} == {"github"}
    finally:
        _cleanup(db, [email])
        db.close()
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `cd backend && .venv/bin/pytest tests/test_oauth_linking.py -v`
Expected: AttributeError(`attach_to_existing` / `detach` 未定义)

- [ ] **Step 3: 加 service 实现**

在 `backend/app/services/oauth_linking_service.py` 末尾追加:

```python
def attach_to_existing(
    db: Session,
    *,
    user_id: int,
    provider: str,
    subject: str,
    email: str,
) -> User:
    email = email.lower()

    existing = (
        db.query(OAuthIdentity)
          .filter_by(provider=provider, provider_subject=subject)
          .with_for_update()
          .one_or_none()
    )
    if existing is not None and existing.user_id != user_id:
        raise OAuthProviderInUse(provider)
    if existing is not None:
        return existing.user  # idempotent

    user = db.query(User).filter_by(id=user_id).with_for_update().one()
    db.add(OAuthIdentity(
        user_id=user.id,
        provider=provider,
        provider_subject=subject,
        last_login_at=_now(),
    ))
    if user.email_verified_at is None and user.email == email:
        user.email_verified_at = _now()
    return user


def detach(db: Session, *, user_id: int, identity_id: int) -> None:
    identity = (
        db.query(OAuthIdentity)
          .filter_by(id=identity_id, user_id=user_id)
          .with_for_update()
          .one_or_none()
    )
    if identity is None:
        raise OAuthIdentityNotFound()

    user = db.query(User).filter_by(id=user_id).with_for_update().one()
    other_count = (
        db.query(func.count(OAuthIdentity.id))
          .filter(OAuthIdentity.user_id == user_id,
                  OAuthIdentity.id != identity_id)
          .scalar()
    )
    if user.password_hash is None and other_count == 0:
        raise OAuthCannotDetachLast()

    db.delete(identity)
```

- [ ] **Step 4: 跑测试**

Run: `cd backend && .venv/bin/pytest tests/test_oauth_linking.py -v`
Expected: 全部 12 个测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/oauth_linking_service.py backend/tests/test_oauth_linking.py
git commit -m "feat(oauth): attach_to_existing and detach with last-method guard"
```

---

# Phase 4 — OAuth 路由

> 本阶段所有路由都加 `prefix="/api/auth/oauth"`。新建 `backend/app/api/oauth.py`,在 `main.py` 注册。fake Authlib client 通过 monkeypatch 注入实现集成测。

## Task 4.1 — `GET /api/auth/oauth/providers`

**Files:**
- Create: `backend/app/api/oauth.py`(基础结构)
- Create: `backend/app/schemas/oauth.py`
- Modify: `backend/app/main.py`(注册 router)

- [ ] **Step 1: 写测试**

新文件 `backend/tests/test_oauth_routes.py`:

```python
"""OAuth route integration tests. Real Authlib calls are intercepted via monkeypatch."""
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

    r = client.get("/api/auth/oauth/providers")
    assert r.status_code == 200
    body = r.json()
    assert body["google"] is True
    assert body["github"] is False

    # cleanup
    monkeypatch.delenv("GOOGLE_OAUTH_CLIENT_ID")
    monkeypatch.delenv("GOOGLE_OAUTH_CLIENT_SECRET")
    config.get_settings.cache_clear()
    importlib.reload(oauth_providers)
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `cd backend && .venv/bin/pytest tests/test_oauth_routes.py::test_providers_endpoint_reports_unconfigured_when_no_env -v`
Expected: 404(路由不存在)

- [ ] **Step 3: 创建 schemas + router 骨架 + providers endpoint**

新文件 `backend/app/schemas/oauth.py`:

```python
from datetime import datetime

from pydantic import BaseModel


class OAuthProvidersStatus(BaseModel):
    google: bool
    github: bool


class OAuthIdentityOut(BaseModel):
    id: int
    provider: str
    last_login_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class OAuthLinkStartResponse(BaseModel):
    redirect_url: str


class OAuthLinkStartRequest(BaseModel):
    return_to: str | None = None
```

新文件 `backend/app/api/oauth.py`:

```python
"""OAuth login/link routes:
- GET  /api/auth/oauth/providers
- GET  /api/auth/oauth/{provider}/start
- GET  /api/auth/oauth/{provider}/callback
- POST /api/auth/oauth/exchange
- POST /api/auth/oauth/{provider}/link/start
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
```

修改 `backend/app/main.py`,在 import 段加:
```python
from .api import oauth as oauth_api
```
在路由注册段(`app.include_router(auth_api.router)` 后)加:
```python
app.include_router(oauth_api.router)
```

- [ ] **Step 4: 跑测试**

Run: `cd backend && .venv/bin/pytest tests/test_oauth_routes.py::test_providers_endpoint_reports_unconfigured_when_no_env tests/test_oauth_routes.py::test_providers_endpoint_reports_configured -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/oauth.py backend/app/schemas/oauth.py backend/app/main.py backend/tests/test_oauth_routes.py
git commit -m "feat(oauth): GET /api/auth/oauth/providers + route skeleton"
```

---

## Task 4.2 — `GET /api/auth/oauth/{provider}/start`

**Files:**
- Modify: `backend/app/api/oauth.py`
- Modify: `backend/tests/test_oauth_routes.py`

- [ ] **Step 1: 加测试**

追加到 `backend/tests/test_oauth_routes.py`:

```python
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
    config.get_settings.cache_clear()
    importlib.reload(oauth_providers)


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
    # 跨站 return_to 应被改回 "/"
    r = client.get("/api/auth/oauth/google/start?return_to=http://evil.com/x",
                   follow_redirects=False)
    assert r.status_code in (302, 307)
    # state 落地 Redis,检不到 return_to 字段值除非读 Redis;
    # 这里只断不会发生 5xx + 行为没出锅。后续 callback test 会通过 fake state 验证 return_to 落实情况。
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `cd backend && .venv/bin/pytest tests/test_oauth_routes.py::test_start_redirects_to_provider_with_pkce_and_state -v`
Expected: 404(端点不存在)

- [ ] **Step 3: 实现 start endpoint**

修改 `backend/app/api/oauth.py`,在文件顶部 import 段加:

```python
import base64
import hashlib
from urllib.parse import urlencode, urlparse

from fastapi import HTTPException, Request, status
from fastapi.responses import RedirectResponse

from ..config import get_settings
from ..services import oauth_state_service
```

然后加路由(放在 `providers()` 之后):

```python
settings = get_settings()


def _safe_return_to(raw: str | None) -> str:
    """Open redirect 防护。仅允许同源相对路径。"""
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
```

- [ ] **Step 4: 跑测试**

Run: `cd backend && .venv/bin/pytest tests/test_oauth_routes.py -k start -v`
Expected: 3 个 start-related 测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/oauth.py backend/tests/test_oauth_routes.py
git commit -m "feat(oauth): GET /{provider}/start with PKCE + state + open-redirect guard"
```

---

## Task 4.3 — `GET /api/auth/oauth/{provider}/callback`

**Files:**
- Modify: `backend/app/api/oauth.py`
- Modify: `backend/tests/test_oauth_routes.py`

- [ ] **Step 1: 加测试 — 用 monkeypatch 替换 `fetch_profile`**

追加到 `backend/tests/test_oauth_routes.py`:

```python
from app.services import oauth_providers
from app.services.oauth_providers import NormalizedProfile


def _stub_profile(monkeypatch, provider: str, profile: NormalizedProfile):
    """让 callback 跳过真实 fetch_token + Google JWKS,直接返回固定 profile。"""

    async def fake_handle_callback(p, code, code_verifier):
        return profile

    monkeypatch.setattr(
        "app.api.oauth._handle_callback_fetch",
        fake_handle_callback,
    )


async def _seed_state(provider: str = "google", mode: str = "login",
                      linker_user_id: int | None = None) -> str:
    from app.services import oauth_state_service
    state = oauth_state_service.new_token()
    await oauth_state_service.put_state(
        state, provider=provider, return_to="/", code_verifier="v",
        mode=mode, linker_user_id=linker_user_id,
    )
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
    # 检查 cookie
    cookies = r.headers.get_list("set-cookie")
    assert any(c.startswith("oauth_exchange=") for c in cookies)
    cookie_line = [c for c in cookies if c.startswith("oauth_exchange=")][0]
    assert "HttpOnly" in cookie_line
    assert "SameSite=Strict" in cookie_line
    assert "Path=/api/auth/oauth/exchange" in cookie_line
    assert "Max-Age=60" in cookie_line

    # 清理 — 删测试用户
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
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `cd backend && .venv/bin/pytest tests/test_oauth_routes.py::test_callback_rejects_unknown_state -v`
Expected: 404(callback 不存在)

- [ ] **Step 3: 实现 callback**

修改 `backend/app/api/oauth.py`,在文件顶部 import 段加:

```python
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from ..deps import get_db
from ..logging_config import get_logger
from ..metrics import auth_oauth_total
from ..models import AuditLog
from ..services import oauth_linking_service
from ..services.oauth_providers import NormalizedProfile, OAuthError, make_oauth_client
from fastapi import Depends, Response
```

然后加 helpers + callback handler:

```python
log = get_logger(__name__)


async def _handle_callback_fetch(p, code: str, code_verifier: str) -> NormalizedProfile:
    """单独提出来,为了让单测 monkeypatch 替换。"""
    client = make_oauth_client(p)
    try:
        token = await client.fetch_token(
            url=p.token_url,
            authorization_response=None,
            code=code,
            redirect_uri=p.redirect_uri(),
            code_verifier=code_verifier,
        )
    finally:
        await client.aclose()
    return await p.fetch_profile(client, token)


def _frontend_url(path: str) -> str:
    base = (settings.oauth_frontend_base_url or "http://localhost:5173").rstrip("/")
    return f"{base}{path}"


def _audit(db: Session, action: str, *, target_id: int | None = None,
           metadata: dict | None = None) -> None:
    db.add(AuditLog(
        actor_user_id=None,
        action=action,
        target_type="user" if target_id else None,
        target_id=target_id,
        metadata_json=metadata,
    ))


@router.get("/{provider}/callback")
async def callback(
    provider: str,
    request: Request,
    db: Session = Depends(get_db),
) -> RedirectResponse:
    p = OAUTH_PROVIDERS.get(provider)
    if p is None or not p.configured:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    code = request.query_params.get("code")
    state = request.query_params.get("state")
    if not code or not state:
        return RedirectResponse(_frontend_url("/login?error=state_expired"), status_code=302)

    state_data = await oauth_state_service.consume_state(state)
    if not state_data or state_data.get("provider") != provider:
        _audit(db, "oauth_state_mismatch")
        db.commit()
        auth_oauth_total.labels(provider=provider, outcome="error_state").inc()
        return RedirectResponse(_frontend_url("/login?error=state_expired"), status_code=302)

    mode = state_data.get("mode", "login")
    return_to = state_data.get("return_to", "/")
    code_verifier = state_data["code_verifier"]

    try:
        profile = await _handle_callback_fetch(p, code, code_verifier)
    except (OAuthError, Exception) as e:
        log.warning("oauth_upstream_failed", provider=provider, err=str(e))
        auth_oauth_total.labels(provider=provider, outcome="error_upstream").inc()
        return RedirectResponse(_frontend_url("/login?error=upstream_failure"), status_code=302)

    if not profile.email_verified:
        _audit(db, "oauth_unverified_email")
        db.commit()
        auth_oauth_total.labels(provider=provider, outcome="error_email").inc()
        return RedirectResponse(_frontend_url("/login?error=email_unverified"), status_code=302)

    # ----- mode == link -----
    if mode == "link":
        linker_id = state_data.get("linker_user_id")
        if not linker_id:
            return RedirectResponse(_frontend_url("/settings/connections?error=state_expired"),
                                    status_code=302)
        try:
            with db.begin():
                oauth_linking_service.attach_to_existing(
                    db, user_id=linker_id, provider=provider,
                    subject=profile.sub, email=profile.email,
                )
            _audit(db, "oauth_link", target_id=linker_id)
            db.commit()
            auth_oauth_total.labels(provider=provider, outcome="link").inc()
            return RedirectResponse(
                _frontend_url(f"/settings/connections?linked={provider}"),
                status_code=302,
            )
        except oauth_linking_service.OAuthProviderInUse:
            _audit(db, "oauth_provider_in_use", target_id=linker_id)
            db.commit()
            auth_oauth_total.labels(provider=provider, outcome="error_in_use").inc()
            return RedirectResponse(
                _frontend_url("/settings/connections?error=provider_in_use"),
                status_code=302,
            )

    # ----- mode == login (default) -----
    try:
        with db.begin():
            outcome, user = oauth_linking_service.find_or_create_user(
                db, provider=provider, subject=profile.sub,
                email=profile.email, name=profile.name,
            )
        action = {"signup": "oauth_signup", "login": "oauth_login", "link": "oauth_link"}[outcome]
        _audit(db, action, target_id=user.id)
        db.commit()
    except oauth_linking_service.OAuthEmailConflict:
        _audit(db, "oauth_email_conflict")
        db.commit()
        auth_oauth_total.labels(provider=provider, outcome="error_conflict").inc()
        return RedirectResponse(
            _frontend_url("/login?error=email_already_registered"),
            status_code=302,
        )
    except oauth_linking_service.OAuthUserDisabled:
        auth_oauth_total.labels(provider=provider, outcome="error_disabled").inc()
        return RedirectResponse(_frontend_url("/login?error=account_disabled"),
                                status_code=302)

    auth_oauth_total.labels(provider=provider, outcome=outcome).inc()

    exchange_code = await oauth_state_service.put_exchange_code(user.id)

    resp = RedirectResponse(
        _frontend_url(f"/auth/oauth/complete?return_to={return_to}"),
        status_code=302,
    )
    resp.set_cookie(
        key="oauth_exchange",
        value=exchange_code,
        max_age=60,
        path="/api/auth/oauth/exchange",
        secure=settings.is_production,  # dev allow http://localhost
        httponly=True,
        samesite="strict",
    )
    return resp
```

注:`AuditLog.metadata_json` 字段假设存在;如果项目里字段名不同(可能是 `metadata`),用真实名字。run task 5/6 时若发现 ORM 报错回头改。

- [ ] **Step 4: 加 metrics 占位**

在 `backend/app/metrics.py` 末尾追加:

```python
# --- OAuth ---
auth_oauth_total = Counter(
    "auth_oauth_total",
    "OAuth flow outcomes",
    labelnames=("provider", "outcome"),
)

auth_oauth_latency_ms = Histogram(
    "auth_oauth_latency_ms",
    "OAuth callback total latency in ms",
    labelnames=("provider",),
    buckets=(50, 100, 200, 500, 1000, 2000, 5000),
)

auth_signup_rate_limited_total = Counter(
    "auth_signup_rate_limited_total",
    "Signup attempts blocked by IP rate limit",
)
```

- [ ] **Step 5: 跑测试**

Run: `cd backend && .venv/bin/pytest tests/test_oauth_routes.py -v`
Expected: 全 PASS。如果 `AuditLog.metadata_json` 字段名不对,本步会报错——`grep -n metadata backend/app/models/audit_log.py` 看真实字段名,然后改 `_audit()` 实现。

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/oauth.py backend/app/metrics.py backend/tests/test_oauth_routes.py
git commit -m "feat(oauth): callback with PKCE token exchange, cookie issuance, audit/metrics"
```

---

## Task 4.4 — `POST /api/auth/oauth/exchange`

**Files:**
- Modify: `backend/app/api/oauth.py`
- Modify: `backend/tests/test_oauth_routes.py`

- [ ] **Step 1: 加测试**

追加到 `backend/tests/test_oauth_routes.py`:

```python
def test_exchange_401_when_no_cookie():
    r = client.post("/api/auth/oauth/exchange")
    assert r.status_code == 401


def test_exchange_returns_tokens_and_clears_cookie(monkeypatch):
    import asyncio
    from app.services import oauth_state_service

    # 准备一个已存在的 user
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

        code = asyncio.get_event_loop().run_until_complete(
            oauth_state_service.put_exchange_code(uid)
        )

        r = client.post(
            "/api/auth/oauth/exchange",
            cookies={"oauth_exchange": code},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["access_token"]
        assert body["refresh_token"]
        assert body["user"]["email"] == email

        # cookie cleared
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

        code = asyncio.get_event_loop().run_until_complete(
            oauth_state_service.put_exchange_code(u.id)
        )
        # 第一次 OK
        assert client.post("/api/auth/oauth/exchange",
                           cookies={"oauth_exchange": code}).status_code == 200
        # 第二次 401
        assert client.post("/api/auth/oauth/exchange",
                           cookies={"oauth_exchange": code}).status_code == 401
    finally:
        db.query(User).filter(User.email == email).delete()
        db.commit()
        db.close()
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `cd backend && .venv/bin/pytest tests/test_oauth_routes.py::test_exchange_401_when_no_cookie -v`
Expected: 404(端点未实现)

- [ ] **Step 3: 实现 exchange endpoint**

修改 `backend/app/api/oauth.py`,在 import 段加:

```python
from ..models import User as UserModel
from ..schemas.auth import LoginResponse, UserOut
from ..security import create_access_token
from ..services import auth_service
```

(如果 `from ..models import User as UserModel` 已经在前面 task 加过则跳过。)

在文件末尾加:

```python
def _clear_exchange_cookie(resp: Response) -> None:
    resp.set_cookie(
        key="oauth_exchange",
        value="",
        max_age=0,
        path="/api/auth/oauth/exchange",
        secure=settings.is_production,
        httponly=True,
        samesite="strict",
    )


@router.post("/exchange", response_model=LoginResponse)
async def exchange(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> LoginResponse:
    code = request.cookies.get("oauth_exchange")
    if not code:
        _clear_exchange_cookie(response)
        raise HTTPException(status_code=401)

    user_id = await oauth_state_service.consume_exchange_code(code)
    _clear_exchange_cookie(response)
    if user_id is None:
        raise HTTPException(status_code=401)

    user = db.query(UserModel).filter_by(id=user_id).one_or_none()
    if user is None or user.status != "active":
        raise HTTPException(status_code=401)

    access = create_access_token(str(user.id), extra={"role": user.role})
    refresh, _ = auth_service.issue_refresh_token(
        db, user_id=user.id,
        user_agent=(request.headers.get("user-agent") or "")[:255] or None,
        ip=request.client.host if request.client else None,
    )
    return LoginResponse(
        access_token=access,
        refresh_token=refresh,
        access_expires_in=settings.jwt_access_ttl_minutes * 60,
        user=UserOut.model_validate(user),
    )
```

- [ ] **Step 4: 跑测试**

Run: `cd backend && .venv/bin/pytest tests/test_oauth_routes.py -k exchange -v`
Expected: 3 个测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/oauth.py backend/tests/test_oauth_routes.py
git commit -m "feat(oauth): POST /exchange consumes cookie and returns LoginResponse"
```

---

## Task 4.5 — `POST /api/auth/oauth/{provider}/link/start`

**Files:**
- Modify: `backend/app/api/oauth.py`
- Modify: `backend/tests/test_oauth_routes.py`

- [ ] **Step 1: 加测试**

追加到 `backend/tests/test_oauth_routes.py`:

```python
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
```

注:此测试依赖 conftest 提供的 `jwt` fixture(已在 `tests/conftest.py` 中)。

- [ ] **Step 2: 跑测试,确认失败**

Run: `cd backend && .venv/bin/pytest tests/test_oauth_routes.py::test_link_start_requires_jwt -v`
Expected: 404 或 405(端点不存在)

- [ ] **Step 3: 实现 link/start**

修改 `backend/app/api/oauth.py`,在 import 段加:

```python
from ..deps import get_current_user
from ..models import User as UserModel
from ..schemas.oauth import OAuthLinkStartRequest, OAuthLinkStartResponse
```

在末尾加:

```python
@router.post("/{provider}/link/start", response_model=OAuthLinkStartResponse)
async def link_start(
    provider: str,
    payload: OAuthLinkStartRequest,
    user: UserModel = Depends(get_current_user),
) -> OAuthLinkStartResponse:
    p = OAUTH_PROVIDERS.get(provider)
    if p is None or not p.configured:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    return_to = _safe_return_to(payload.return_to)
    state = oauth_state_service.new_token()
    verifier = oauth_state_service.new_token(64)
    challenge = _pkce_challenge(verifier)

    await oauth_state_service.put_state(
        state,
        provider=provider,
        return_to=return_to,
        code_verifier=verifier,
        mode="link",
        linker_user_id=user.id,
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
    return OAuthLinkStartResponse(redirect_url=f"{p.authorize_url}?{qs}")
```

- [ ] **Step 4: 跑测试**

Run: `cd backend && .venv/bin/pytest tests/test_oauth_routes.py -k link_start -v`
Expected: 2 个测试 PASS。

- [ ] **Step 5: 集成测试 — link 模式 callback**

追加测试:

```python
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
    assert "/settings/connections?linked=google" in r.headers["location"]
    # 不应该设 exchange cookie(link 模式)
    cookies = r.headers.get_list("set-cookie")
    assert not any(c.startswith("oauth_exchange=") and "Max-Age=60" in c for c in cookies)

    # 清理
    from app.database import SessionLocal
    from app.models import OAuthIdentity
    db = SessionLocal()
    try:
        db.query(OAuthIdentity).filter(OAuthIdentity.provider_subject == "link-cb-1").delete()
        db.commit()
    finally:
        db.close()
```

Run: `cd backend && .venv/bin/pytest tests/test_oauth_routes.py::test_link_callback_attaches_identity_to_current_user -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/oauth.py backend/tests/test_oauth_routes.py
git commit -m "feat(oauth): POST /{provider}/link/start with JWT + callback link mode"
```

---

# Phase 5 — 反滥用基线

## Task 5.1 — IP signup 限流(callback signup 分支)

**Files:**
- Create: `backend/app/services/abuse_mitigation_service.py`
- Modify: `backend/app/api/oauth.py`
- Create: `backend/tests/test_abuse_mitigation.py`

- [ ] **Step 1: 写 abuse_mitigation_service**

新文件 `backend/app/services/abuse_mitigation_service.py`:

```python
"""Per-IP signup counter and per-user daily API key quota.

Both backed by Redis daily-rotating counters.
"""
from __future__ import annotations

from datetime import datetime, timezone

from ..config import get_settings
from ..redis_client import get_redis

settings = get_settings()


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d")


async def check_and_incr_signup_ip(ip: str) -> tuple[bool, int]:
    """Returns (allowed, current_count). Increments only when allowed."""
    redis = get_redis()
    key = f"signup_ip_count:{ip}:{_today()}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 86400)
    if count > settings.signup_per_ip_per_day:
        return (False, count)
    return (True, count)


async def check_and_incr_api_key_quota(user_id: int) -> tuple[bool, int]:
    """Returns (allowed, current_count). Increments only when allowed."""
    redis = get_redis()
    key = f"api_key_quota:{user_id}:{_today()}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 86400)
    if count > settings.api_key_per_user_per_day:
        # 已经 incr 了,撤销以避免 quota 莫名变多
        await redis.decr(key)
        return (False, count - 1)
    return (True, count)
```

- [ ] **Step 2: 写测试**

新文件 `backend/tests/test_abuse_mitigation.py`:

```python
import pytest

from app.services import abuse_mitigation_service as svc
from tests.conftest import needs_redis


@needs_redis
async def test_ip_signup_allows_up_to_limit_then_blocks(monkeypatch):
    monkeypatch.setattr(svc.settings, "signup_per_ip_per_day", 3)
    ip = "test-ip-allow-block-1"
    # 清缓存
    from app.redis_client import get_redis
    r = get_redis()
    await r.delete(f"signup_ip_count:{ip}:{svc._today()}")

    for i in range(3):
        allowed, count = await svc.check_and_incr_signup_ip(ip)
        assert allowed
        assert count == i + 1
    # 第 4 次拒
    allowed, count = await svc.check_and_incr_signup_ip(ip)
    assert not allowed


@needs_redis
async def test_api_key_quota_allows_up_to_limit(monkeypatch):
    monkeypatch.setattr(svc.settings, "api_key_per_user_per_day", 2)
    uid = 999999
    from app.redis_client import get_redis
    r = get_redis()
    await r.delete(f"api_key_quota:{uid}:{svc._today()}")

    allowed, _ = await svc.check_and_incr_api_key_quota(uid)
    assert allowed
    allowed, _ = await svc.check_and_incr_api_key_quota(uid)
    assert allowed
    allowed, _ = await svc.check_and_incr_api_key_quota(uid)
    assert not allowed
```

- [ ] **Step 3: 跑测试**

Run: `cd backend && .venv/bin/pytest tests/test_abuse_mitigation.py -v`
Expected: 2 个测试 PASS。

- [ ] **Step 4: 在 callback signup 分支前加 IP gate**

**设计**:callback 是 async,所以 `check_and_incr_signup_ip` 可以直接 `await`。问题是我们不能在不知道是不是 signup 时就 incr counter,否则 login/link 路径也会扣 IP 配额。

**方案**:在 callback 进入 `find_or_create_user` 之前,先做一次 read-only 查询判定「will_signup」。如果是 signup 才 await IP gate;否则跳过。

修改 `backend/app/api/oauth.py`:

加 imports:
```python
import hashlib

from ..services import abuse_mitigation_service
from ..metrics import auth_signup_rate_limited_total
```

`OAuthIdentity` 应已在前面 task 中 import 过,如未则加:
```python
from ..models import OAuthIdentity
```

加 helper:
```python
def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
```

在 callback 函数内,**login mode 分支顶部**(在原本的 `try: with db.begin(): outcome, user = find_or_create_user(...)` 之前),插入:

```python
client_ip = _client_ip(request)

# 预判会不会 signup(read-only,不进事务):
# 若 (provider, sub) 已绑 → login;否则查同 email user → 若有就 link,若无就 signup。
existing_identity = (
    db.query(OAuthIdentity)
      .filter_by(provider=provider, provider_subject=profile.sub)
      .first()
)
will_signup = False
if existing_identity is None:
    existing_user = (
        db.query(UserModel).filter_by(email=profile.email.lower()).first()
    )
    will_signup = existing_user is None

if will_signup:
    allowed, _count = await abuse_mitigation_service.check_and_incr_signup_ip(client_ip)
    if not allowed:
        ip_hash = hashlib.sha256(client_ip.encode()).hexdigest()[:16]
        _audit(db, "oauth_signup_rate_limited", metadata={"ip_hash": ip_hash})
        db.commit()
        auth_signup_rate_limited_total.inc()
        return RedirectResponse(
            _frontend_url("/login?error=signup_rate_limited"),
            status_code=302,
        )
```

**注意**: 这里有个 TOCTOU 窗口——`will_signup` 预判和事务里实际 signup 之间,理论上有别的请求可能创建了同 email user(让本次降级为 link),或者删除了 identity(让本次升级为 signup)。在实际负载下窗口 << 50ms,可接受。如果未来要严格,把 IP gate 移到 service 内部的 Case 3 分支并把 service 改成 async。

**不需要**修改 `oauth_linking_service.find_or_create_user` 签名或加新异常类——`OAuthSignupRateLimited` 也不需要,因为在 callback 内直接 short-circuit return 了。

- [ ] **Step 5: 加 callback 集成测**

追加到 `backend/tests/test_oauth_routes.py`:

```python
def test_callback_signup_blocked_after_ip_quota_reached(monkeypatch):
    import asyncio
    from app import config
    _set_google_configured(monkeypatch)
    monkeypatch.setenv("SIGNUP_PER_IP_PER_DAY", "1")
    config.get_settings.cache_clear()

    from app.services import abuse_mitigation_service
    # 重新 import 让 settings 生效
    import importlib
    importlib.reload(abuse_mitigation_service)

    # 第 1 次 signup OK
    _stub_profile(monkeypatch, "google", NormalizedProfile(
        sub="quota-1", email="quota-1@example.com",
        email_verified=True, name="Q1",
    ))
    state1 = asyncio.get_event_loop().run_until_complete(_seed_state())
    r1 = client.get(f"/api/auth/oauth/google/callback?code=x&state={state1}",
                    follow_redirects=False)
    assert "oauth_exchange=" in (r1.headers.get("set-cookie") or "")

    # 第 2 次 — 不同 email、不同 sub — 被限
    _stub_profile(monkeypatch, "google", NormalizedProfile(
        sub="quota-2", email="quota-2@example.com",
        email_verified=True, name="Q2",
    ))
    state2 = asyncio.get_event_loop().run_until_complete(_seed_state())
    r2 = client.get(f"/api/auth/oauth/google/callback?code=x&state={state2}",
                    follow_redirects=False)
    assert "error=signup_rate_limited" in r2.headers["location"]

    # 清理
    monkeypatch.delenv("SIGNUP_PER_IP_PER_DAY", raising=False)
    config.get_settings.cache_clear()
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
```

- [ ] **Step 6: 跑测试**

Run: `cd backend && .venv/bin/pytest tests/test_abuse_mitigation.py tests/test_oauth_routes.py::test_callback_signup_blocked_after_ip_quota_reached -v`
Expected: 全 PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/abuse_mitigation_service.py \
        backend/app/api/oauth.py \
        backend/tests/test_abuse_mitigation.py \
        backend/tests/test_oauth_routes.py
git commit -m "feat(oauth): IP signup rate limit on callback signup branch"
```

---

## Task 5.2 — 每用户每天 API key quota

**Files:**
- Modify: `backend/app/api/keys.py`
- Modify: `backend/tests/test_abuse_mitigation.py`(或新增 test_keys_quota.py)

- [ ] **Step 1: 加测试**

新文件 `backend/tests/test_keys_quota.py`:

```python
import pytest

from app import config
from tests.conftest import _db_reachable, _redis_reachable

pytestmark = pytest.mark.skipif(
    not (_db_reachable() and _redis_reachable()),
    reason="needs Postgres + Redis",
)


def test_api_key_creation_blocked_after_quota(monkeypatch, client, jwt):
    monkeypatch.setenv("API_KEY_PER_USER_PER_DAY", "2")
    config.get_settings.cache_clear()

    import importlib
    from app.services import abuse_mitigation_service
    importlib.reload(abuse_mitigation_service)

    hdr = {"Authorization": f"Bearer {jwt}"}
    assert client.post("/api/keys", headers=hdr, json={"name": "k1"}).status_code == 200
    assert client.post("/api/keys", headers=hdr, json={"name": "k2"}).status_code == 200
    r3 = client.post("/api/keys", headers=hdr, json={"name": "k3"})
    assert r3.status_code == 429

    # 清
    monkeypatch.delenv("API_KEY_PER_USER_PER_DAY", raising=False)
    config.get_settings.cache_clear()
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `cd backend && .venv/bin/pytest tests/test_keys_quota.py -v`
Expected: 三次都 200(quota 没生效)

- [ ] **Step 3: 在 /api/keys 路由加 quota check**

修改 `backend/app/api/keys.py`,在 `POST /api/keys` 路由函数顶部加(取决于路由签名,大致是这样):

```python
from ..services import abuse_mitigation_service

@router.post("/", ...)
async def create(...):
    allowed, _ = await abuse_mitigation_service.check_and_incr_api_key_quota(user.id)
    if not allowed:
        from ..models import AuditLog
        db.add(AuditLog(
            actor_user_id=user.id, action="api_key_quota_exceeded",
            target_type="user", target_id=user.id,
        ))
        db.commit()
        raise HTTPException(429, detail="Daily API key creation limit reached, try tomorrow")
    # ... 现有创建逻辑
```

注:如果 `create` 是 sync 函数,需要把它改成 async 并把 `db` 通过 `Depends(get_db)` 注入(应该已是)。如果不行,改用 `asyncio.run` 不可取——把整个端点改成 async 更合适。

Run `grep -n "def.*create\|@router.post" backend/app/api/keys.py` 看真实签名,按需改。

- [ ] **Step 4: 跑测试**

Run: `cd backend && .venv/bin/pytest tests/test_keys_quota.py -v`
Expected: PASS

- [ ] **Step 5: 跑现有 keys 测试无回归**

Run: `cd backend && .venv/bin/pytest tests/test_auth_flow.py::test_api_key_lifecycle -v`
Expected: PASS(默认 quota=5,2 次创建在限内)

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/keys.py backend/tests/test_keys_quota.py
git commit -m "feat(keys): per-user daily API key creation quota"
```

---

# Phase 6 — Admin / Settings endpoints / main 注册

## Task 6.1 — Admin 「标记邮箱已验证」 endpoint

**Files:**
- Modify: `backend/app/api/admin.py`
- Create: `backend/tests/test_admin_mark_verified.py`

- [ ] **Step 1: 加测试**

新文件 `backend/tests/test_admin_mark_verified.py`:

```python
import pytest

from app.database import SessionLocal
from app.models import User
from decimal import Decimal

from tests.conftest import _db_reachable

pytestmark = pytest.mark.skipif(not _db_reachable(), reason="needs Postgres")


def test_admin_mark_verified_sets_field(client, admin_jwt):
    db = SessionLocal()
    email = "to-be-verified@example.com"
    try:
        db.query(User).filter(User.email == email).delete()
        u = User(email=email, password_hash="x", role="user", status="active",
                 balance=Decimal("0"), email_verified_at=None)
        db.add(u); db.commit(); db.refresh(u)
        uid = u.id

        r = client.post(
            f"/api/admin/users/{uid}/mark-email-verified",
            headers={"Authorization": f"Bearer {admin_jwt}"},
        )
        assert r.status_code == 200

        db.refresh(u)
        assert u.email_verified_at is not None
    finally:
        db.query(User).filter(User.email == email).delete()
        db.commit()
        db.close()


def test_mark_verified_requires_admin(client, jwt):
    r = client.post(
        "/api/admin/users/1/mark-email-verified",
        headers={"Authorization": f"Bearer {jwt}"},
    )
    assert r.status_code in (401, 403)
```

注:`admin_jwt` fixture 假设存在。如果不存在,在 conftest.py 加(检查现有 `tests/conftest.py` 中是否有 admin user fixture 类似的)。

- [ ] **Step 2: 跑测试,确认失败**

Run: `cd backend && .venv/bin/pytest tests/test_admin_mark_verified.py -v`
Expected: 404 或 fixture 未定义

- [ ] **Step 3: 添加 admin_jwt fixture(如未存在)**

修改 `backend/tests/conftest.py`,在文件末尾追加(如果还没有):

```python
@pytest.fixture
def admin_user():
    if not _db_reachable():
        pytest.skip("Postgres not reachable")
    db = SessionLocal()
    try:
        email = "pytest-admin@example.com"
        u = db.query(User).filter(User.email == email).one_or_none()
        if u is None:
            u = User(email=email, password_hash=hash_password(TEST_USER_PASSWORD),
                    role="admin", status="active", balance=Decimal("0"))
            db.add(u); db.commit(); db.refresh(u)
        yield u
    finally:
        db.close()


@pytest.fixture
def admin_jwt(client, admin_user):
    r = client.post("/api/auth/login",
                    json={"email": admin_user.email, "password": TEST_USER_PASSWORD})
    return r.json()["access_token"]
```

- [ ] **Step 4: 添加 admin endpoint**

修改 `backend/app/api/admin.py`,加(替换 admin user 路由组里):

```python
from datetime import datetime, timezone

from ..models import AuditLog, User as UserModel


@router.post("/users/{user_id}/mark-email-verified")
def mark_email_verified(
    user_id: int,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin),
):
    u = db.query(UserModel).filter_by(id=user_id).with_for_update().one_or_none()
    if u is None:
        raise HTTPException(404, "user not found")
    if u.email_verified_at is not None:
        return {"email_verified_at": u.email_verified_at}

    now = datetime.now(timezone.utc)
    u.email_verified_at = now
    db.add(AuditLog(
        actor_user_id=admin.id,
        action="email_marked_verified",
        target_type="user", target_id=u.id,
    ))
    db.commit()
    return {"email_verified_at": now}
```

注:`get_current_admin` 应该已存在(检查 `backend/app/deps.py`)。如不存在,用 `get_current_user` 然后断言 `user.role == "admin"`。

- [ ] **Step 5: Admin 新建用户时 email_verified_at 默认 now()**

找到 admin 新建用户的路由(`grep -n "create_user\|post.*users" backend/app/api/admin.py`),修改:

```python
@router.post("/users", ...)
def create_user(payload, db, admin):
    u = UserModel(
        email=payload.email,
        ...
        email_verified_at=(None if payload.email_unverified else datetime.now(timezone.utc)),
    )
    ...
```

`payload` 加可选字段 `email_unverified: bool = False`(如 schema 已有 admin user-create 请求 schema,加这个 field;如没有,先在路由内直接设 `now()`)。

- [ ] **Step 6: 跑测试**

Run: `cd backend && .venv/bin/pytest tests/test_admin_mark_verified.py -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/admin.py backend/tests/conftest.py backend/tests/test_admin_mark_verified.py
git commit -m "feat(admin): mark-email-verified endpoint + default verified on user-create"
```

---

## Task 6.2 — `/api/settings/connections` 列出 + 解绑

**Files:**
- Create: `backend/app/api/settings_connections.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_settings_connections.py`

- [ ] **Step 1: 写测试**

新文件 `backend/tests/test_settings_connections.py`:

```python
import pytest
from decimal import Decimal
from datetime import datetime, timezone

from app.database import SessionLocal
from app.models import OAuthIdentity, User
from tests.conftest import _db_reachable

pytestmark = pytest.mark.skipif(not _db_reachable(), reason="needs Postgres")


def test_list_connections_returns_user_identities(client, jwt, test_user):
    db = SessionLocal()
    try:
        identity = OAuthIdentity(
            user_id=test_user.id,
            provider="google",
            provider_subject="g-list-1",
        )
        db.add(identity); db.commit(); db.refresh(identity)
        iid = identity.id

        r = client.get("/api/settings/connections",
                       headers={"Authorization": f"Bearer {jwt}"})
        assert r.status_code == 200
        body = r.json()
        assert any(i["id"] == iid and i["provider"] == "google" for i in body)
    finally:
        db.query(OAuthIdentity).filter_by(provider_subject="g-list-1").delete()
        db.commit()
        db.close()


def test_detach_succeeds_when_password_exists(client, jwt, test_user):
    db = SessionLocal()
    try:
        identity = OAuthIdentity(user_id=test_user.id, provider="github",
                                 provider_subject="gh-detach-1")
        db.add(identity); db.commit(); db.refresh(identity)
        iid = identity.id

        r = client.delete(f"/api/settings/connections/{iid}",
                          headers={"Authorization": f"Bearer {jwt}"})
        assert r.status_code == 204
    finally:
        db.query(OAuthIdentity).filter_by(provider_subject="gh-detach-1").delete()
        db.commit()
        db.close()


def test_detach_fails_when_last_method(client):
    db = SessionLocal()
    email = "detach-last-route@example.com"
    db.query(User).filter(User.email == email).delete()
    try:
        u = User(email=email, password_hash=None, role="user", status="active",
                 balance=Decimal("0"),
                 email_verified_at=datetime.now(timezone.utc))
        db.add(u); db.commit(); db.refresh(u)
        identity = OAuthIdentity(user_id=u.id, provider="google",
                                 provider_subject="g-detach-last")
        db.add(identity); db.commit(); db.refresh(identity)

        # 拿 user 的 JWT
        from app.security import create_access_token
        token = create_access_token(str(u.id), extra={"role": "user"})

        r = client.delete(f"/api/settings/connections/{identity.id}",
                          headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 409
    finally:
        db.query(OAuthIdentity).filter_by(user_id=u.id).delete()
        db.query(User).filter(User.email == email).delete()
        db.commit()
        db.close()
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `cd backend && .venv/bin/pytest tests/test_settings_connections.py -v`
Expected: 404(端点未实现)

- [ ] **Step 3: 实现路由**

新文件 `backend/app/api/settings_connections.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db
from ..models import AuditLog, User
from ..schemas.oauth import OAuthIdentityOut
from ..services import oauth_linking_service

router = APIRouter(prefix="/api/settings/connections", tags=["settings"])


@router.get("", response_model=list[OAuthIdentityOut])
def list_connections(user: User = Depends(get_current_user)):
    return [OAuthIdentityOut.model_validate(i) for i in user.oauth_identities]


@router.delete("/{identity_id}", status_code=204)
def detach(
    identity_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        with db.begin():
            oauth_linking_service.detach(db, user_id=user.id, identity_id=identity_id)
        db.add(AuditLog(
            actor_user_id=user.id, action="oauth_unlink",
            target_type="user", target_id=user.id,
        ))
        db.commit()
    except oauth_linking_service.OAuthIdentityNotFound:
        raise HTTPException(404, "identity not found")
    except oauth_linking_service.OAuthCannotDetachLast:
        raise HTTPException(409, "Cannot detach the last login method. "
                                 "Set a password first or link another provider.")
```

修改 `backend/app/main.py`,在 import 段加:

```python
from .api import settings_connections as settings_connections_api
```
注册:

```python
app.include_router(settings_connections_api.router)
```

- [ ] **Step 4: 跑测试**

Run: `cd backend && .venv/bin/pytest tests/test_settings_connections.py -v`
Expected: 3 个测试 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/settings_connections.py backend/app/main.py backend/tests/test_settings_connections.py
git commit -m "feat(settings): GET / DELETE /api/settings/connections endpoints"
```

---

## Task 6.3 — Scrub list 扩充 + 指标确认

**Files:**
- Modify: `backend/app/middleware.py` 或现有 scrub 工具(grep 确认)
- Confirm: `backend/app/metrics.py` 已加 OAuth 指标(Task 4.3)

- [ ] **Step 1: 找到现有 scrub 实现**

Run: `grep -rn "scrub\|redact" backend/app/ --include="*.py" | head -10`

Expected: 输出含 scrub list / redact 逻辑的文件(可能在 `middleware.py` 或 `logging_config.py`)。

- [ ] **Step 2: 加 OAuth 相关 key 到 scrub list**

修改找到的 scrub 文件,把以下 keys 加入黑名单(已有列表上追加):

```python
SCRUB_KEYS = {
    # ... existing keys ...
    "code", "state", "code_verifier", "code_challenge",
    "access_token", "id_token", "refresh_token",
    "client_secret",
}
```

- [ ] **Step 3: 烟囱测**

Run: `cd backend && .venv/bin/pytest tests/ -v --tb=short` 全 suite 验证无回归。

Expected: 全 PASS(可能 OAuth-related 某些前面跑过的测试同时跑)。

- [ ] **Step 4: Commit**

```bash
git add backend/app/middleware.py  # 或真实文件路径
git commit -m "chore(security): scrub OAuth tokens/codes from request logs"
```

---

# Phase 7 — 文档同步

## Task 7.1 — CLAUDE.md 更新

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 按 spec § 10 改 CLAUDE.md**

执行下面 6 处改动(用 Read 工具先看每段的现状,再用 Edit 工具改):

**改动 1**: `## What this is, what it isn't` 节中 `**Isn't**` 段,删 "There's no signup ... Users are provisioned by an admin." 句。改成:

> Self-serve sign-up via Google / GitHub OAuth is supported (open registration, default balance 0); admin manual provisioning still works as before. No online payments, no per-org workspaces, no chat product.

**改动 2**: `## Critical invariants — do not break` 加两条新 invariant(在最后一条之后):

> **OAuth 自动账号合并要求 verified email**:在 `OAuthLinkingService` 路径里,合并到已存在 User 必须满足 `User.email_verified_at IS NOT NULL`,否则抛 `OAuthEmailConflict`。这是对 [Account Pre-hijacking](https://www.usenix.org/conference/usenixsecurity22/presentation/sudhodanan) 攻击的核心防护,不要绕过。
>
> **OAuth signup IP 限流不能绕**:`/api/auth/oauth/*/callback` 的 signup 分支必须先过 `signup_ip_count` 计数器(默认 10/IP/day)。`/api/keys` 必须先过 `api_key_quota` 计数器(默认 5/user/day)。这是开放注册的反滥用基线,绕过会让 DB / Redis 在被扫的时候撑爆。

**改动 3**: `## Configuration & startup safety` 节加 OAuth env vars 校验说明:

> OAuth 端配置:`GOOGLE_OAUTH_CLIENT_ID/_SECRET`、`GITHUB_OAUTH_CLIENT_ID/_SECRET`、`OAUTH_BACKEND_BASE_URL`、`OAUTH_FRONTEND_BASE_URL`。生产环境校验:配了 `*_client_id` 必须有 `*_client_secret`;url 必须 https;backend / frontend url 必须同站(eTLD+1 相同),否则 `SameSite=Strict` cookie 会失效。`SIGNUP_PER_IP_PER_DAY`(默认 10)和 `API_KEY_PER_USER_PER_DAY`(默认 5)必须 >= 1。

**改动 4**: `## Frontend conventions` 节加段:

> **OAuth 一次性 exchange cookie 是唯一被允许的 HttpOnly cookie**。callback 后到 exchange 之间用 `oauth_exchange` cookie 传一次性 code,60s TTL,`Path=/api/auth/oauth/exchange`,`SameSite=Strict`。除此之外项目其它 token 仍走「JSON 返回 + 前端持有」模式,不要不假思索地把别的会话状态也搬到 cookie。

**改动 5**: `## Where the seams are if you need to extend` 表加两行:

| Add a new OAuth provider | New entry in `OAUTH_PROVIDERS` dict in `oauth_providers.py` + env vars + Authlib registration |
| Change abuse-mitigation thresholds | `SIGNUP_PER_IP_PER_DAY` / `API_KEY_PER_USER_PER_DAY` env vars; default values are deliberately strict |

**改动 6**: `## Things to NOT reintroduce` 加一条:

> **Auto-link OAuth identity to any existing User by email alone** — 必须用 `email_verified_at IS NOT NULL` 做 gate。详见 `docs/superpowers/specs/2026-05-19-oauth-login-design.md` § 6.1 Case 2 和 Account Pre-hijacking 引用。

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): document OAuth login posture, invariants, conventions"
```

---

## Task 7.2 — README 更新

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 加 OAuth env vars 到 cheat sheet**

找到 `## Local dev cheat sheet` 节,在环境变量段加(注释清楚是可选):

```bash
# OAuth (optional; configure to enable Google/GitHub login)
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GITHUB_OAUTH_CLIENT_ID=
GITHUB_OAUTH_CLIENT_SECRET=
OAUTH_BACKEND_BASE_URL=http://localhost:8000
OAUTH_FRONTEND_BASE_URL=http://localhost:5173

# Anti-abuse defaults (override only if needed)
SIGNUP_PER_IP_PER_DAY=10
API_KEY_PER_USER_PER_DAY=5
```

- [ ] **Step 2: 加 `## OAuth (optional)` 一节**

在 README 末尾加:

```markdown
## OAuth (optional)

To enable Google / GitHub login:

### Google

1. Go to https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 Client ID → Web application
3. Authorized redirect URIs:
   - dev: `http://localhost:8000/api/auth/oauth/google/callback`
   - prod: `https://api.YOUR-DOMAIN/api/auth/oauth/google/callback`
4. Copy Client ID / Secret to env

### GitHub

1. Settings → Developer settings → OAuth Apps → New OAuth App
2. Authorization callback URL: same as above (GitHub version)
3. Copy Client ID / generate Client Secret to env

Frontend and backend **must be same site** (share registrable domain, e.g. `app.example.com` and `api.example.com`). Cross-site deployment requires SameSite=None + CSRF token (not implemented).
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): OAuth env vars and provider setup"
```

---

# Self-Review Checklist

完成上面所有 task 后,跑一次 review:

- [ ] **Spec coverage**:对照 `docs/superpowers/specs/2026-05-19-oauth-login-design.md` § 4–§ 12,确认每条都有任务覆盖:
  - § 4 数据模型 → Task 1.1, 1.2
  - § 5.1 start → Task 4.2
  - § 5.2 callback → Task 4.3
  - § 5.3 exchange → Task 4.4
  - § 5.4 GitHub 差异 → Task 2.3(_github_profile)
  - § 5.5 link 模式 → Task 4.5
  - § 5.6 密码端点 → **Plan B(本 plan 不实施)**
  - § 6 linking service → Task 3.1, 3.2
  - § 7 配置 → Task 2.2
  - § 8 前端 → **Plan C(本 plan 不实施)**
  - § 9 安全/审计/日志 → Task 4.3 (audit/metrics)、5.1 (abuse)、6.3 (scrub)
  - § 10 CLAUDE.md/README → Task 7.1, 7.2
  - § 11 测试 → 嵌入各 task
  - § 12 Future Work → 不需要任务

- [ ] **跑全 suite**:`cd backend && .venv/bin/pytest -v` —— 全 PASS

- [ ] **Alembic 验**:`cd backend && .venv/bin/alembic upgrade head && .venv/bin/alembic downgrade -1 && .venv/bin/alembic upgrade head` —— 验 downgrade 不报错

- [ ] **Lint**:`cd backend && ruff check .` —— 0 errors

- [ ] **手测 — Google 流程**(可选):配真 Google client_id/secret,跑后端 + 浏览器手动测,确认 302 链路成立(前端 `/auth/oauth/complete` 还没建,所以会 404,但 cookie 应该已经被 set 上)。

---

## 完成后

- Plan A 实施完成后,后端 OAuth 流可以独立工作。前端无 UI 但可用 curl 完整测试。
- 接下来写 **Plan B**(`POST /api/auth/me/password` + NIST 密码规则 + breached list),然后写 **Plan C**(前端 UI)。
