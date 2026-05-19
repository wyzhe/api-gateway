# OAuth 登录(Google + GitHub)— 设计文档

**日期**: 2026-05-19
**状态**: Draft — 待 user review
**作者**: brainstorming with user

## 1. 概述与动机

为本网关引入 Google OAuth 和 GitHub OAuth 两种第三方登录方式,作为现有邮箱密码登录的补充。同时把用户开通模式从「admin-provisioned only」放宽为「self-serve open registration」——任何持有 Google 或 GitHub 账号的用户都可以首次登录即自动建账号,但默认 `balance=0`,因此在管理员手动充值之前无法调用 `/v1` 计费接口(由现有 `preauthorize_spend` 在 `balance<=0` 时返回 402 兜底)。

### 范围

本次设计涵盖:

- 后端 OAuth `start` / `callback` / `exchange` 三个路由,基于 [Authlib](https://docs.authlib.org/)
- 数据模型新增 `oauth_identities` 表、`User` 表两个字段
- 前端登录页加入 OAuth 按钮、新增 `/auth/oauth/complete` 中转页、新增 `/settings/connections` 关联管理页
- 管理员面板加「标记邮箱已验证」按钮,作为现有密码用户接入 OAuth 自动合并的过渡路径
- CLAUDE.md 同步更新项目定位
- 安全控制:PKCE、state 一次性 nonce、exchange code、scrub list、rate limit、account pre-hijacking 防护

不在本次范围:

- SMTP 邮件验证流程(管理员手动标记 verified 是 MVP 替代)
- OIDC discovery 自动配置(`well-known` URL 硬编码即可)
- 多因素认证(2FA)
- 「绑定 Google/GitHub」之外的其它 provider(Microsoft / Apple / 等)
- 跨设备登录会话管理

## 2. 与 CLAUDE.md 的姿态变化

[CLAUDE.md](../../../CLAUDE.md) 当前写明:

> **Isn't**: ... There's no signup, no online payments, no per-org workspaces. Users are provisioned by an admin.

本设计将其改为:

> **Is** *also*: a self-serve sign-in surface via Google / GitHub OAuth. First OAuth login auto-creates a `User` row with `balance=0`; admin top-up is still required before the user can hit `/v1`. Admin manual provisioning continues to work; both flows produce the same row shape.

变更将作为实施 PR 的一部分提交。

## 3. 决策摘要

按"业内主流"原则定下来的关键选择:

| 决策 | 选定值 | 来源 |
|---|---|---|
| OAuth 实现形态 | Backend-driven authorization_code + Authlib | FastAPI 圈主流 |
| 安全增强 | **PKCE (S256)** 全程开启,即使是 confidential client | RFC 9700 (OAuth 2.1) |
| Token 回传方式 | **一次性 exchange code**(60s TTL),token 不进 URL | Notion / GitHub Device Flow 模式 |
| 账号合并 | 同 verified email 自动合并 **当且仅当** 现有 User `email_verified_at IS NOT NULL`;否则 409 拒绝,引导手动 link | NextAuth `allowDangerousEmailAccountLinking=false` 默认 |
| 账号合并 key | `(provider, provider_subject)` 唯一,不用 email | OIDC core |
| 注册门槛 | 完全开放,默认 `balance=0`(由 `preauthorize_spend` 兜底滥用) | 用户决策 |
| 密码登录 | 保留,`password_hash` 改 nullable | 保留 admin 备用通道 |
| 前端登录 UX | OAuth 按钮 + "or" 分割线 + 邮箱密码表单 | Vercel / Linear / Supabase 通用布局 |
| 补 verify 流程 | MVP 阶段:管理员在 admin panel 手动标记;未来接 SMTP | 避免在本次引入 SMTP 依赖 |

## 4. 数据模型变更

### 4.1 新增 `oauth_identities` 表

```python
# backend/app/models/oauth_identity.py
class OAuthIdentity(Base):
    __tablename__ = "oauth_identities"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    provider: Mapped[str] = mapped_column(String(16), nullable=False)   # "google" | "github"
    provider_subject: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("provider", "provider_subject", name="uq_oauth_provider_subject"),
        Index("ix_oauth_user_provider", "user_id", "provider"),
    )

    user: Mapped["User"] = relationship(back_populates="oauth_identities")
```

**字段说明**:

- `provider_subject` 存的是 provider 端的稳定 ID(Google: id_token `sub` 字段;GitHub: `/user` 的数字 `id`),不存 email——OAuth 用户改 email 时不需要迁移 identity 行。
- 不存 `email_at_link`——审计信息走 `audit_logs`,避免冗余存储。
- `last_login_at` 用于 settings 页展示「上次通过 X 登录」。

### 4.2 `users` 表两处修改

```python
class User(Base):
    # 既有字段不变,除了:
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)  # 改 nullable
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )  # 新增字段
    # 反向 relationship 新增:
    oauth_identities: Mapped[list["OAuthIdentity"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
```

**`email_verified_at` 的语义**:

- OAuth 注册 / 自动合并时:`now()`(由 provider 已 verified)
- 现存密码用户:初始为 NULL;admin 在 user 详情页点「标记邮箱已验证」后变为 `now()`
- 当 `email_verified_at IS NULL` 时,**禁止**该 User 被 OAuth 自动合并

### 4.3 Alembic migration

文件:`backend/alembic/versions/<rev>_add_oauth_identities_and_email_verified.py`

执行内容:

1. `CREATE TABLE oauth_identities` + 索引/唯一约束
2. `ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`
3. `ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ NULL`

**不做数据回填**——所有现存 User 的 `email_verified_at` 保持 NULL,符合设计要求(他们的邮箱属性由 admin 手动确认)。

## 5. OAuth 流程详细规约

以 Google 为例。GitHub 在 §5.4 列出 endpoint / scope 差异。

### 5.1 `/api/auth/oauth/{provider}/start`

```
GET /api/auth/oauth/google/start?return_to=/dashboard
```

**请求**:

- Query: `return_to`(可选,默认 `/`)。后端做白名单校验——只接受同源相对路径,避免 open redirect。

**逻辑**:

1. 校验 provider 已配置(`GOOGLE_OAUTH_CLIENT_ID` 等环境变量存在),否则 404。
2. `state = secrets.token_urlsafe(32)`
3. `code_verifier = secrets.token_urlsafe(64)`
4. `code_challenge = base64url(sha256(code_verifier))`
5. Redis: `SET oauth_state:{state} {"provider":"google","return_to":"/dashboard","code_verifier":"...","mode":"login"} EX 300`
6. 302 → `https://accounts.google.com/o/oauth2/v2/auth` 带:
   - `response_type=code`
   - `client_id={GOOGLE_OAUTH_CLIENT_ID}`
   - `scope=openid email profile`
   - `redirect_uri={OAUTH_BACKEND_BASE_URL}/api/auth/oauth/google/callback`
   - `state={state}`
   - `code_challenge={code_challenge}`
   - `code_challenge_method=S256`

不传 `prompt=select_account`,由 provider 决定是否弹账号选择器。

### 5.2 `/api/auth/oauth/{provider}/callback`

```
GET /api/auth/oauth/google/callback?code=...&state=...
```

**逻辑**:

1. Redis: `GETDEL oauth_state:{state}` —— 如果 nil,审计 `oauth_state_mismatch`,返回 400。
2. 校验状态中的 `provider` 与路由的 `provider` 一致,否则 400。
3. Authlib `OAuth2Client.fetch_token(code, code_verifier=...)` 走 token endpoint(对 Google: `https://oauth2.googleapis.com/token`)。
4. 验证 `id_token`(Authlib 用 Google JWKS 自动验)→ 解出 `{sub, email, email_verified, name, picture}`。
5. 如果 `email_verified != True`,审计 `oauth_unverified_email`,302 回前端 `/login?error=email_unverified`。
6. 调用 `OAuthLinkingService.find_or_create_user(provider, subject, email, name)`(详见 §6)。
   - 如果服务抛 `OAuthEmailConflict`,审计 `oauth_email_conflict`,302 回前端 `/login?error=email_already_registered`。
   - 如果服务抛 `OAuthUserDisabled`,审计 `oauth_disabled_user`,302 回前端 `/login?error=account_disabled`。
7. 拿到 `User` 之后,如果 `User.status != 'active'`,同上当 disabled 处理。
8. 生成一次性 exchange code:`exchange_code = secrets.token_urlsafe(32)`
9. Redis: `SET oauth_exchange:{exchange_code} {"user_id": user.id} EX 60`
10. 写 `audit_logs`,action 取 `oauth_login` / `oauth_signup` / `oauth_link`(依 service 返回的 outcome)。
11. 302 → `{OAUTH_FRONTEND_BASE_URL}/auth/oauth/complete?code={exchange_code}&return_to={return_to_from_state}`

**注意**: callback 路由本身**不签发 JWT**——JWT 只在 exchange 步骤里发出,降低 token 暴露面。

### 5.3 `POST /api/auth/oauth/exchange`

```
POST /api/auth/oauth/exchange
Content-Type: application/json

{ "code": "..." }
```

**逻辑**:

1. Redis: `GETDEL oauth_exchange:{code}` —— 如果 nil,401。
2. 取出 `user_id`,DB 查 User(若不存在或 status≠active,401)。
3. 调用 `security.issue_token_pair(user)` —— 复用现有签发逻辑,产出 `{access, refresh, refresh_expires_at}`。
4. 写 refresh token 行(复用现有 `refresh_tokens` 表)。
5. JSON 返回 `{access, refresh, user: UserOut}`。

**Rate limit**: 60/min/IP(防止穷举 code,虽然 32B 随机几乎不可穷举,但作为标准 hardening)。

### 5.4 GitHub 差异

| 维度 | Google | GitHub |
|---|---|---|
| Authorize URL | `accounts.google.com/o/oauth2/v2/auth` | `github.com/login/oauth/authorize` |
| Token URL | `oauth2.googleapis.com/token` | `github.com/login/oauth/access_token` |
| Scope | `openid email profile` | `read:user user:email` |
| 拿用户信息 | id_token 自带 | 调 `GET api.github.com/user` + `GET api.github.com/user/emails` |
| Email 验证字段 | id_token `email_verified` | `/user/emails` 中 `primary=true && verified=true` 那一条 |
| Subject | id_token `sub`(字符串) | `/user.id`(整数,转 str 存) |

GitHub 没有 id_token,所以 `provider_subject` 用 `str(user_response.id)`。Email 取 `/user/emails` 列表里 `primary=true` 且 `verified=true` 的那个;如果没有 verified primary,等同于 unverified,走 §5.2 第 5 步的 unverified 分支。

### 5.5 「关联现有账号」模式

`/settings/connections` 页面发起的「绑定 Google/GitHub」需要把当前 User 的身份带进 OAuth 流程。但浏览器顶层导航(`window.location.assign`)无法附加 `Authorization` 头,所以**不能复用 `GET /start`**——link 模式独立用一个 POST 端点拿 JWT,返回 redirect URL,前端再导航。

```
POST /api/auth/oauth/{provider}/link/start
Authorization: Bearer <access_token>
Content-Type: application/json
{ "return_to": "/settings/connections" }

→ 200 { "redirect_url": "https://accounts.google.com/o/oauth2/v2/auth?..." }
```

**后端逻辑**(在 `get_current_user` 依赖之后):

1. 生成 `state` / `code_verifier` / `code_challenge`(同 §5.1)
2. Redis: `SET oauth_state:{state} {"provider":"...","return_to":"...","code_verifier":"...","mode":"link","linker_user_id":<current_user.id>} EX 300`
3. 返回 JSON `{redirect_url}`,**不做 302**——302 让浏览器跟随会丢 Authorization 头,我们让前端显式 `window.location.assign(redirect_url)` 即可

**前端**:`/settings/connections` 的「绑定 Google」按钮调 `linkOAuth("google")` → `POST /api/auth/oauth/google/link/start` → 拿到 `redirect_url` → `window.location.assign(redirect_url)`。

**`callback` 处理**(同一个 callback 端点,通过读取 Redis state 中的 `mode` 字段分支):

- 若 Redis 中 `mode=link`,跳过 `find_or_create_user`,改走 `OAuthLinkingService.attach_to_existing(linker_user_id, provider, subject, email)`:
  - 如果 `(provider, subject)` 已绑定其它 User → 审计 `oauth_provider_in_use`,302 回 `/settings/connections?error=provider_in_use`
  - 否则插入 `OAuthIdentity(user_id=linker_user_id, ...)`,如果 `linker.email_verified_at IS NULL` 且 OAuth email 和 linker.email 一致,顺手把 `email_verified_at = now()` 写上(因为用户在 OAuth 那侧已经证明了对该邮箱的控制权)
- 不签发新 token、不走 exchange,302 回前端 `/settings/connections?linked={provider}`

**注意**:link 流程的 callback 完成后,linker_user_id 对应的用户 access token **可能已经过期**(从 link/start 到 callback 走 OAuth 来回最长可能几分钟)。这不影响 link 操作本身——`linker_user_id` 已经在 Redis state 里,代表用户在发起 link 的瞬间是登录的。但前端跳回 `/settings/connections` 时,可能需要 refresh 一次 token(走现有 `refresh_tokens` 流程)。

## 6. 账号关联服务 `OAuthLinkingService`

文件:`backend/app/services/oauth_linking_service.py`

### 6.1 `find_or_create_user(provider, subject, email, name) → (outcome, user)`

`outcome ∈ {"login", "link", "signup"}`

```python
def find_or_create_user(db, provider, subject, email, name):
    # Case 1: 已绑过 → 直接 login
    identity = (
        db.query(OAuthIdentity)
          .filter_by(provider=provider, provider_subject=subject)
          .with_for_update()
          .one_or_none()
    )
    if identity:
        if identity.user.status != "active":
            raise OAuthUserDisabled(user_id=identity.user.id)
        identity.last_login_at = func.now()
        return ("login", identity.user)

    # Case 2: 同 email 已有 User
    user = (
        db.query(User).filter_by(email=email)
          .with_for_update()
          .one_or_none()
    )
    if user:
        if user.email_verified_at is None:
            raise OAuthEmailConflict(email=email)
        if user.status != "active":
            raise OAuthUserDisabled(user_id=user.id)
        identity = OAuthIdentity(
            user_id=user.id, provider=provider,
            provider_subject=subject, last_login_at=func.now(),
        )
        db.add(identity)
        return ("link", user)

    # Case 3: 新建
    user = User(
        email=email, password_hash=None, display_name=name,
        role="user", status="active",
        balance=Decimal("0"), email_verified_at=func.now(),
    )
    db.add(user); db.flush()
    identity = OAuthIdentity(
        user_id=user.id, provider=provider,
        provider_subject=subject, last_login_at=func.now(),
    )
    db.add(identity)
    return ("signup", user)
```

**事务边界**: 调用方在 `db.begin()` 内调用,确保 `with_for_update()` 锁有效。callback 路由把 「find_or_create_user + audit_log.record + commit」 包在同一事务里。

**Account pre-hijacking 防护**: Case 2 的 `email_verified_at IS NULL` 检查是关键。现存密码用户(都是 admin 开的,但 `email_verified_at=NULL`)不会被任意 OAuth identity 自动接管。攻击者必须先让 admin 显式标记 verified,而 admin 知道每个 User 的邮箱归属。

### 6.2 `attach_to_existing(user_id, provider, subject, email)`

```python
def attach_to_existing(db, user_id, provider, subject, email):
    existing = (
        db.query(OAuthIdentity)
          .filter_by(provider=provider, provider_subject=subject)
          .one_or_none()
    )
    if existing and existing.user_id != user_id:
        raise OAuthProviderInUse(provider=provider)
    if existing:
        # 同一用户重复点了链接,幂等返回
        return existing.user

    user = db.query(User).filter_by(id=user_id).with_for_update().one()
    identity = OAuthIdentity(
        user_id=user.id, provider=provider,
        provider_subject=subject, last_login_at=func.now(),
    )
    db.add(identity)
    if user.email_verified_at is None and user.email == email:
        user.email_verified_at = func.now()
    return user
```

### 6.3 `detach(user_id, identity_id)`

用于 `/settings/connections` 的解绑按钮。

**约束**: 一个 User 至少要保留一种登录方式。逻辑:

```python
def detach(db, user_id, identity_id):
    identity = (
        db.query(OAuthIdentity)
          .filter_by(id=identity_id, user_id=user_id)
          .with_for_update()
          .one_or_none()
    )
    if not identity:
        raise OAuthIdentityNotFound()

    user = db.query(User).filter_by(id=user_id).with_for_update().one()
    other_identities_count = (
        db.query(func.count(OAuthIdentity.id))
          .filter(OAuthIdentity.user_id == user_id,
                  OAuthIdentity.id != identity_id)
          .scalar()
    )
    if user.password_hash is None and other_identities_count == 0:
        raise OAuthCannotDetachLast()

    db.delete(identity)
```

## 7. 配置与部署

### 7.1 新增环境变量

在 `backend/app/settings.py` 的 `Settings` 模型加:

```python
google_oauth_client_id: str | None = None
google_oauth_client_secret: str | None = None
github_oauth_client_id: str | None = None
github_oauth_client_secret: str | None = None
oauth_backend_base_url: str | None = None    # e.g. https://api.example.com
oauth_frontend_base_url: str | None = None   # e.g. https://app.example.com
```

**启动校验**(在 `settings.py` 现有 strict 校验里加):

- 如果 `ENV=production`:
  - 凡配了 `*_client_id` 必须也配 `*_client_secret`,否则启动失败。
  - 配了任一 OAuth provider 时,`oauth_backend_base_url` 必须是 `https://`,否则启动失败。

`/api/auth/oauth/providers` 路由按这些 env 返回 `{google: bool, github: bool}`,前端据此显示/隐藏按钮。

### 7.2 Provider 端配置(实施时由部署者完成)

**Google Cloud Console**:

1. 建 OAuth 2.0 Client ID(Web application)
2. Authorized redirect URIs:
   - dev: `http://localhost:8000/api/auth/oauth/google/callback`
   - prod: `https://api.example.com/api/auth/oauth/google/callback`
3. 拿到 client_id / client_secret 填入 env

**GitHub OAuth App**(Settings → Developer settings → OAuth Apps):

1. New OAuth App
2. Authorization callback URL: 同上的 GitHub 版本
3. 拿到 client_id / client_secret 填入 env

## 8. 前端变更

### 8.1 文件改动列表

| 文件 | 变更 |
|---|---|
| `frontend/src/lib/api.ts` | 新增 `getOAuthProviders()` / `startOAuthLogin(provider)`(直接 `window.location.assign('/api/auth/oauth/{provider}/start?return_to=...')`)/ `startOAuthLink(provider)`(先 POST 拿 redirect_url 再 `assign`)/ `exchangeOAuth(code)` / `detachOAuthIdentity(id)` |
| `frontend/src/pages/login.tsx` | 顶部加 OAuth 按钮区 + "or" 分割线;按 `getOAuthProviders()` 显隐 |
| `frontend/src/pages/oauth-complete.tsx` | **新增**。读 `?code=`,调 `exchangeOAuth`,塞 token,`router.replace(return_to)`。错误时显示「登录失败」+ 返回 `/login` 链接。 |
| `frontend/src/pages/settings-connections.tsx` | **新增**。列出当前 User 的所有 `oauth_identities`,「绑定 / 解绑」按钮 |
| `frontend/src/App.tsx` | 注册 `/auth/oauth/complete` 路由;在已登录区注册 `/settings/connections` |
| `frontend/src/components/shell.tsx` | 侧栏「设置」下加「关联账号」入口 |
| `frontend/src/lib/types.ts` | 加 `OAuthProviderStatus`、`OAuthIdentity` 类型 |

### 8.2 设计准则

- **按钮风格沿用 `DESIGN.md` 现有 secondary button 规格**——不引入新视觉 primitive。Google / GitHub icon 用项目已有的 lucide-react `Github` + 内嵌 Google 多色 SVG(放进 `components/ui/icons.tsx`)。
- **不存任何 OAuth token / state 在浏览器**——所有敏感数据由后端 + Redis 持有。
- **不在 `playground` 用 sessionStorage 之外引入新前端凭证存储位置**。

## 9. 安全 / 审计 / 日志

### 9.1 Audit log 新增 action 值

| action | 何时写 | target |
|---|---|---|
| `oauth_signup` | `find_or_create_user` 返回 `signup` | user_id |
| `oauth_login` | `find_or_create_user` 返回 `login` | user_id |
| `oauth_link` | `find_or_create_user` 返回 `link` 或 `attach_to_existing` 成功 | user_id |
| `oauth_unlink` | `detach` 成功 | user_id |
| `oauth_state_mismatch` | callback state 不存在或 provider 不匹配 | NULL |
| `oauth_unverified_email` | provider 返回 email_verified=false | NULL |
| `oauth_email_conflict` | Case 2 命中但 verified_at=NULL | NULL(metadata 含 email hash) |
| `oauth_disabled_user` | identity / user 找到但 status≠active | user_id |
| `oauth_provider_in_use` | `attach_to_existing` 撞已绑其它用户 | linker_user_id |
| `email_marked_verified` | admin 在 admin panel 标记 | user_id |

### 9.2 结构化日志字段

structlog 记录 `/api/auth/oauth/**` 的请求时附加:

- `request_id`(由现有中间件提供)
- `provider`
- `subject_prefix`: `provider_subject[:8]` —— 不记完整 sub
- `outcome`: signup / login / link / error_*
- `email_domain`: `email.split("@")[1]` —— 不记完整 email

**不记**:`code`、`state`、`code_verifier`、`access_token`、`id_token`、`refresh_token`、完整 email、完整 sub。

### 9.3 Scrub list 扩充

`request_log.request_payload_json` 的 scrub list 现有规则上新增 key 黑名单:

- `code`, `state`, `code_verifier`, `code_challenge`
- `access_token`, `id_token`, `refresh_token`
- `client_secret`
- 所有以 `oauth_` 开头的 Redis key 不进任何日志

### 9.4 Rate limit

| 路由 | 限制 |
|---|---|
| `GET /api/auth/oauth/{provider}/start` | 不限 |
| `POST /api/auth/oauth/{provider}/link/start` | 30/min/JWT |
| `GET /api/auth/oauth/{provider}/callback` | 60/min/IP |
| `POST /api/auth/oauth/exchange` | 60/min/IP |
| `DELETE /api/settings/connections/{identity_id}` | 30/min/JWT |

### 9.5 Open redirect 防护

`return_to` 参数白名单规则:必须以 `/` 开头、不以 `//` 开头、不包含 `:`。任何不合规一律视为 `/`。

### 9.6 CSRF 与 SameSite

- exchange code 走 POST + JSON body,本身需要前端主动调用,默认有 SameSite=Lax cookie 保护
- 不引入新 cookie——继续走现有的「access token 在内存 + refresh token 在内存」模式(由 `api.ts` 管理)
- `/api/auth/oauth/exchange` 不需要登录态,所以不需要 CSRF token——它是「我刚刚 OAuth 完成、redirect 带 code 回来兑换」的一次性流程,exchange code 本身就是凭证

## 10. CLAUDE.md / README 同步

**CLAUDE.md 改动**:

1. `## What this is, what it isn't` 节中 `**Isn't**` 段:删除 "There's no signup" 句;改成 "Self-serve sign-up via Google / GitHub OAuth is supported; admin manual provisioning still works as before." 并保留其余约束(no online payments, no per-org workspaces, no chat product)。
2. `## Critical invariants — do not break` 加一条:
   > **OAuth 自动账号合并要求 verified email**:在 `OAuthLinkingService` 路径里,合并到已存在 User 必须满足 `User.email_verified_at IS NOT NULL`,否则抛 `OAuthEmailConflict`。这是对 [Account Pre-hijacking](https://www.usenix.org/conference/usenixsecurity22/presentation/sudhodanan) 攻击的核心防护,不要绕过。
3. `## Configuration & startup safety` 节加 OAuth 相关环境变量校验说明。
4. `## Where the seams are if you need to extend` 表加一行:`Add a new OAuth provider | New entry in OAUTH_PROVIDERS dict in oauth_providers.py + env vars + Authlib registration`.

**README 改动**:

1. `Local dev cheat sheet` 节加 OAuth env vars 示例(占位值,标注「按需配置」)。
2. 加一节 `## OAuth (optional)`,讲怎么在 Google Cloud Console / GitHub OAuth Apps 里创建 client,把回调 URL 填进去。

## 11. 测试计划

### 11.1 单元 / 服务测试

`backend/tests/test_oauth_linking.py`:

- `test_find_or_create_user_creates_new_signup`
- `test_find_or_create_user_returns_existing_identity_as_login`
- `test_find_or_create_user_links_to_verified_existing_user`
- `test_find_or_create_user_refuses_unverified_existing_user`  ← Account pre-hijacking 防护
- `test_find_or_create_user_refuses_disabled_user`
- `test_attach_to_existing_idempotent_for_same_user`
- `test_attach_to_existing_409_when_provider_in_use_by_other`
- `test_detach_fails_when_last_login_method`
- `test_detach_succeeds_when_password_or_other_identity_remains`

### 11.2 路由 / 集成测试

`backend/tests/test_oauth_routes.py`(用 `monkeypatch` 注入 fake Authlib client):

- `test_start_creates_state_and_redirects`
- `test_start_404_when_provider_unconfigured`
- `test_callback_rejects_unknown_state`
- `test_callback_rejects_mismatched_provider_in_state`
- `test_callback_rejects_unverified_email`
- `test_callback_creates_exchange_code_on_success`
- `test_exchange_returns_token_pair_and_consumes_code`
- `test_exchange_401_when_code_already_used`
- `test_exchange_401_when_user_disabled`
- `test_link_start_requires_jwt`
- `test_link_start_returns_redirect_url_and_stores_linker_in_state`
- `test_link_mode_callback_attaches_to_current_user`
- `test_link_mode_callback_redirects_to_settings_on_provider_in_use`
- `test_return_to_open_redirect_rejected`

### 11.3 现有测试回归

跑一次 `tests/test_auth.py` —— 确认密码登录 / refresh / logout 不受 `password_hash` nullable 改造影响。

### 11.4 PKCE 验证

`test_callback_includes_code_verifier_when_calling_token_endpoint` —— 用 mock 捕获 Authlib 发给 token endpoint 的请求,断言带了 `code_verifier`。

### 11.5 前端

最小烟囱测试,跑通:

- `/login` 页 OAuth 按钮可见(mock `/api/auth/oauth/providers` 返回 `{google: true, github: true}`)
- `/auth/oauth/complete?code=xxx` 调 `exchange` 后正确跳转

## 12. 已知遗留 / Future Work

- **SMTP 邮件验证流程**:本次只支持 admin 手动标记 verified。未来接入 SMTP 后,在 `/settings` 加「发送验证邮件」按钮,完成后 `email_verified_at = now()`,使现存密码用户可以通过 OAuth 自动合并。
- **Token 存储升级**:当前 access token 在前端内存里。未来可升级为 httpOnly cookie + CSRF token,降低 XSS 暴露面。这是更大的前端重构,与本次 OAuth 解耦。
- **Refresh token family-level reuse detection**:CLAUDE.md 已经在 Known gaps 里列出,本次不解决。OAuth 路径用现有 `issue_token_pair`,所以继承现状。
- **Provider 端凭据轮换**:Google / GitHub OAuth client_secret 长期不变也能用,但建议每年轮换一次。本次不引入自动轮换机制。
- **多 OIDC provider 通用化**:目前 Google / GitHub 各写一套 client 注册。如果未来加超过 3 个 provider,值得抽象成 OIDC discovery + 配置驱动。本次先 hardcode 两个 provider 在 `oauth_providers.py`。

---

## 实施提交计划(给后续 writing-plans 的输入)

建议拆三个 PR,但都在本设计的 scope 之内:

1. **后端 OAuth 基础设施**:数据模型 + Alembic + `OAuthLinkingService` + 路由 + Authlib 注册 + 单元测试。不动前端。
2. **前端 UI**:登录页 OAuth 按钮 + `/auth/oauth/complete` + `/settings/connections` + admin panel 「标记邮箱已验证」按钮。
3. **文档**:CLAUDE.md / README 同步更新(可以和 PR 1 合并)。

writing-plans 阶段会把 PR 1 拆成更细的可独立验证 task。
