# OAuth 登录 — Plan C:前端 UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 前端实现:登录页 OAuth 按钮 + 错误文案、`/auth/oauth/complete` exchange 中转页、`/settings/connections` 关联管理、`/settings/security` 密码管理、admin panel 「标记邮箱已验证」按钮。

**Architecture:** OAuth login 走 `window.location.assign` 顶层导航;exchange 后浏览器自动带 HttpOnly cookie 调 `POST /api/auth/oauth/exchange` 拿 token。Link mode 通过 `POST /link/start` 拿到 redirect URL 再导航。

**Tech Stack:** Vite + React 19 + TypeScript + Tailwind v4 + react-router-dom + sonner (toasts) + lucide-react,所有已有依赖。

**Reference spec:** `docs/superpowers/specs/2026-05-19-oauth-login-design.md` § 5 + § 8 + § 9.6 错误文案。

**Depends on:** Plan A + Plan B 已合入(后端端点已存在)。

---

## File Structure

### 新建

| 文件 | 责任 |
|---|---|
| `frontend/src/pages/oauth-complete.tsx` | Exchange 中转页:挂载后调 `exchangeOAuth` → 塞 token → 跳 `return_to` |
| `frontend/src/pages/settings-connections.tsx` | 列出 / 绑定 / 解绑 OAuth identities |
| `frontend/src/pages/settings-security.tsx` | 设置 / 修改密码 |
| `frontend/src/components/ui/google-icon.tsx` | 内嵌 Google 多色 SVG(lucide 不带 Google logo) |

### 修改

| 文件 | 改动 |
|---|---|
| `frontend/src/lib/types.ts` | 加 `OAuthProvidersStatus`、`OAuthIdentity`、`UserOut` 新字段 |
| `frontend/src/lib/api.ts` | 加 `getOAuthProviders` / `startOAuthLogin` / `startOAuthLink` / `exchangeOAuth` / `listConnections` / `detachConnection` / `setOrChangePassword` |
| `frontend/src/lib/auth.tsx` | `User` type 加 `has_password` / `email_verified_at` |
| `frontend/src/pages/login.tsx` | 顶部加 OAuth 按钮 + "or" 分割线 + URL `?error=` 文案 |
| `frontend/src/App.tsx` | 注册 `/auth/oauth/complete`、`/settings/connections`、`/settings/security` |
| `frontend/src/components/shell.tsx` | 侧栏「设置」二级菜单 |
| `frontend/src/lib/i18n/zh-CN.ts` + `en.ts` | 新增 i18n 键(login error code、settings 文案) |
| `frontend/src/pages/admin/users.tsx` | 「标记邮箱已验证」按钮 |

---

# Phase 1 — Types & API client

## Task C.1.1 — types.ts + auth.tsx 类型更新

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/auth.tsx`

- [ ] **Step 1: 加 types**

在 `frontend/src/lib/types.ts` 末尾追加:

```typescript
export type OAuthProvidersStatus = {
  google: boolean;
  github: boolean;
};

export type OAuthIdentity = {
  id: number;
  provider: "google" | "github";
  last_login_at: string | null;
  created_at: string;
};

export type PasswordChangeResponse = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  access_expires_in: number;
};
```

- [ ] **Step 2: 更新 User type 加 has_password / email_verified_at**

修改 `frontend/src/lib/auth.tsx` 的 `User` type:

```typescript
export type User = {
  id: number;
  email: string;
  display_name: string | null;
  role: "user" | "admin";
  status: "active" | "disabled";
  balance: string;
  has_password: boolean;
  email_verified_at: string | null;
  created_at: string;
};
```

- [ ] **Step 3: 跑 typecheck**

Run: `cd frontend && npm run build`
Expected: 编译成功(本步可能在其它页面引用旧 User type 时报错,要看 `tsc -b` 输出)。

如果有 type error,通常是某些组件解构 `user.email` 等没受影响——只要不解构不存在的字段就 OK。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/auth.tsx
git commit -m "feat(types): OAuth providers/identity types + User has_password/email_verified_at"
```

---

## Task C.1.2 — api.ts OAuth + 密码 helpers

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: 加 helpers**

在 `frontend/src/lib/api.ts` 末尾追加(注意已有 `api()` / `BASE` 等基础设施):

```typescript
import type {
  OAuthIdentity,
  OAuthProvidersStatus,
  PasswordChangeResponse,
} from "./types";

// ---- OAuth ----

export async function getOAuthProviders(): Promise<OAuthProvidersStatus> {
  return api<OAuthProvidersStatus>("/api/auth/oauth/providers", { silent: true });
}

export function startOAuthLogin(
  provider: "google" | "github",
  returnTo: string = "/dashboard",
): void {
  const qs = new URLSearchParams({ return_to: returnTo });
  window.location.assign(`${BASE}/api/auth/oauth/${provider}/start?${qs.toString()}`);
}

export async function startOAuthLink(
  provider: "google" | "github",
  returnTo: string = "/settings/connections",
): Promise<void> {
  const resp = await api<{ redirect_url: string }>(
    `/api/auth/oauth/${provider}/link/start`,
    { method: "POST", body: { return_to: returnTo } },
  );
  window.location.assign(resp.redirect_url);
}

export async function exchangeOAuth(): Promise<{
  access_token: string;
  refresh_token: string;
  user: import("./types").User;
}> {
  // exchange cookie 由浏览器自动带,需要 credentials: 'include'
  const res = await fetch(`${BASE}/api/auth/oauth/exchange`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    throw new ApiError(res.status, await res.text(), `Exchange failed (${res.status})`);
  }
  return res.json();
}

// ---- Settings: connections ----

export async function listConnections(): Promise<OAuthIdentity[]> {
  return api<OAuthIdentity[]>("/api/settings/connections");
}

export async function detachConnection(identityId: number): Promise<void> {
  await api(`/api/settings/connections/${identityId}`, { method: "DELETE", silent: true });
}

// ---- Settings: password ----

export async function setOrChangePassword(
  currentPassword: string | null,
  newPassword: string,
): Promise<PasswordChangeResponse> {
  return api<PasswordChangeResponse>("/api/auth/me/password", {
    method: "POST",
    body: {
      current_password: currentPassword,
      new_password: newPassword,
    },
  });
}

// ---- Admin: mark email verified ----

export async function adminMarkEmailVerified(userId: number): Promise<void> {
  await api(`/api/admin/users/${userId}/mark-email-verified`, { method: "POST" });
}
```

注:如果 `import("./types").User` 不可用,把 `User` 也放进 types.ts 然后正常 import。

- [ ] **Step 2: User type 必须从 types.ts 暴露**

修改 `frontend/src/lib/types.ts`,加(把 `User` 从 auth.tsx 复制过来,auth.tsx 改成从 types.ts re-export):

```typescript
export type User = {
  id: number;
  email: string;
  display_name: string | null;
  role: "user" | "admin";
  status: "active" | "disabled";
  balance: string;
  has_password: boolean;
  email_verified_at: string | null;
  created_at: string;
};
```

修改 `frontend/src/lib/auth.tsx`,顶部加:

```typescript
import type { User } from "./types";
export type { User };  // re-export for backwards compat
```

并删除原来的 `export type User = { ... }`(已搬到 types.ts)。

- [ ] **Step 3: 跑 typecheck**

Run: `cd frontend && npm run build`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/lib/types.ts frontend/src/lib/auth.tsx
git commit -m "feat(api): OAuth + password + connections client helpers"
```

---

# Phase 2 — Login 页 OAuth 按钮 + 错误文案

## Task C.2.1 — i18n 文案键

**Files:**
- Modify: `frontend/src/lib/i18n/zh-CN.ts` 或对应目录的两个文件

- [ ] **Step 1: 查 i18n 文件位置**

Run: `ls frontend/src/lib/i18n/` —— 确认有 `zh-CN.ts` / `en.ts` 等。

- [ ] **Step 2: 加 i18n keys**

在两个语言文件分别加(对照 key,翻译):

`zh-CN.ts`(在 `login.*` 段加):
```typescript
"login.orDivider": "或",
"login.withGoogle": "用 Google 登录",
"login.withGitHub": "用 GitHub 登录",
"login.error.email_unverified": "你的邮箱在 provider 那边尚未验证,请完成验证后再试。",
"login.error.email_already_registered": "该邮箱已被本地账号占用。请用密码登录后在「设置 → 关联账号」绑定。如果忘记密码,请联系管理员重置。",
"login.error.account_disabled": "该账号已被禁用,请联系管理员。",
"login.error.upstream_failure": "与登录服务通信失败,请稍后重试。",
"login.error.state_expired": "登录会话已过期(超过 5 分钟),请重新发起。",
"login.error.signup_rate_limited": "新账号注册过于频繁,请稍后再试。",
"login.error.generic": "登录失败,请重试。",

"settings.connections.title": "关联账号",
"settings.connections.empty": "暂无关联,绑定 Google / GitHub 后可以多端登录。",
"settings.connections.bindGoogle": "绑定 Google",
"settings.connections.bindGitHub": "绑定 GitHub",
"settings.connections.detach": "解绑",
"settings.connections.detachConfirm": "确认解绑此 {provider} 关联?",
"settings.connections.cannotDetachLast": "至少要保留一种登录方式。请先设置密码或绑定另一个 provider。",

"settings.security.title": "安全设置",
"settings.security.setPassword": "设置密码",
"settings.security.changePassword": "修改密码",
"settings.security.current": "当前密码",
"settings.security.new": "新密码",
"settings.security.confirm": "确认新密码",
"settings.security.submit": "保存",
"settings.security.tip": "密码至少 12 位。不必包含特殊字符,但不能是已被泄露的常见密码。",
"settings.security.success": "密码已更新。其它设备需重新登录。",
"settings.security.err.too_short": "密码至少要 12 个字符。",
"settings.security.err.too_long": "密码不能超过 128 个字符。",
"settings.security.err.breached": "这个密码出现在公开泄露列表里,请换一个。",
"settings.security.err.contains_email": "密码不能包含你的邮箱用户名。",
"settings.security.err.mismatch": "两次输入的新密码不一致。",
"settings.security.err.wrongCurrent": "当前密码不正确。",

"nav.settingsConnections": "关联账号",
"nav.settingsSecurity": "安全",

"admin.markEmailVerified": "标记邮箱已验证",
"admin.markEmailVerified.confirm": "确认?该操作记录到审计日志,允许此用户后续被 OAuth 自动合并。",
"admin.markEmailVerified.ok": "已标记验证。",
```

`en.ts` 对应英文(给出对照):
```typescript
"login.orDivider": "or",
"login.withGoogle": "Continue with Google",
"login.withGitHub": "Continue with GitHub",
"login.error.email_unverified": "Your email isn't verified at the provider. Verify it and try again.",
"login.error.email_already_registered": "This email is already in use by a local account. Sign in with your password, then link {provider} in Settings → Connections. If you forgot your password, contact your admin to reset.",
"login.error.account_disabled": "This account is disabled. Please contact your administrator.",
"login.error.upstream_failure": "Could not reach the OAuth provider. Please try again.",
"login.error.state_expired": "Your sign-in session expired (5 min limit). Please start again.",
"login.error.signup_rate_limited": "Too many new sign-ups from your network. Please try again later.",
"login.error.generic": "Sign-in failed. Please try again.",
// ... 同样补 settings.* / admin.*(同结构)
```

- [ ] **Step 3: 跑 typecheck 找漏 keys**

Run: `cd frontend && npm run build`
Expected: 如果 `useT` 严格,会报 missing key 错误。修补。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/i18n/
git commit -m "i18n: add OAuth login + settings + admin error/label keys"
```

---

## Task C.2.2 — Google icon component

**Files:**
- Create: `frontend/src/components/ui/google-icon.tsx`

- [ ] **Step 1: 写组件**

新文件 `frontend/src/components/ui/google-icon.tsx`:

```tsx
import type { SVGProps } from "react";

export function GoogleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.972 32.665 29.394 36 24 36
        c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657
        C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20
        c0-1.341-.138-2.65-.389-3.917z"/>
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12
        c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4
        16.318 4 9.656 8.337 6.306 14.691z"/>
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238
        C29.211 35.091 26.715 36 24 36c-5.371 0-9.939-3.31-11.286-7.946l-6.522 5.025
        C9.505 39.556 16.227 44 24 44z"/>
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571
        l.001-.001 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
    </svg>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ui/google-icon.tsx
git commit -m "feat(ui): GoogleIcon component (multi-color SVG)"
```

---

## Task C.2.3 — login.tsx 加 OAuth 按钮 + 错误读取

**Files:**
- Modify: `frontend/src/pages/login.tsx`

- [ ] **Step 1: 改 login.tsx**

替换 `frontend/src/pages/login.tsx` 的 `LoginPage` 组件,加 OAuth 按钮区和错误展示。完整改后内容(基于现有结构 + 新增):

```tsx
import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Github } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GoogleIcon } from "@/components/ui/google-icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getOAuthProviders, startOAuthLogin } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT, type TKey } from "@/lib/i18n";
import type { OAuthProvidersStatus } from "@/lib/types";

const ERROR_KEY_MAP: Record<string, TKey> = {
  email_unverified: "login.error.email_unverified",
  email_already_registered: "login.error.email_already_registered",
  account_disabled: "login.error.account_disabled",
  upstream_failure: "login.error.upstream_failure",
  state_expired: "login.error.state_expired",
  signup_rate_limited: "login.error.signup_rate_limited",
};

export function LoginPage() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [sp] = useSearchParams();
  const t = useT();
  const redirectTo = (loc.state as { from?: string } | null)?.from ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<OAuthProvidersStatus>({ google: false, github: false });

  useEffect(() => {
    getOAuthProviders().then(setProviders).catch(() => void 0);
  }, []);

  useEffect(() => {
    const code = sp.get("error");
    if (code) {
      const key = ERROR_KEY_MAP[code] ?? "login.error.generic";
      setError(t(key));
    }
  }, [sp, t]);

  if (user) return <Navigate to={redirectTo} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      nav(redirectTo, { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : null;
      setError(msg || t("login.failedFallback"));
    } finally {
      setBusy(false);
    }
  };

  const hasOAuth = providers.google || providers.github;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <BrandMark className="h-7 w-7" />
          <span className="font-semibold">Relay</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("login.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {hasOAuth && (
                <>
                  <div className="flex flex-col gap-2">
                    {providers.google && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => startOAuthLogin("google", redirectTo)}
                      >
                        <GoogleIcon className="h-4 w-4 mr-2" />
                        {t("login.withGoogle")}
                      </Button>
                    )}
                    {providers.github && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => startOAuthLogin("github", redirectTo)}
                      >
                        <Github className="h-4 w-4 mr-2" />
                        {t("login.withGitHub")}
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground my-1">
                    <div className="flex-1 h-px bg-border" />
                    <span>{t("login.orDivider")}</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                </>
              )}

              <form onSubmit={onSubmit} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">{t("login.emailLabel")}</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password">{t("login.passwordLabel")}</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                {error && (
                  <div className="text-xs text-destructive border border-destructive/40 bg-destructive/10 px-2 py-1.5 rounded">
                    {error}
                  </div>
                )}
                <Button type="submit" disabled={busy}>
                  {busy ? t("login.submitting") : t("login.submit")}
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

注:如果 `Button` 的 `variant="outline"` 不存在,改用 `variant="secondary"`(看 `frontend/src/components/ui/button.tsx`)。

- [ ] **Step 2: 跑 typecheck**

Run: `cd frontend && npm run build`
Expected: 0 errors

- [ ] **Step 3: 烟囱手测**

Run: `cd frontend && npm run dev`(背景),然后 `cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000`(背景)。

浏览器访问 `http://localhost:5173/login`:
- 没配 OAuth env vars 时,只显示密码表单
- 访问 `http://localhost:5173/login?error=email_already_registered` 时显示对应文案

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/login.tsx
git commit -m "feat(login): add OAuth buttons and ?error= message rendering"
```

---

# Phase 3 — `/auth/oauth/complete` 中转页

## Task C.3.1 — oauth-complete.tsx + App.tsx 路由

**Files:**
- Create: `frontend/src/pages/oauth-complete.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: 写中转页**

新文件 `frontend/src/pages/oauth-complete.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { exchangeOAuth, setToken, setRefreshToken } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";

export function OAuthCompletePage() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { refresh } = useAuth();
  const t = useT();
  const [state, setState] = useState<"working" | "error">("working");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    const returnTo = sp.get("return_to") || "/dashboard";
    (async () => {
      try {
        const resp = await exchangeOAuth();
        setToken(resp.access_token);
        setRefreshToken(resp.refresh_token);
        await refresh();
        nav(returnTo, { replace: true });
      } catch (e: unknown) {
        setState("error");
        setErrMsg(e instanceof Error ? e.message : "Unknown error");
      }
    })();
     
  }, []);

  if (state === "working") {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        {t("oauth.completing")}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-sm flex flex-col items-center gap-3">
        <h2 className="text-lg font-semibold">{t("oauth.failedTitle")}</h2>
        <p className="text-sm text-muted-foreground">{errMsg ?? t("oauth.failedMsg")}</p>
        <Button asChild>
          <Link to="/login">{t("oauth.backToLogin")}</Link>
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 加 i18n keys**

在 zh-CN.ts / en.ts 加:

```typescript
"oauth.completing": "正在完成登录…",
"oauth.failedTitle": "登录失败",
"oauth.failedMsg": "请回到登录页重试。",
"oauth.backToLogin": "返回登录",
```

英文对应:
```typescript
"oauth.completing": "Completing sign-in…",
"oauth.failedTitle": "Sign-in failed",
"oauth.failedMsg": "Please go back and try again.",
"oauth.backToLogin": "Back to sign-in",
```

- [ ] **Step 3: 注册路由**

修改 `frontend/src/App.tsx`,在 lazy import 段加:

```typescript
const OAuthCompletePage = lazy(() => import("@/pages/oauth-complete").then((m) => ({ default: m.OAuthCompletePage })));
```

在 `<Routes>` 中加(放在 `/login` 之后,任何需要 auth 的路由之前):

```tsx
<Route path="/auth/oauth/complete" element={<OAuthCompletePage />} />
```

- [ ] **Step 4: 跑 typecheck**

Run: `cd frontend && npm run build`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/oauth-complete.tsx frontend/src/App.tsx frontend/src/lib/i18n/
git commit -m "feat(oauth): /auth/oauth/complete page exchanges cookie for tokens"
```

---

# Phase 4 — Settings 二级路由 (Connections + Security)

## Task C.4.1 — settings-connections.tsx

**Files:**
- Create: `frontend/src/pages/settings-connections.tsx`

- [ ] **Step 1: 写页面**

新文件 `frontend/src/pages/settings-connections.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Github } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GoogleIcon } from "@/components/ui/google-icon";
import {
  detachConnection,
  getOAuthProviders,
  listConnections,
  startOAuthLink,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { OAuthIdentity, OAuthProvidersStatus } from "@/lib/types";

export function SettingsConnectionsPage() {
  const { user } = useAuth();
  const t = useT();
  const [identities, setIdentities] = useState<OAuthIdentity[]>([]);
  const [providers, setProviders] = useState<OAuthProvidersStatus>({ google: false, github: false });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [ids, prov] = await Promise.all([listConnections(), getOAuthProviders()]);
    setIdentities(ids);
    setProviders(prov);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  // 检查能否解绑某 identity:用户必须保留至少一种登录方式(密码或另一个 identity)
  const canDetach = (id: OAuthIdentity): boolean => {
    if (user?.has_password) return true;
    return identities.filter((x) => x.id !== id.id).length > 0;
  };

  const onDetach = async (id: OAuthIdentity) => {
    if (!confirm(t("settings.connections.detachConfirm").replace("{provider}", id.provider))) return;
    try {
      await detachConnection(id.id);
      await load();
      toast.success(t("settings.connections.detach"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "detach failed");
    }
  };

  const bind = (provider: "google" | "github") => {
    void startOAuthLink(provider);
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">…</div>;

  const linkedProviders = new Set(identities.map((i) => i.provider));

  return (
    <div className="p-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.connections.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {identities.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("settings.connections.empty")}</p>
          )}

          {identities.map((id) => (
            <div key={id.id} className="flex items-center justify-between border border-border rounded-md px-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                {id.provider === "google" ? <GoogleIcon className="h-4 w-4" /> : <Github className="h-4 w-4" />}
                <span className="capitalize">{id.provider}</span>
                {id.last_login_at && (
                  <span className="text-xs text-muted-foreground">
                    · {new Date(id.last_login_at).toLocaleString()}
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDetach(id)}
                disabled={!canDetach(id)}
                title={!canDetach(id) ? t("settings.connections.cannotDetachLast") : undefined}
              >
                {t("settings.connections.detach")}
              </Button>
            </div>
          ))}

          <div className="flex gap-2 pt-2">
            {providers.google && !linkedProviders.has("google") && (
              <Button variant="outline" onClick={() => bind("google")}>
                <GoogleIcon className="h-4 w-4 mr-2" />
                {t("settings.connections.bindGoogle")}
              </Button>
            )}
            {providers.github && !linkedProviders.has("github") && (
              <Button variant="outline" onClick={() => bind("github")}>
                <Github className="h-4 w-4 mr-2" />
                {t("settings.connections.bindGitHub")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: 在 App.tsx 注册路由**

修改 `frontend/src/App.tsx`,加 lazy import:

```typescript
const SettingsConnectionsPage = lazy(() => import("@/pages/settings-connections").then((m) => ({ default: m.SettingsConnectionsPage })));
```

在 Routes 中加(在已登录路由区):

```tsx
<Route path="/settings/connections" element={<Workspace><SettingsConnectionsPage /></Workspace>} />
```

- [ ] **Step 3: 跑 typecheck**

Run: `cd frontend && npm run build`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/settings-connections.tsx frontend/src/App.tsx
git commit -m "feat(settings): /settings/connections page for OAuth identity mgmt"
```

---

## Task C.4.2 — settings-security.tsx (密码管理)

**Files:**
- Create: `frontend/src/pages/settings-security.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: 写页面**

新文件 `frontend/src/pages/settings-security.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setOrChangePassword, setToken, setRefreshToken, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT, type TKey } from "@/lib/i18n";

const ERR_MAP: Record<string, TKey> = {
  too_short: "settings.security.err.too_short",
  too_long: "settings.security.err.too_long",
  breached: "settings.security.err.breached",
  contains_email: "settings.security.err.contains_email",
};

export function SettingsSecurityPage() {
  const { user, refresh } = useAuth();
  const t = useT();
  const hasPwd = !!user?.has_password;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (next !== confirm) {
      setErr(t("settings.security.err.mismatch"));
      return;
    }
    setBusy(true);
    try {
      const resp = await setOrChangePassword(hasPwd ? current : null, next);
      setToken(resp.access_token);
      setRefreshToken(resp.refresh_token);
      await refresh();
      toast.success(t("settings.security.success"));
      setCurrent(""); setNext(""); setConfirm("");
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        if (e.status === 401) {
          setErr(t("settings.security.err.wrongCurrent"));
        } else if (e.status === 422) {
          // 后端返回 detail: "password_rejected:<code>"
          const body = e.body as { detail?: string } | string | null;
          const detail = typeof body === "object" && body && "detail" in body ? body.detail : "";
          const code = (detail || "").replace("password_rejected:", "");
          const key = ERR_MAP[code];
          setErr(key ? t(key) : (e.message || "rejected"));
        } else {
          setErr(e.message);
        }
      } else {
        setErr(e instanceof Error ? e.message : "unknown");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.security.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            {hasPwd && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="current">{t("settings.security.current")}</Label>
                <Input id="current" type="password" autoComplete="current-password"
                  value={current} onChange={(e) => setCurrent(e.target.value)} required />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new">{t("settings.security.new")}</Label>
              <Input id="new" type="password" autoComplete="new-password"
                value={next} onChange={(e) => setNext(e.target.value)} required minLength={12} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm">{t("settings.security.confirm")}</Label>
              <Input id="confirm" type="password" autoComplete="new-password"
                value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={12} />
            </div>
            <p className="text-xs text-muted-foreground">{t("settings.security.tip")}</p>
            {err && (
              <div className="text-xs text-destructive border border-destructive/40 bg-destructive/10 px-2 py-1.5 rounded">
                {err}
              </div>
            )}
            <Button type="submit" disabled={busy}>
              {hasPwd ? t("settings.security.changePassword") : t("settings.security.setPassword")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: App.tsx 注册路由**

修改 `frontend/src/App.tsx`:

```typescript
const SettingsSecurityPage = lazy(() => import("@/pages/settings-security").then((m) => ({ default: m.SettingsSecurityPage })));
```

```tsx
<Route path="/settings/security" element={<Workspace><SettingsSecurityPage /></Workspace>} />
```

- [ ] **Step 3: 跑 typecheck**

Run: `cd frontend && npm run build`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/settings-security.tsx frontend/src/App.tsx
git commit -m "feat(settings): /settings/security page for password set/change"
```

---

# Phase 5 — Shell 侧栏 + Admin 「标记验证」按钮

## Task C.5.1 — 侧栏加 Settings 二级

**Files:**
- Modify: `frontend/src/components/shell.tsx`

- [ ] **Step 1: 加 Settings 二级条目**

修改 `frontend/src/components/shell.tsx`,在 `WS_NAV` 数组末尾加:

```typescript
{ to: "/settings/connections", key: "nav.settingsConnections", Icon: Shield },
{ to: "/settings/security", key: "nav.settingsSecurity", Icon: Settings },
```

(`Shield` 和 `Settings` 已经在 lucide-react import 段里——确认看现有 import,如缺则加。)

- [ ] **Step 2: 跑 typecheck + 烟囱浏览器测**

Run: `cd frontend && npm run build`
Expected: 0 errors

启动 dev 后浏览器登录,验证侧栏有「关联账号」「安全」两个新条目。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/shell.tsx
git commit -m "feat(shell): add Connections + Security to workspace sidebar"
```

---

## Task C.5.2 — Admin 「标记邮箱已验证」按钮

**Files:**
- Modify: `frontend/src/pages/admin/users.tsx`

- [ ] **Step 1: 找出 admin users 页结构**

Run: `wc -l frontend/src/pages/admin/users.tsx && head -30 frontend/src/pages/admin/users.tsx`

- [ ] **Step 2: 加按钮**

在 admin users 页的 user 行操作列里加按钮(具体 JSX 位置看现有代码):

```tsx
import { adminMarkEmailVerified } from "@/lib/api";

// ... 在 user 行操作组内:

{!user.email_verified_at && (
  <Button
    size="sm"
    variant="ghost"
    onClick={async () => {
      if (!confirm(t("admin.markEmailVerified.confirm"))) return;
      try {
        await adminMarkEmailVerified(user.id);
        toast.success(t("admin.markEmailVerified.ok"));
        await reload();  // 看现有重载方法
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "failed");
      }
    }}
  >
    {t("admin.markEmailVerified")}
  </Button>
)}
```

注:`user.email_verified_at` 字段也需要在 admin users 列表的后端 response 中暴露(Plan A 已经在 UserOut 加了)。如果 admin users API 不直接返回 UserOut,需要确认 `email_verified_at` 在返回里——如缺,在 backend admin endpoint 补一下。

- [ ] **Step 3: typecheck + 手测**

Run: `cd frontend && npm run build`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/admin/users.tsx
git commit -m "feat(admin): mark-email-verified button on user row"
```

---

# Self-Review

- [ ] **typecheck 全 pass**:`cd frontend && npm run build` 0 errors
- [ ] **Spec § 8 文件改动列表**:对照,每条都有任务覆盖
- [ ] **手测 happy path**(需要 Plan A、B 已合入,后端 + 前端都跑):
  - 配 GOOGLE_OAUTH 后访问 `/login` → 看到 Google 按钮
  - 点 → 跳 Google → 授权回来 → 看到 dashboard
  - 进 `/settings/connections` → 显示 Google 已绑
  - 进 `/settings/security` → OAuth-only 用户能首次设密码
  - admin 视角:`/admin/users` 看到「标记邮箱已验证」按钮

完成。
