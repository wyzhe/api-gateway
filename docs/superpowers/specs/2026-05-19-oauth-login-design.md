# OAuth 登录(Google + GitHub)— 设计文档

**日期**: 2026-05-19
**状态**: Draft — 待 user review
**作者**: brainstorming with user

## 1. 概述与动机

为本网关引入 Google OAuth 和 GitHub OAuth 两种第三方登录方式,作为现有邮箱密码登录的补充。同时把用户开通模式从「admin-provisioned only」放宽为「self-serve open registration」——任何持有 Google 或 GitHub 账号的用户都可以首次登录即自动建账号,但默认 `balance=0`,因此在管理员手动充值之前无法调用 `/v1` 计费接口(由现有 `preauthorize_spend` 在 `balance<=0` 时返回 402 兜底)。

### 范围

本次设计涵盖:

- 后端 OAuth `start` / `callback` / `exchange` / `link/start` 四个路由,基于 [Authlib](https://docs.authlib.org/)
- 数据模型新增 `oauth_identities` 表、`User` 表两个字段
- 前端登录页加入 OAuth 按钮、新增 `/auth/oauth/complete` 中转页、新增 `/settings/connections` 关联管理页、新增 `/settings/security` 密码自助管理页
- `POST /api/auth/me/password` 自助设密码 / 改密码端点(供 OAuth-only 用户给自己加备用登录方式,避免 provider 失败时账号锁死)
- 管理员面板加「标记邮箱已验证」按钮,作为现有密码用户接入 OAuth 自动合并的过渡路径
- 开放注册的反滥用基线:IP signup 限流(默认 10/IP/day)+ 每用户每天 API key 创建上限(默认 5/user/day)
- Prometheus 指标 + audit log 全覆盖
- CLAUDE.md 同步更新项目定位
- 安全控制:PKCE、state 一次性 nonce、HttpOnly+SameSite=Strict exchange cookie、scrub list、rate limit、account pre-hijacking 防护

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
| Exchange code 传递 | **HttpOnly cookie**(60s TTL,narrow Path),token 不进 URL,exchange code 不进 URL | Auth0 / NextAuth / Clerk / Stripe 一致做法 |
| 账号合并 | 同 verified email 自动合并 **当且仅当** 现有 User `email_verified_at IS NOT NULL`;否则 409 拒绝,引导手动 link | NextAuth `allowDangerousEmailAccountLinking=false` 默认 |
| 账号合并 key | `(provider, provider_subject)` 唯一,不用 email | OIDC core |
| 注册门槛 | 完全开放,默认 `balance=0`(`preauthorize_spend` 兜底 /v1 计费) + IP signup 限流 + 每用户每天创建 API key 上限 | Supabase / Auth0 / Clerk 通用反滥用基线 |
| 密码登录 | 保留,`password_hash` 改 nullable;OAuth-only 用户可调 `POST /api/auth/me/password` 自助设密码 | Google / GitHub / Stripe / Notion 通用做法,避免单 provider 失败时账号被锁死 |
| 密码强度规则 | **NIST 800-63B compliant**:长度 ≥ 12、≤ 128;不做 character class;查 breached top-10k 静态列表 | NIST §5.1.1.2 明确反对 composition rules、要求 breached check;Google / GitHub / Auth0 默认行为 |
| OIDC id_token 校验 | Authlib OIDCClient 默认行为(iss / aud / exp / signature),**不引入 nonce** | nonce 在 server-side auth code + PKCE flow 增量价值 ≈ 0(NextAuth / Auth0 同结论)|
| Admin 新建用户 | 默认 `email_verified_at=now()`(admin 输入即断言)| 主流 admin-create 行为(Clerk / Supabase) |
| 前端登录 UX | OAuth 按钮 + "or" 分割线 + 邮箱密码表单 | Vercel / Linear / Supabase 通用布局 |
| 补 verify 流程 | MVP 阶段:管理员在 admin panel 手动标记;未来接 SMTP | 避免在本次引入 SMTP 依赖 |
| CAPTCHA / bot detection | **Future Work**(下个迭代接 Cloudflare Turnstile)| MVP 用 IP 限流即可 |

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
- **Admin 通过 admin panel 新建用户时**:默认填 `now()`(admin 输入即断言对该邮箱的归属判断)。admin 创建表单上可选「邮箱待用户自验证」复选框,勾选则保持 NULL。该默认值由 `backend/app/api/admin.py` 中创建用户的路由实现,不在 User 模型层加默认值——因为 OAuth 走 service、admin 走 endpoint,语义来源不同。
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
4. 验证 `id_token`(Authlib 的 `OIDCClient` 用 Google JWKS 自动验 signature **以及 `iss == "https://accounts.google.com"`、`aud == GOOGLE_OAUTH_CLIENT_ID`、`exp` 未过期**——这些是 OIDC core §3.1.3.7 必须做的校验,Authlib 默认就做,我们不另写)→ 解出 `{sub, email, email_verified, name, picture}`。**不引入 `nonce`**:在 server-side authorization_code + PKCE flow 里 nonce 增量价值 ≈ 0(state 已防 CSRF、PKCE 已防 code injection、id_token 不暴露给前端无可重放),OWASP / Auth0 / NextAuth 在此场景普遍不强制 nonce。
5. 如果 `email_verified != True`,审计 `oauth_unverified_email`,302 回前端 `/login?error=email_unverified`。
6. 调用 `OAuthLinkingService.find_or_create_user(provider, subject, email, name)`(详见 §6)。
   - 如果服务抛 `OAuthEmailConflict`,审计 `oauth_email_conflict`,302 回前端 `/login?error=email_already_registered`。
   - 如果服务抛 `OAuthUserDisabled`,审计 `oauth_disabled_user`,302 回前端 `/login?error=account_disabled`。
7. 拿到 `User` 之后,如果 `User.status != 'active'`,同上当 disabled 处理。
8. 生成一次性 exchange code:`exchange_code = secrets.token_urlsafe(32)`
9. Redis: `SET oauth_exchange:{exchange_code} {"user_id": user.id} EX 60`
10. 写 `audit_logs`,action 取 `oauth_login` / `oauth_signup` / `oauth_link`(依 service 返回的 outcome)。
11. 302 → `{OAUTH_FRONTEND_BASE_URL}/auth/oauth/complete?return_to={return_to_from_state}`,**响应头同时附**:
    ```
    Set-Cookie: oauth_exchange={exchange_code}; HttpOnly; Secure; SameSite=Strict;
                Path=/api/auth/oauth/exchange; Max-Age=60
    ```
    - `HttpOnly`:JS 读不到,杜绝 XSS exfiltrate
    - `Secure`:只走 HTTPS(dev 环境 settings.is_production=False 时 Secure 可选,本地 http://localhost 浏览器仍接收)
    - `SameSite=Strict`:绝对不在跨站请求中带,防 CSRF
    - `Path=/api/auth/oauth/exchange`:cookie 只在调 exchange 端点时被发送,其它路由不暴露
    - `Max-Age=60`:同 Redis TTL,过期即丢
    - **不设 `Domain`**:默认绑当前 host,跨子域不泄露

**注意**: callback 路由本身**不签发 JWT**——JWT 只在 exchange 步骤里发出,降低 token 暴露面。**Exchange code 完全不进 URL,只走 HttpOnly cookie**(主流做法,Auth0 / NextAuth / Clerk 同模式)。

### 5.3 `POST /api/auth/oauth/exchange`

```
POST /api/auth/oauth/exchange
Cookie: oauth_exchange={exchange_code}
```

无 body。Cookie 由浏览器自动附加(`Path=/api/auth/oauth/exchange` 限定只在此端点发送)。

**逻辑**:

1. 读取 `Cookie: oauth_exchange`。缺失 → 401。
2. Redis: `GETDEL oauth_exchange:{code}` —— 如果 nil,401(已过期 / 已用 / 伪造)。
3. 取出 `user_id`,DB 查 User(若不存在或 status≠active,401)。
4. 调用 `security.issue_token_pair(user)` —— 复用现有签发逻辑。
5. 写 refresh token 行(复用现有 `refresh_tokens` 表)。
6. JSON 返回 `LoginResponse`(`backend/app/schemas/auth.py` 现有 schema):`{access_token, refresh_token, token_type:"bearer", access_expires_in, user}`。前端 auth store 不分叉。

**所有响应**(成功 200、各种 401)**都附**:
```
Set-Cookie: oauth_exchange=; HttpOnly; Secure; SameSite=Strict;
            Path=/api/auth/oauth/exchange; Max-Age=0
```

显式过期 cookie。即使 Redis 已 GETDEL,浏览器端也立刻丢掉残留 cookie,避免后续误带。

**Rate limit**: 不限。Exchange code 是 32B 一次性随机值,无法穷举,且 `Max-Age=60` 自然限速。

**CSRF 处理**:`SameSite=Strict` 已经阻断了第三方站点带 cookie 发请求的可能;额外的 CSRF token 不需要。

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
- 不签发新 token、不走 exchange、**不设 oauth_exchange cookie**,302 回前端 `/settings/connections?linked={provider}`

**注意**:link 流程的 callback 完成后,linker_user_id 对应的用户 access token **可能已经过期**(从 link/start 到 callback 走 OAuth 来回最长可能几分钟)。这不影响 link 操作本身——`linker_user_id` 已经在 Redis state 里,代表用户在发起 link 的瞬间是登录的。但前端跳回 `/settings/connections` 时,可能需要 refresh 一次 token(走现有 `refresh_tokens` 流程)。

### 5.6 `POST /api/auth/me/password` — 自助设密码 / 改密码

**动机**:OAuth-only 用户(`password_hash IS NULL`)必须有自助设密码的能力。否则一旦其 OAuth provider 不可用(账号封禁、provider 故障、用户主动删除 Google/GitHub 账号),用户**永远无法登录**——本项目 MVP 阶段没有 magic link / SMTP fallback。Google、GitHub、Stripe、Notion、Clerk 等业内主流都允许 OAuth-only 用户自助设密码。

```
POST /api/auth/me/password
Authorization: Bearer <access_token>
Content-Type: application/json

{ "current_password": "...", "new_password": "..." }
```

`current_password` 可选:仅当 `User.password_hash IS NOT NULL` 时必填且必须正确,OAuth-only 用户首次设密码可省略。

**逻辑**(`backend/app/api/auth.py`):

1. 取当前 User(`get_current_user` 依赖)
2. 如果 `user.password_hash` 非 NULL:
   - 必须提供 `current_password`,否则 400
   - bcrypt verify `current_password` 与现有 `password_hash`,失败 401
3. 新密码强度校验(**遵循 [NIST SP 800-63B](https://pages.nist.gov/800-63-3/sp800-63b.html) §5.1.1.2**):
   - 长度 ≥ 12(NIST 最低 8,我们略严)
   - 长度 ≤ 128(防 DoS 类 bcrypt 输入)
   - **不做** character class 检查(NIST §5.1.1.2 明确反对 "SHOULD NOT impose other composition rules"——逼用户用 `Password1!` 这种烂密码反而帮倒忙)
   - **必做** breached password list 检查(NIST §5.1.1.2 "SHALL compare against a list ... containing values known to be ... compromised"):MVP 阶段用本地静态 top-10k 列表(从 [SecLists](https://github.com/danielmiessler/SecLists/blob/master/Passwords/Common-Credentials/10-million-password-list-top-10000.txt) 打包进 `backend/app/data/breached_top10k.txt`,~80KB,启动时 load 到内存 set),命中 → 422 + 错误 "this password appears in known breach lists, please choose another"
   - 拒绝密码包含用户 email 本地部分或 display_name(超过 4 个连续字符)作为子串
   - **Future Work**: 接 [HIBP k-anonymity API](https://haveibeenpwned.com/API/v3#PwnedPasswords) `https://api.pwnedpasswords.com/range/{sha1_prefix}`,5+ 亿条覆盖率,无需打包字典
4. `user.password_hash = bcrypt.hash(new_password)`,写 DB
5. **撤销所有现有 `refresh_tokens`**(强制其它设备重登,标准 Auth0 / Stripe 等行为):`DELETE FROM refresh_tokens WHERE user_id = ?`
6. 当前调用方的 access token 不撤销(15 分钟自然过期),但 refresh token 必须重新签发——因为刚刚被全删了。调用 `security.issue_token_pair(user)` 拿新对。
7. 写 audit_log: action=`password_set`(`password_was_null=True`)或 `password_changed`(`password_was_null=False`)
8. 200 返回 `RefreshResponse` shape:`{access_token, refresh_token, token_type:"bearer", access_expires_in}`(不返回 user,前端已有);前端用新对替换旧 access/refresh,其它设备的 refresh 已失效。

**Rate limit**: `5/min/JWT` AND `10/min/IP`(两者都要满足)。仅按 JWT 限会让 JWT 被偷后从大量 IP 攻同一账号变成 5/min total;两者取严防这条路径。

**前端**(`/settings/security` 或并入 `/settings/connections`):

- OAuth-only 用户:显示「设置密码」按钮,弹窗只要 `new_password` + 确认
- 已有密码用户:显示「修改密码」按钮,需要 `current_password` + `new_password`
- 完成后弹 toast「密码已更新,其它设备需重新登录」

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

# 反滥用阈值(默认值偏严格,可调高)
signup_per_ip_per_day: int = 10
api_key_per_user_per_day: int = 5
```

**启动校验**(在 `settings.py` 现有 strict 校验里加):

- 如果 `ENV=production`:
  - 凡配了 `*_client_id` 必须也配 `*_client_secret`,否则启动失败。
  - 配了任一 OAuth provider 时,`oauth_backend_base_url` 必须是 `https://`,否则启动失败。
  - `oauth_backend_base_url` 与 `oauth_frontend_base_url` 必须是同站(共享 eTLD+1),否则启动失败。原因:`oauth_exchange` cookie 用 `SameSite=Strict`,跨站部署会导致 cookie 不被发送、exchange 始终失败。
- `signup_per_ip_per_day` 和 `api_key_per_user_per_day` 必须 `>= 1`,否则启动失败(0 等于完全关掉反滥用,不允许默认这样)。

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
| `frontend/src/lib/api.ts` | 新增 `getOAuthProviders()` / `startOAuthLogin(provider, returnTo?)`(直接 `window.location.assign(...)`)/ `startOAuthLink(provider)`(先 POST 拿 redirect_url 再 `assign`)/ `exchangeOAuth()`(无参,POST `/api/auth/oauth/exchange`,`credentials: 'include'` 让浏览器带 cookie)/ `detachOAuthIdentity(id)` / `setOrChangePassword({current?, new})` |
| `frontend/src/pages/login.tsx` | 顶部加 OAuth 按钮区 + "or" 分割线;按 `getOAuthProviders()` 显隐;URL 中如有 `?error=...` 显示对应文案(见 § 9.6 错误文案表)|
| `frontend/src/pages/oauth-complete.tsx` | **新增**。挂载后立即调 `exchangeOAuth()`(不读 URL,token 走 HttpOnly cookie);成功后塞 access/refresh 到现有 auth store,`router.replace(return_to)`。失败时显示「登录失败,请重试」+ 返回 `/login` 链接。读 query `?return_to=` 决定跳哪。 |
| `frontend/src/pages/settings-connections.tsx` | **新增**。列出当前 User 的所有 `oauth_identities`,「绑定 / 解绑」按钮;解绑按钮在「会让账号失去所有登录方式」时禁用 + tooltip 解释 |
| `frontend/src/pages/settings-security.tsx` | **新增**。「设置 / 修改密码」表单(根据 `user.has_password` 决定显示哪一个)。OAuth-only 用户提示「设置密码作为备用登录方式」。 |
| `frontend/src/App.tsx` | 注册 `/auth/oauth/complete` 路由;在已登录区注册 `/settings/connections`、`/settings/security` |
| `frontend/src/components/shell.tsx` | 侧栏「设置」下加「关联账号」「安全」入口 |
| `frontend/src/lib/types.ts` | 加 `OAuthProviderStatus`、`OAuthIdentity` 类型;`UserOut` 加两字段 — `has_password: boolean`(后端从 `password_hash != NULL` 派生)和 `email_verified_at: string \| null`(ISO 8601)。`backend/app/schemas/auth.py::UserOut` 同步加这两个字段。 |

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
| `oauth_signup_rate_limited` | IP signup 限流触发(见 § 9.7) | NULL(metadata: ip_hash) |
| `email_marked_verified` | admin 在 admin panel 标记 | user_id |
| `password_set` | OAuth-only 用户首次设密码(`password_was_null=True`) | user_id |
| `password_changed` | 已有密码用户改密码(`password_was_null=False`) | user_id |
| `api_key_quota_exceeded` | 用户单日创建 key 数超限(见 § 9.7) | user_id |

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
| `POST /api/auth/oauth/exchange` | 不限(32B 一次性 cookie,无法穷举) |
| `POST /api/auth/me/password` | 5/min/JWT 且 10/min/IP(两者取严)|
| `DELETE /api/settings/connections/{identity_id}` | 30/min/JWT |

### 9.5 Open redirect 防护

`return_to` 参数白名单规则:用 `urllib.parse.urlparse(return_to)` 解析,要求 `scheme == ''` 且 `netloc == ''` 且 `path.startswith('/')` 且不以 `//` 开头。任何不合规一律视为 `/`。比纯字符串规则更稳。

### 9.6 错误回跳 UX

OAuth callback 在各种错误情况下都 302 回 `/login?error={code}` 或 `/settings/connections?error={code}`,前端按 code 显示文案。

| code | 文案 | 出路 |
|---|---|---|
| `email_unverified` | 你的 {Google/GitHub} 邮箱尚未验证,请到 provider 完成邮箱验证后再试 | 跳 provider 验证流程 |
| `email_already_registered` | 该邮箱(`{masked_email}`)已被本地账号占用。请用密码登录后在「设置 → 关联账号」绑定 {provider}。如忘记密码,请联系管理员重置。 | 显示密码登录表单聚焦;给「联系管理员」邮件链接 |
| `account_disabled` | 该账号已被禁用,请联系管理员 | 显示管理员联系方式 |
| `provider_in_use` (link 模式) | 此 {provider} 账号已被其它用户绑定,请使用其它账号 | 返回 settings/connections |
| `upstream_failure` | 与 {provider} 通信失败,请稍后重试 | 「重试」按钮 |
| `state_expired` | 登录会话已过期(超过 5 分钟),请重新发起 | 跳 `/login` |
| `signup_rate_limited` | 新账号注册过于频繁,请稍后再试 | 显示等待提示 |

masked_email 规则: `a***@example.com`(给用户足够提示但不全曝露)。

### 9.7 反滥用基线

#### 9.7.1 IP signup 限流

在 `/api/auth/oauth/*/callback` 的 **signup 分支**(即 `find_or_create_user` 返回 `signup`)前加 Redis 计数:

```python
ip_signup_key = f"signup_ip_count:{client_ip}:{today_yyyymmdd}"
count = redis.incr(ip_signup_key)
if count == 1:
    redis.expire(ip_signup_key, 86400)
if count > SIGNUP_PER_IP_PER_DAY:  # 默认 10,环境变量可调
    audit("oauth_signup_rate_limited", metadata={"ip_hash": sha256(ip)[:16]})
    302 → /login?error=signup_rate_limited
    return
```

**不限 login / link 分支**——已有账号正常使用不应受影响。

#### 9.7.2 每用户每天创建 API key 数量上限

在 `POST /api/keys` 加 Redis 计数:

```python
key_quota_key = f"api_key_quota:{user.id}:{today_yyyymmdd}"
count = redis.incr(key_quota_key)
if count == 1:
    redis.expire(key_quota_key, 86400)
if count > API_KEY_PER_USER_PER_DAY:  # 默认 5
    audit("api_key_quota_exceeded", target=user.id)
    raise HTTPException(429, "Daily API key creation limit reached, try tomorrow")
```

环境变量:`SIGNUP_PER_IP_PER_DAY=10`、`API_KEY_PER_USER_PER_DAY=5`(都可调,默认值偏严格)。

#### 9.7.3 后续(Future Work)

- Cloudflare Turnstile / hCaptcha 集成,加在登录页前端 + callback 后端校验 `cf-turnstile-response` 头
- 跨日滑动窗口而不是日历日计数(更平滑)
- 「新账号 24h 限制」(类似 GitHub:24h 内不能 fork 大仓 / invite 他人)

### 9.8 Prometheus 指标

复用现有 `prometheus-client`,在 `backend/app/metrics.py` 加:

```python
auth_oauth_total = Counter(
    "auth_oauth_total",
    "OAuth flow outcomes",
    labelnames=("provider", "outcome"),  # outcome ∈ signup|login|link|error_state|error_email|...
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
auth_password_changes_total = Counter(
    "auth_password_changes_total",
    "Self-service password set/change",
    labelnames=("kind",),  # kind ∈ set | changed
)
```

### 9.9 CSRF 与 SameSite

- `oauth_exchange` cookie 带 `SameSite=Strict`(只在同站 fetch 时附加),已经阻断跨站 CSRF。
- `/api/auth/oauth/exchange` 端点不需要额外 CSRF token——cookie + SameSite=Strict + HttpOnly 三重保护。
- access / refresh token 仍然走现有的「JSON 返回 + 前端持有」模式(`api.ts` 管理),**没有引入持久 cookie**,只引入这一个 60s 一次性 cookie。
- `oauth_exchange` cookie 的 `Path=/api/auth/oauth/exchange` 限定路径,其它路由不会带,降低暴露面。

### 9.10 CORS 配置

`/api/auth/oauth/exchange` 端点要让浏览器自动带 `oauth_exchange` cookie(`credentials: 'include'` 或 `withCredentials`),所以 CORS response 必须满足:

- `Access-Control-Allow-Credentials: true`
- `Access-Control-Allow-Origin: <具体前端 origin>`(**不能** `*`,带 credentials 时 `*` 浏览器拒绝)
- `Access-Control-Allow-Methods: POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`

具体 origin 从 `OAUTH_FRONTEND_BASE_URL` 推导。

**对现有 `CORSMiddleware` 的影响**:CLAUDE.md 已说 CORS_ORIGINS 是严格 allowlist——确保 `OAUTH_FRONTEND_BASE_URL` 的 origin 在 `CORS_ORIGINS` 里,且 middleware 配置开启了 `allow_credentials=True`。如果当前是 `False`,本次要改成 `True`(独立的 access/refresh 走 JSON 不依赖 cookie,这个改动只影响 `/exchange`)。

## 10. CLAUDE.md / README 同步

**CLAUDE.md 改动**:

1. `## What this is, what it isn't` 节中 `**Isn't**` 段:删除 "There's no signup" 句;改成 "Self-serve sign-up via Google / GitHub OAuth is supported; admin manual provisioning still works as before." 并保留其余约束(no online payments, no per-org workspaces, no chat product)。
2. `## Critical invariants — do not break` 加两条:
   > **OAuth 自动账号合并要求 verified email**:在 `OAuthLinkingService` 路径里,合并到已存在 User 必须满足 `User.email_verified_at IS NOT NULL`,否则抛 `OAuthEmailConflict`。这是对 [Account Pre-hijacking](https://www.usenix.org/conference/usenixsecurity22/presentation/sudhodanan) 攻击的核心防护,不要绕过。
   >
   > **OAuth signup IP 限流不能绕**:`/api/auth/oauth/*/callback` 的 signup 分支必须先过 `signup_ip_count` 计数器(默认 10/IP/day)。`/api/keys` 必须先过 `api_key_quota` 计数器(默认 5/user/day)。这是开放注册的反滥用基线,绕过会让 DB / Redis 在被扫的时候撑爆。
3. `## Configuration & startup safety` 节加 OAuth 相关环境变量校验说明 + 反滥用阈值环境变量说明。
4. `## Frontend conventions` 节加一段:
   > **OAuth 一次性 exchange cookie 是唯一被允许的 HttpOnly cookie**。callback 后到 exchange 之间用 `oauth_exchange` cookie 传一次性 code,60s TTL,`Path=/api/auth/oauth/exchange`,`SameSite=Strict`。除此之外项目其它 token 仍走「JSON 返回 + 前端持有」模式,不要不假思索地把别的会话状态也搬到 cookie。
5. `## Where the seams are if you need to extend` 表加两行:
   - `Add a new OAuth provider | New entry in OAUTH_PROVIDERS dict in oauth_providers.py + env vars + Authlib registration`
   - `Change abuse-mitigation thresholds | SIGNUP_PER_IP_PER_DAY / API_KEY_PER_USER_PER_DAY env vars; default values are deliberately strict`
6. `## Things to NOT reintroduce` 加一条:
   > **Auto-link OAuth identity to any existing User by email alone** — 必须用 `email_verified_at IS NOT NULL` 做 gate。详见 spec § 6.1 Case 2 和上面的 Account Pre-hijacking 引用。

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
- `test_callback_sets_exchange_cookie_with_httponly_strict_path_60s`
- `test_callback_does_not_put_exchange_code_in_redirect_url`  ← 确认 cookie-only 传递
- `test_exchange_reads_cookie_not_body`
- `test_exchange_returns_token_pair_and_clears_cookie`
- `test_exchange_401_when_cookie_missing`
- `test_exchange_401_when_code_already_used`
- `test_exchange_401_when_user_disabled`
- `test_link_start_requires_jwt`
- `test_link_start_returns_redirect_url_and_stores_linker_in_state`
- `test_link_mode_callback_attaches_to_current_user`
- `test_link_mode_callback_redirects_to_settings_on_provider_in_use`
- `test_link_mode_callback_does_not_set_exchange_cookie`
- `test_return_to_open_redirect_rejected`
- `test_signup_blocked_after_ip_quota_reached`  ← § 9.7.1 反滥用
- `test_signup_quota_does_not_block_existing_user_login`

### 11.3 密码自助管理测试

`backend/tests/test_self_service_password.py`:

- `test_set_password_for_oauth_only_user_succeeds_without_current`
- `test_set_password_rejected_when_too_short` (< 12)
- `test_set_password_rejected_when_too_long` (> 128)
- `test_set_password_rejected_when_in_breached_top10k` ← NIST §5.1.1.2 compliance
- `test_set_password_rejected_when_contains_email_local_part`
- `test_set_password_accepts_long_passphrase_without_composition_rules` ← 验证不要 character class
- `test_change_password_requires_correct_current`
- `test_change_password_revokes_all_refresh_tokens_except_returned_new_one`
- `test_password_endpoint_rate_limited_5_per_min_per_jwt`
- `test_password_endpoint_rate_limited_10_per_min_per_ip`
- `test_password_change_writes_audit_log_with_password_was_null_flag`

### 11.4 反滥用基线测试

`backend/tests/test_abuse_mitigation.py`:

- `test_api_key_creation_blocked_after_per_user_daily_quota`
- `test_api_key_quota_resets_next_day`
- `test_admin_user_not_subject_to_api_key_quota`  ← 如果接受 admin 豁免;否则改为「admin 也受限但默认值更高」

### 11.5 现有测试回归

跑一次 `tests/test_auth.py` —— 确认密码登录 / refresh / logout 不受 `password_hash` nullable 改造影响。
跑一次 `tests/test_keys.py` —— 确认 API key 创建在 quota 内不变,只在超 quota 时 429。

### 11.6 PKCE 验证

`test_callback_includes_code_verifier_when_calling_token_endpoint` —— 用 mock 捕获 Authlib 发给 token endpoint 的请求,断言带了 `code_verifier`。

### 11.7 前端

最小烟囱测试,跑通:

- `/login` 页 OAuth 按钮可见(mock `/api/auth/oauth/providers` 返回 `{google: true, github: true}`)
- `/login?error=email_already_registered` 显示正确文案
- `/auth/oauth/complete` 挂载后调 `exchange`(cookie 在 jsdom 测试里手动注入)、成功后跳 `return_to`
- `/settings/security` 设置密码后弹「其它设备需重新登录」 toast
- `/settings/connections` 当用户只有一个登录方式时「解绑」按钮被禁用 + tooltip

## 12. 已知遗留 / Future Work

- **SMTP 邮件验证流程**:本次只支持 admin 手动标记 verified。未来接入 SMTP 后,在 `/settings` 加「发送验证邮件」按钮,完成后 `email_verified_at = now()`,使现存密码用户可以通过 OAuth 自动合并。
- **Token 存储升级**:当前 access / refresh token 在前端内存里(本次只引入了一个 60s `oauth_exchange` cookie,不是 session cookie)。未来可升级为 httpOnly session cookie + CSRF token,降低 XSS 暴露面。这是更大的前端重构,与本次 OAuth 解耦。
- **Refresh token family-level reuse detection**:CLAUDE.md 已经在 Known gaps 里列出,本次不解决。OAuth 路径用现有 `issue_token_pair`,所以继承现状。
- **CAPTCHA / bot detection**:本次只引入 IP 限流 + 用户配额作为反滥用基线。下个迭代接 Cloudflare Turnstile(免费、隐私友好),在登录页前端放 widget、callback 后端校验 `cf-turnstile-response` 头。
- **SMTP 邮件验证流程**:本次只支持 admin 手动标记 verified。未来接入 SMTP 后,在 `/settings` 加「发送验证邮件」按钮,完成后 `email_verified_at = now()`,使现存密码用户可以通过 OAuth 自动合并;同时支持「忘记密码」magic link,补足 OAuth-only 用户被锁死的另一条出路。
- **Provider 端凭据轮换**:Google / GitHub OAuth client_secret 长期不变也能用,但建议每年轮换一次。本次不引入自动轮换机制。
- **多 OIDC provider 通用化**:目前 Google / GitHub 各写一套 client 注册。如果未来加超过 3 个 provider,值得抽象成 OIDC discovery + 配置驱动。本次先 hardcode 两个 provider 在 `oauth_providers.py`。
- **跨站部署支持**:本设计要求 frontend 与 backend 同站(共享 eTLD+1),因为 `oauth_exchange` cookie 用 `SameSite=Strict`。如果未来需要跨站部署(frontend 与 backend 在不同 eTLD+1),需要升级到 `SameSite=None; Secure` 并补加 CSRF token,或者切回 query string + fragment 的方案(不推荐)。
- **Account lockout for `/api/auth/login`**:当前仅有 IP 限流(10/15min,CLAUDE.md 既定)。OWASP Authentication Cheat Sheet 推荐 per-account lockout 防御「跨 IP 慢速 brute force 单账号」。不在本次 OAuth PR 的 scope,但密码自助端点上线后 brute force 表面扩大,值得下一迭代加。
- **HIBP API 替换本地 breached list**:本次 MVP 用 SecLists top-10k 静态文件(80KB,覆盖最常被字典攻击的密码)。下个迭代接 HIBP k-anonymity API,覆盖 5 亿+ 条已泄露密码,且不需要应用层维护字典。HIBP 是 k-anonymity 设计,只发送 SHA-1 前缀,不泄露用户密码。
- **Refresh token rotation**:CLAUDE.md Known Gaps 已列。我们是 confidential client,RFC 9700 §2.2.1 说 SHOULD(不是 MUST)。本次 OAuth 不解决,继承现状。一旦实现,密码改密码端点的「撤销所有 refresh」会更彻底(配合 family-level detection 能发现复用)。

---

## 实施提交计划(给后续 writing-plans 的输入)

建议拆四个 PR,都在本设计的 scope 之内:

1. **后端 OAuth 基础设施**:数据模型 + Alembic + `OAuthLinkingService` + 路由(start/callback/exchange/link/start) + Authlib 注册 + cookie 设置 + 单元测试 + 反滥用基线(IP signup 限流 + API key quota)+ Prometheus 指标 + CLAUDE.md 更新。不动前端。
2. **后端密码自助管理**:`POST /api/auth/me/password` 端点 + 密码强度校验 + refresh token 撤销 + audit + 测试。独立于 OAuth,可并行做。
3. **前端 UI**:登录页 OAuth 按钮 + 错误文案显示 + `/auth/oauth/complete` + `/settings/connections` + `/settings/security` + admin panel 「标记邮箱已验证」按钮。
4. **文档 / README**:OAuth env 示例 + 部署指南(可以和 PR 1 合并)。

writing-plans 阶段会把 PR 1 拆成更细的可独立验证 task。
