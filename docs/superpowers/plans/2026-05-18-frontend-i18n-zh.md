# 前端中英文 i18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Relay 前端控制台支持中英文切换，默认按 `navigator.language` 检测、`localStorage` 记忆；保留所有技术名词、模型名、代码示例的英文原样。

**Architecture:** 手写 `LanguageProvider` Context + 字典文件（`dict-en.ts` 为 key 的权威来源、`dict-zh.ts` 类型必须与之结构一致）+ `useT(key, vars?)` hook。`LanguageSwitcher` 放 sidebar 底部和 login 页右上。所有页面把硬编码英文文案替换成 `t("namespace.key")`；TS 类型推导保证 key 拼写错误编译期就报错。

**Tech Stack:** React 19、TypeScript（strict + verbatimModuleSyntax + erasableSyntaxOnly）、Vite 8、Tailwind v4、无新增 npm 依赖。

**Spec:** [docs/superpowers/specs/2026-05-18-frontend-i18n-zh-design.md](../specs/2026-05-18-frontend-i18n-zh-design.md)

**Conventions:**

- 所有改动只在 `frontend/` 下
- 工作目录：`llm-api-gateway/frontend/`
- 项目无测试运行器；验证靠 `npm run build`（TS strict + tsc -b）+ 浏览器手动核对
- 每个 Task 末尾必须 `git add` 具体文件后 commit，不用 `git add -A` 或 `.`
- Commit message 前缀：`feat(i18n):` / `chore(i18n):`
- 不要新增任何 npm 依赖

---

## File Structure

**Create:**
- `frontend/src/lib/i18n/types.ts` — `Lang`、`Dict`、由 `dict-en` 反推的 `TKey` 字面量联合
- `frontend/src/lib/i18n/dict-en.ts` — 英文字典；导出 `const en` 与 `type EnDict = typeof en`
- `frontend/src/lib/i18n/dict-zh.ts` — 中文字典；类型签名为 `EnDict`，结构必须一致
- `frontend/src/lib/i18n/index.tsx` — `LanguageProvider`、`useT`、`useLang`、`Lang` re-export
- `frontend/src/components/language-switcher.tsx` — 切换控件

**Modify:**
- `frontend/src/main.tsx` — 注入 `LanguageProvider`
- `frontend/src/components/shell.tsx` — sidebar 文案 + 嵌入 switcher
- `frontend/src/pages/login.tsx` — login 文案 + 嵌入 switcher
- `frontend/src/pages/dashboard.tsx`
- `frontend/src/pages/api-keys.tsx`
- `frontend/src/pages/usage-logs.tsx`
- `frontend/src/pages/playground.tsx`
- `frontend/src/pages/models.tsx`
- `frontend/src/pages/billing.tsx`
- `frontend/src/pages/generations.tsx`
- `frontend/src/pages/docs.tsx`（仅 H1/H2 + intro 段，详见 Task 12）
- `frontend/src/pages/admin/overview.tsx`
- `frontend/src/pages/admin/users.tsx`
- `frontend/src/pages/admin/models.tsx`
- `frontend/src/pages/admin/providers.tsx`
- `frontend/src/pages/admin/logs.tsx`
- `frontend/src/components/log-detail-drawer.tsx`

---

## Task 1: i18n 骨架（types / dicts shell / Provider / hooks）

**Files:**
- Create: `frontend/src/lib/i18n/types.ts`
- Create: `frontend/src/lib/i18n/dict-en.ts`
- Create: `frontend/src/lib/i18n/dict-zh.ts`
- Create: `frontend/src/lib/i18n/index.tsx`

- [ ] **Step 1: 写 dict-en 的初始空骨架（只放 common + nav 两个 namespace，足够后续 Task 验证）**

`frontend/src/lib/i18n/dict-en.ts`：

```ts
export const en = {
  common: {
    save: "Save",
    cancel: "Cancel",
    confirm: "Confirm",
    delete: "Delete",
    close: "Close",
    loading: "Loading…",
    empty: "No data",
    retry: "Retry",
    copy: "Copy",
    copied: "Copied",
    error: "Error",
  },
  nav: {
    sectionWorkspace: "Workspace",
    sectionAdmin: "Admin",
    sectionSwitch: "Switch",
    dashboard: "Dashboard",
    apiKeys: "API Keys",
    usageLogs: "Usage / Logs",
    playground: "Playground",
    generations: "Generations",
    billing: "Billing",
    models: "Models",
    docs: "Docs",
    adminOverview: "Overview",
    adminUsers: "Users",
    adminModels: "Models",
    adminProviders: "Providers",
    adminLogs: "All Logs",
    toAdmin: "Admin",
    toWorkspace: "Workspace",
    signOut: "Sign out",
  },
} as const;

export type EnDict = typeof en;
```

- [ ] **Step 2: 写 dict-zh shell**

`frontend/src/lib/i18n/dict-zh.ts`：

```ts
import type { EnDict } from "./dict-en";

export const zh: EnDict = {
  common: {
    save: "保存",
    cancel: "取消",
    confirm: "确认",
    delete: "删除",
    close: "关闭",
    loading: "加载中…",
    empty: "暂无数据",
    retry: "重试",
    copy: "复制",
    copied: "已复制",
    error: "错误",
  },
  nav: {
    sectionWorkspace: "工作区",
    sectionAdmin: "管理后台",
    sectionSwitch: "切换",
    dashboard: "仪表盘",
    apiKeys: "API Keys",
    usageLogs: "用量 / 日志",
    playground: "Playground",
    generations: "生成记录",
    billing: "计费",
    models: "模型",
    docs: "文档",
    adminOverview: "总览",
    adminUsers: "用户",
    adminModels: "模型",
    adminProviders: "服务商",
    adminLogs: "全部日志",
    toAdmin: "管理后台",
    toWorkspace: "工作区",
    signOut: "退出登录",
  },
};
```

- [ ] **Step 3: 写 types.ts（路径推导）**

`frontend/src/lib/i18n/types.ts`：

```ts
import type { EnDict } from "./dict-en";

export type Lang = "en" | "zh";

// 递归收集所有点号路径，例如 "common.save" | "nav.dashboard"
export type PathOf<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? P extends ""
      ? K
      : `${P}.${K}`
    : PathOf<T[K], P extends "" ? K : `${P}.${K}`>;
}[keyof T & string];

export type TKey = PathOf<EnDict>;
```

- [ ] **Step 4: 写 index.tsx — Provider + hooks**

`frontend/src/lib/i18n/index.tsx`：

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { en } from "./dict-en";
import { zh } from "./dict-zh";
import type { Lang, TKey } from "./types";

export type { Lang, TKey } from "./types";

const STORAGE_KEY = "lang";

function detectInitialLang(): Lang {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "zh") return stored;
  const nav = window.navigator.language || "";
  return nav.toLowerCase().startsWith("zh") ? "zh" : "en";
}

type Vars = Record<string, string | number>;

function lookup(dict: unknown, path: string): string {
  const parts = path.split(".");
  let cur: unknown = dict;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return path; // 兜底：缺 key 直接显示 key 路径，便于发现
    }
  }
  return typeof cur === "string" ? cur : path;
}

function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k: string) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  );
}

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TKey, vars?: Vars) => string;
};

const LanguageContext = createContext<Ctx | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitialLang);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    }
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage 不可用时静默忽略；下一次刷新会回到检测逻辑
    }
  }, []);

  const t = useCallback(
    (key: TKey, vars?: Vars) => {
      const dict = lang === "zh" ? zh : en;
      return interpolate(lookup(dict, key), vars);
    },
    [lang],
  );

  const value = useMemo<Ctx>(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLang must be used inside <LanguageProvider>");
  return { lang: ctx.lang, setLang: ctx.setLang };
}

export function useT() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useT must be used inside <LanguageProvider>");
  return ctx.t;
}
```

- [ ] **Step 5: 编译验证**

```bash
cd frontend && npm run build
```

Expected: 编译成功（dict-zh 类型为 `EnDict`，结构对齐；缺/多 key 会报错）。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/i18n/types.ts frontend/src/lib/i18n/dict-en.ts frontend/src/lib/i18n/dict-zh.ts frontend/src/lib/i18n/index.tsx
git commit -m "feat(i18n): add LanguageProvider + dict-en/zh scaffolding (common, nav)"
```

---

## Task 2: LanguageSwitcher 组件

**Files:**
- Create: `frontend/src/components/language-switcher.tsx`

- [ ] **Step 1: 写组件**

```tsx
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border border-border bg-surface-2 p-0.5 text-[11px]",
        className,
      )}
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        onClick={() => setLang("en")}
        className={cn(
          "px-2 py-0.5 rounded-sm transition-colors",
          lang === "en"
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={lang === "en"}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang("zh")}
        className={cn(
          "px-2 py-0.5 rounded-sm transition-colors",
          lang === "zh"
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={lang === "zh"}
      >
        中文
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 编译验证**

```bash
cd frontend && npm run build
```

Expected: 通过（未使用警告不会发，因为 `noUnusedLocals` 只针对本文件内未使用变量；导出还未消费但允许）。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/language-switcher.tsx
git commit -m "feat(i18n): add LanguageSwitcher (EN | 中文 pill buttons)"
```

---

## Task 3: 接入 LanguageProvider 到 main.tsx

**Files:**
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: 改 main.tsx**

把 `LanguageProvider` 包在 `BrowserRouter` 外层（要在 `AuthProvider` 外也无所谓；放最外层让 login 也能用）。

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import App from "./App.tsx";
import { AuthProvider } from "./lib/auth";
import { LanguageProvider } from "./lib/i18n";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LanguageProvider>
      <BrowserRouter>
        <AuthProvider>
          <App />
          <Toaster
            theme="dark"
            richColors
            position="bottom-right"
            toastOptions={{
              classNames: {
                toast: "bg-surface-2 border border-border text-foreground",
              },
            }}
          />
        </AuthProvider>
      </BrowserRouter>
    </LanguageProvider>
  </StrictMode>,
);
```

- [ ] **Step 2: 编译验证**

```bash
cd frontend && npm run build
```

Expected: 通过。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/main.tsx
git commit -m "feat(i18n): wrap app in LanguageProvider"
```

---

## Task 4: shell.tsx 接入 t() + switcher

**Files:**
- Modify: `frontend/src/components/shell.tsx`

Spec §6 要求：switcher 放在 sidebar 底部用户区，紧贴 `Sign out` 按钮上方。

- [ ] **Step 1: 改 shell.tsx**

把 `WS_NAV` / `ADMIN_NAV` 改成 key 化数组，渲染时用 `t(...)`；底部用户区插入 switcher。

完整替换文件：

```tsx
import {
  Activity,
  BookOpen,
  CircleDollarSign,
  CpuIcon,
  Gauge,
  Image as ImageIcon,
  Key,
  LayoutGrid,
  LogOut,
  PlayCircle,
  Settings,
  Shield,
  Terminal,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useAuth } from "@/lib/auth";
import { useT, type TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const WS_NAV: { to: string; key: TKey; Icon: typeof Gauge }[] = [
  { to: "/dashboard", key: "nav.dashboard", Icon: Gauge },
  { to: "/keys", key: "nav.apiKeys", Icon: Key },
  { to: "/logs", key: "nav.usageLogs", Icon: Activity },
  { to: "/playground", key: "nav.playground", Icon: PlayCircle },
  { to: "/generations", key: "nav.generations", Icon: ImageIcon },
  { to: "/billing", key: "nav.billing", Icon: CircleDollarSign },
  { to: "/models", key: "nav.models", Icon: CpuIcon },
  { to: "/docs", key: "nav.docs", Icon: BookOpen },
];

const ADMIN_NAV: { to: string; key: TKey; Icon: typeof Gauge }[] = [
  { to: "/admin", key: "nav.adminOverview", Icon: LayoutGrid },
  { to: "/admin/users", key: "nav.adminUsers", Icon: Users },
  { to: "/admin/models", key: "nav.adminModels", Icon: CpuIcon },
  { to: "/admin/providers", key: "nav.adminProviders", Icon: Settings },
  { to: "/admin/logs", key: "nav.adminLogs", Icon: Terminal },
];

export function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const t = useT();
  const isAdminArea = loc.pathname.startsWith("/admin");
  const nav = isAdminArea ? ADMIN_NAV : WS_NAV;

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-56 shrink-0 border-r border-border bg-surface flex flex-col">
        <div className="p-4 border-b border-border">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div
              className="h-6 w-6 rounded-md flex items-center justify-center"
              style={{ background: "var(--accent)" }}
            >
              <span
                className="text-[12px] font-bold"
                style={{ color: "var(--accent-foreground)" }}
              >
                R
              </span>
            </div>
            <span className="font-semibold text-sm">Relay</span>
            <span className="text-[10px] text-muted-foreground border border-border px-1.5 py-0.5 rounded mono">
              MVP
            </span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5 mt-1">
            {isAdminArea ? t("nav.sectionAdmin") : t("nav.sectionWorkspace")}
          </div>
          {nav.map(({ to, key, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/admin"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm",
                  isActive
                    ? "bg-surface-2 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface-2",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {t(key)}
            </NavLink>
          ))}

          {user?.role === "admin" && (
            <>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5 mt-4">
                {t("nav.sectionSwitch")}
              </div>
              <Link
                to={isAdminArea ? "/dashboard" : "/admin"}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-surface-2"
              >
                <Shield className="h-4 w-4" />
                {isAdminArea ? t("nav.toWorkspace") : t("nav.toAdmin")}
              </Link>
            </>
          )}
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="min-w-0">
              <div className="text-xs text-foreground truncate">{user?.email}</div>
              <div className="text-[10px] text-muted-foreground capitalize">{user?.role}</div>
            </div>
            <LanguageSwitcher />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            onClick={logout}
          >
            <LogOut className="h-3.5 w-3.5" /> {t("nav.signOut")}
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="px-6 py-6 max-w-[1600px] mx-auto">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
```

- [ ] **Step 2: 编译验证**

```bash
cd frontend && npm run build
```

Expected: 通过。

- [ ] **Step 3: 浏览器手动检查**

```bash
cd frontend && npm run dev
```

打开 `http://localhost:5173`，登录后：

- 切到 EN：sidebar 与 main 分支视觉一致
- 切到中文：sidebar 显示"仪表盘 / API Keys / 用量 / 日志 / Playground / 生成记录 / 计费 / 模型 / 文档"等
- 切换器位置正确，激活态明显
- 刷新页面后语言保持

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/shell.tsx
git commit -m "feat(i18n): translate sidebar + embed LanguageSwitcher"
```

---

## Task 5: login.tsx 接入 t() + switcher（含 login namespace）

**Files:**
- Modify: `frontend/src/lib/i18n/dict-en.ts`
- Modify: `frontend/src/lib/i18n/dict-zh.ts`
- Modify: `frontend/src/pages/login.tsx`

- [ ] **Step 1: 在 dict-en.ts 顶层 `en` 对象里追加 `login` namespace（不要覆盖 common / nav）**

```ts
  login: {
    title: "Sign in",
    emailLabel: "Email",
    passwordLabel: "Password",
    submit: "Sign in",
    submitting: "Signing in…",
    failedFallback: "Login failed",
    defaultHint: "Default admin (from .env): {email} / {password}",
  },
```

- [ ] **Step 2: 在 dict-zh.ts 对应位置追加翻译**

```ts
  login: {
    title: "登录",
    emailLabel: "邮箱",
    passwordLabel: "密码",
    submit: "登录",
    submitting: "登录中…",
    failedFallback: "登录失败",
    defaultHint: "默认管理员（来自 .env）：{email} / {password}",
  },
```

- [ ] **Step 3: 改 login.tsx**

完整替换：

```tsx
import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";

export function LoginPage() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const t = useT();
  const redirectTo = (loc.state as { from?: string } | null)?.from ?? "/dashboard";
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("admin123");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div
            className="h-7 w-7 rounded-md flex items-center justify-center"
            style={{ background: "var(--accent)" }}
          >
            <span className="text-sm font-bold" style={{ color: "var(--accent-foreground)" }}>
              R
            </span>
          </div>
          <span className="font-semibold">Relay</span>
          <span className="text-[10px] text-muted-foreground border border-border px-1.5 py-0.5 rounded mono">
            MVP
          </span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("login.title")}</CardTitle>
          </CardHeader>
          <CardContent>
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
            <p className="text-xs text-muted-foreground mt-4">
              {t("login.defaultHint", { email: "admin@example.com", password: "admin123" })}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

注意：`err: any` 改成 `err: unknown` 通过 strict 检查；这是顺手的小修复，不算 scope 扩张。

- [ ] **Step 4: 编译验证**

```bash
cd frontend && npm run build
```

Expected: 通过。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/i18n/dict-en.ts frontend/src/lib/i18n/dict-zh.ts frontend/src/pages/login.tsx
git commit -m "feat(i18n): translate login page + add switcher"
```

---

## Task 6: dashboard.tsx

**Files:**
- Modify: `frontend/src/lib/i18n/dict-en.ts`
- Modify: `frontend/src/lib/i18n/dict-zh.ts`
- Modify: `frontend/src/pages/dashboard.tsx`

- [ ] **Step 1: 读取页面，识别所有 UI 文案**

```bash
cd frontend && cat src/pages/dashboard.tsx
```

把页面中所有面向用户的英文字符串列出来：PageHeader 的 title/subtitle、KPI 标签、表格列、按钮、空状态、loading 文案。**跳过**：模型 public_name、cost 数字、邮箱、API key prefix 等数据值。

- [ ] **Step 2: 在 dict-en.ts 顶层追加 `dashboard` namespace**

对页面里发现的每一个面向用户的字符串都加一条 key。命名规范：
- 页面标题：`dashboard.title` / `dashboard.subtitle`
- KPI：`dashboard.kpiBalance` / `dashboard.kpiSpendMtd` / `dashboard.kpiRequestsMtd` 等
- 表格列：`dashboard.col<ColumnName>`，例如 `dashboard.colTime` / `dashboard.colModel` / `dashboard.colCost`
- section 标题：`dashboard.recentRequests` 等
- 空状态：`dashboard.empty` 或 `common.empty` 复用

带数字/邮箱/日期等动态值的句子用 `{var}` 插值。

- [ ] **Step 3: 在 dict-zh.ts 对应位置追加翻译**

翻译原则（来自 spec §5）：
- 不直译但不省略关键定语
- 金额/上限/费率的描述要让用户准确理解扣费
- API Key / JWT / Token / RPM / TPM / Bearer / SSE 保持英文
- 模型名、Provider 名、字段名保持英文
- `Dashboard → 仪表盘`、`Balance → 余额`、`Spend → 花费`、`Requests → 请求数`、`Recent → 最近`、`Time → 时间`、`Model → 模型`、`Cost → 费用`、`Status → 状态`、`Type → 类型`、`Latency → 延迟`、`Tokens → Tokens`

- [ ] **Step 4: 改 dashboard.tsx — 把英文硬编码全部换成 `t("dashboard.xxx")` 或 `t("common.xxx")`**

页面顶部加：
```tsx
import { useT } from "@/lib/i18n";
```
组件内：
```tsx
const t = useT();
```
把每个英文字符串替换成对应 `t(...)` 调用。

- [ ] **Step 5: 编译验证 + EN 视觉回归**

```bash
cd frontend && npm run build
```
Expected: 通过。

```bash
npm run dev
```
打开 dashboard，**保持 EN**，逐项对比改前后字符。

- [ ] **Step 6: 中文回归**

切到中文，每个 UI 元素都有中文，**无英文残留**（§5.1 保留项除外）。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/i18n/dict-en.ts frontend/src/lib/i18n/dict-zh.ts frontend/src/pages/dashboard.tsx
git commit -m "feat(i18n): translate dashboard"
```

---

## Task 7: api-keys.tsx

**Files:**
- Modify: `frontend/src/lib/i18n/dict-en.ts`
- Modify: `frontend/src/lib/i18n/dict-zh.ts`
- Modify: `frontend/src/pages/api-keys.tsx`

同 Task 6 的方法，namespace 为 `apiKeys`。

- [ ] **Step 1: 读页面 → 列文案清单**

```bash
cd frontend && cat src/pages/api-keys.tsx
```

预期会覆盖：页面标题/副标题、`Create new key` 按钮、创建对话框（Name / RPM limit / Create / Cancel）、密钥揭示对话框（`Copy and store the key now — it will not be shown again.` 这类**重要提示**必须完整翻译**不可省略**）、表格列（Name / Prefix / Created / Last used / RPM / Status / Actions）、Revoke 按钮、空状态、toast 文案。

- [ ] **Step 2-3: dict-en + dict-zh 追加 `apiKeys` namespace**

翻译要点：
- `API Key` 在表格列名和按钮里**保持英文**（`API Keys` 不译；列名 `Prefix` 译为"前缀"或保留？保留"前缀"，因为这是表格列、长度有限）
- **重要的安全提示必须完整翻译**：
  - en: `"Copy and store the key now — it will not be shown again."`
  - zh: `"现在就复制并妥善保管该密钥——它只会显示这一次。"`
- `Revoke → 吊销`、`Rotate → 轮换`（如果有）、`RPM limit → RPM 上限`
- 时间相关：`Last used → 最近使用`、`Created → 创建时间`、`Never → 从未`

- [ ] **Step 4: 改 api-keys.tsx 替换所有面向用户的英文文案**

- [ ] **Step 5: 编译 + EN 回归 + 中文回归**

```bash
cd frontend && npm run build
```

浏览器：创建 key、查看密钥揭示对话框、吊销，确认两语言都正确，**安全提示在中文下完整且不省略**。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/i18n/dict-en.ts frontend/src/lib/i18n/dict-zh.ts frontend/src/pages/api-keys.tsx
git commit -m "feat(i18n): translate api-keys page"
```

---

## Task 8: usage-logs.tsx + log-detail-drawer.tsx

**Files:**
- Modify: `frontend/src/lib/i18n/dict-en.ts`
- Modify: `frontend/src/lib/i18n/dict-zh.ts`
- Modify: `frontend/src/pages/usage-logs.tsx`
- Modify: `frontend/src/components/log-detail-drawer.tsx`

usage-logs 和 log-detail-drawer 强相关（点表格行打开 drawer），一起做。

- [ ] **Step 1: 读两个文件**

```bash
cd frontend && cat src/pages/usage-logs.tsx src/components/log-detail-drawer.tsx
```

- [ ] **Step 2-3: 追加 `usageLogs` + `logDrawer` namespace**

预期文案：
- usageLogs: 标题、副标题、筛选器（按模型、按类型、按状态、按时间）、表格列、空状态、分页提示
- logDrawer: 抽屉标题（`Log #...`）、各 section（`Request`、`Response`、`Pricing`、`Provider details`）、字段标签、复制按钮、原始 JSON 标签等

翻译要点：
- `Request payload → 请求载荷` 或保留 `Request payload`（如果项目里和后端字段同名）—— 这里译为"请求内容"足够口语化
- `Response → 响应`、`Pricing → 计价`、`Cost breakdown → 费用明细`
- `Snapshot → 快照`（与 spec/CLAUDE.md 中 pricing snapshot 概念一致）
- `Estimated → 估算`、`Upstream → 上游`
- `usage_source = upstream / estimated / missing` — **字段值保留英文**（这是后端枚举），但 label 译为"用量来源"
- 数字单位 `tokens / USD / ms / s` 保留

- [ ] **Step 4: 改两个文件**

- [ ] **Step 5: 编译 + EN 回归 + 中文回归**

```bash
cd frontend && npm run build
```

浏览器：进 usage-logs 页，打开任意一条日志的 drawer，核对两个语言。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/i18n/dict-en.ts frontend/src/lib/i18n/dict-zh.ts frontend/src/pages/usage-logs.tsx frontend/src/components/log-detail-drawer.tsx
git commit -m "feat(i18n): translate usage-logs page + log-detail-drawer"
```

---

## Task 9: playground.tsx

**Files:**
- Modify: `frontend/src/lib/i18n/dict-en.ts`
- Modify: `frontend/src/lib/i18n/dict-zh.ts`
- Modify: `frontend/src/pages/playground.tsx`

628 行，含 OpenAI + Anthropic 双协议选择、模型选择、参数（temperature / max_tokens / top_p / stream 等）、API key 输入、流式输出区、错误区。是单 Task 中最大的一个。

- [ ] **Step 1: 读页面**

```bash
cd frontend && cat src/pages/playground.tsx
```

- [ ] **Step 2-3: 追加 `playground` namespace**

预期 key 数量较多（30-50 条）。建议子分组：
```
playground.title / subtitle
playground.protocolLabel / protocolChat / protocolMessages
playground.apiKeyLabel / apiKeyPlaceholder / apiKeyHint
playground.modelLabel
playground.systemPromptLabel / systemPromptPlaceholder
playground.userMessageLabel / userMessagePlaceholder
playground.paramTemperature / paramMaxTokens / paramTopP / paramStream
playground.send / sending / stop
playground.outputTitle / outputEmpty
playground.usageTokensInput / usageTokensOutput / usageCost
playground.errorTitle
playground.warnSessionStorage  ← session storage 提示一定要完整翻译
...
```

翻译要点：
- `Chat Completions → Chat Completions`（协议名保留英文）
- `Messages (Anthropic) → Messages (Anthropic)`（协议名保留）
- `API key (lgw_…) → API Key（lgw_…）`
- `system prompt → 系统提示词` 或 `System Prompt`（开发者用语，保留首字母大写也可——选"系统提示词"更自然）
- `max_tokens` / `temperature` / `top_p` — 字段名**保留英文**（spec §5.1）
- `stream → 流式` / `非流式`
- `Send → 发送`、`Stop → 中止`
- **sessionStorage 提示**完整翻译，参考 CLAUDE.md：键只存当前 tab；关 tab 即清空——这条**不可省略**
- 代码示例区（如果有展示等价 curl/SDK 代码块）**不动**

- [ ] **Step 4: 改 playground.tsx**

工作量较大，建议先在 dict-en.ts 把所有 key 写齐，再去文件里逐处替换。可以多次保存观察 TS 错误（缺 key 会编译失败）。

- [ ] **Step 5: 编译 + EN 回归 + 中文回归**

```bash
cd frontend && npm run build
```

浏览器：
- EN：界面与改前完全一致
- 中文：标签、参数描述、错误提示都已翻译；流式发送一条简单请求确认 UI 行为未坏
- API key、模型 ID、JSON 输出、curl 示例**保持英文**

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/i18n/dict-en.ts frontend/src/lib/i18n/dict-zh.ts frontend/src/pages/playground.tsx
git commit -m "feat(i18n): translate playground"
```

---

## Task 10: models.tsx

**Files:**
- Modify: `frontend/src/lib/i18n/dict-en.ts`
- Modify: `frontend/src/lib/i18n/dict-zh.ts`
- Modify: `frontend/src/pages/models.tsx`

- [ ] **Step 1: 读页面**

```bash
cd frontend && cat src/pages/models.tsx
```

- [ ] **Step 2-3: 追加 `models` namespace（用户侧模型目录页）**

预期文案：标题/副标题、表格列（Name / Provider / Type / Context / Input price / Output price / Cache price / Status）、`Visible` / `Hidden`、`Active` / `Disabled`。

翻译要点：
- 表格列保持紧凑：`Context → 上下文`、`Input → 输入`、`Output → 输出`、`Cache → 缓存`、`Price → 单价`
- 单位 `$/1M tokens` 保留
- 模型 `public_name` 保留英文
- `Provider` 在列名译为"服务商"
- `Type` 译为"类型"；类型值（`chat` / `image` / `video` / `embedding`）保留英文枚举

- [ ] **Step 4: 改 models.tsx**

- [ ] **Step 5: 编译 + EN/中文回归**

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/i18n/dict-en.ts frontend/src/lib/i18n/dict-zh.ts frontend/src/pages/models.tsx
git commit -m "feat(i18n): translate models page"
```

---

## Task 11: billing.tsx

**Files:**
- Modify: `frontend/src/lib/i18n/dict-en.ts`
- Modify: `frontend/src/lib/i18n/dict-zh.ts`
- Modify: `frontend/src/pages/billing.tsx`

- [ ] **Step 1: 读页面**

```bash
cd frontend && cat src/pages/billing.tsx
```

- [ ] **Step 2-3: 追加 `billing` namespace**

预期：Balance、Monthly limit、Reserved（预占）、Spend this month、Top-up history、表格列。

翻译要点（**spec §5.3 硬约束**：金额、上限、预占措辞必须让用户准确理解扣费规则）：
- `Balance → 余额`
- `Monthly limit → 本月上限`
- `Reserved → 已预占`（不要写"预留"或"占用"——和后端 reservation 概念对齐）
- `Spend this month → 本月花费`
- `Top-up → 充值`、`Adjustment → 调整`
- `Refund → 退款`
- 提示句完整翻译，例如 `"Pre-authorization holds an upper-bound estimate against your monthly cap; the difference is released after each request."` 必须保留"预扣上限估算"、"差额会在请求结束后释放"两层意思

- [ ] **Step 4: 改 billing.tsx**

- [ ] **Step 5: 编译 + EN/中文回归**

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/i18n/dict-en.ts frontend/src/lib/i18n/dict-zh.ts frontend/src/pages/billing.tsx
git commit -m "feat(i18n): translate billing page"
```

---

## Task 12: generations.tsx

**Files:**
- Modify: `frontend/src/lib/i18n/dict-en.ts`
- Modify: `frontend/src/lib/i18n/dict-zh.ts`
- Modify: `frontend/src/pages/generations.tsx`

- [ ] **Step 1: 读页面**

```bash
cd frontend && cat src/pages/generations.tsx
```

- [ ] **Step 2-3: 追加 `generations` namespace**

异步图像 / 视频任务列表。预期：标题、表格列（Task ID / Model / Type / Status / Cost / Started / Finished / Assets）、状态枚举、refresh 按钮。

翻译要点：
- `Task ID` 保留英文
- 状态枚举（`queued / running / succeeded / failed`）—— **字段值保留英文**，但筛选器 label "状态"译中文
- `Started / Finished → 开始时间 / 结束时间`
- `Assets → 产物` 或保留 `Assets`——译"产物"

- [ ] **Step 4: 改 generations.tsx**

- [ ] **Step 5: 编译 + EN/中文回归**

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/i18n/dict-en.ts frontend/src/lib/i18n/dict-zh.ts frontend/src/pages/generations.tsx
git commit -m "feat(i18n): translate generations page"
```

---

## Task 13: docs.tsx（仅 H1/H2 + intro 段）

**Files:**
- Modify: `frontend/src/lib/i18n/dict-en.ts`
- Modify: `frontend/src/lib/i18n/dict-zh.ts`
- Modify: `frontend/src/pages/docs.tsx`

Spec §10 明确：本次只翻 docs 的页面 chrome + intro，**正文段落不在本次范围**。

- [ ] **Step 1: 读页面，识别结构**

```bash
cd frontend && cat src/pages/docs.tsx
```

把页面里所有 `<h1>` / `<h2>` 列出来；找到 intro 段（通常是 H1 后第一段 `<p>`）。

- [ ] **Step 2-3: 追加 `docs` namespace**

只为 H1 / H2 / intro 段 / tab 标签 / "Copy curl" 类按钮 加 key。代码块 `<pre>` / `<code>` 不动。

翻译要点：
- `Quickstart → 快速开始`
- `Authentication → 认证`
- `Endpoints → 端点`
- `Chat Completions → Chat Completions`（API 名保留）
- `Messages (Anthropic) → Messages (Anthropic)`（保留）
- `Images / Videos / Tasks → 图像 / 视频 / 任务`
- intro 段如有"OpenAI-compatible gateway"措辞，译"OpenAI 兼容网关"

- [ ] **Step 4: 改 docs.tsx**

仅替换 H1 / H2 / intro / tab / 顶层按钮。**代码块、curl 示例、JSON 示例不动**。

- [ ] **Step 5: 编译 + EN/中文回归**

浏览器：进 docs 页，确认两语言下结构标题和 intro 已翻译，**正文段落允许仍是英文**（不在本次 scope）。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/i18n/dict-en.ts frontend/src/lib/i18n/dict-zh.ts frontend/src/pages/docs.tsx
git commit -m "feat(i18n): translate docs page chrome (H1/H2 + intro)"
```

---

## Task 14: admin/overview.tsx

**Files:**
- Modify: `frontend/src/lib/i18n/dict-en.ts`
- Modify: `frontend/src/lib/i18n/dict-zh.ts`
- Modify: `frontend/src/pages/admin/overview.tsx`

- [ ] **Step 1: 读页面**

```bash
cd frontend && cat src/pages/admin/overview.tsx
```

- [ ] **Step 2-3: 追加 `admin.overview` namespace**

按 spec §4.4 命名约定：`admin.overview.title` 等。预期：总览 KPI（Total users / Active users / Spend MTD / Requests MTD）、最近活动。

- [ ] **Step 4: 改文件**

- [ ] **Step 5: 编译 + EN/中文回归**

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/i18n/dict-en.ts frontend/src/lib/i18n/dict-zh.ts frontend/src/pages/admin/overview.tsx
git commit -m "feat(i18n): translate admin overview"
```

---

## Task 15: admin/users.tsx

**Files:**
- Modify: `frontend/src/lib/i18n/dict-en.ts`
- Modify: `frontend/src/lib/i18n/dict-zh.ts`
- Modify: `frontend/src/pages/admin/users.tsx`

- [ ] **Step 1: 读页面**

```bash
cd frontend && cat src/pages/admin/users.tsx
```

- [ ] **Step 2-3: 追加 `admin.users` namespace**

预期：用户列表、Create user 对话框、Recharge / Adjust 对话框（**金额相关，严格按 spec §5.3 完整翻译**）、Disable / Enable / Promote / Demote 操作、审计相关字段。

翻译要点：
- `Recharge → 充值`、`Adjust → 调整`
- `Adjustment reason → 调整原因`（**必填字段说明不可省略**）
- `Disabled → 已禁用`、`Active → 已启用`
- `Admin / User` 角色枚举值保留英文（但 label "角色"译中文）
- `Reset password → 重置密码`
- 充值/调整提示句完整翻译，例如：`"Adjustments are recorded in the audit log and cannot be reverted by the user."` 译为 `"调整会记录到审计日志中，用户无法自行撤销。"`

- [ ] **Step 4: 改文件**

- [ ] **Step 5: 编译 + EN/中文回归**

充值/调整对话框是高风险操作，**手动**核对每个标签和提示语在中文下都清晰准确。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/i18n/dict-en.ts frontend/src/lib/i18n/dict-zh.ts frontend/src/pages/admin/users.tsx
git commit -m "feat(i18n): translate admin users page"
```

---

## Task 16: admin/models.tsx

**Files:**
- Modify: `frontend/src/lib/i18n/dict-en.ts`
- Modify: `frontend/src/lib/i18n/dict-zh.ts`
- Modify: `frontend/src/pages/admin/models.tsx`

455 行，admin 页中最大。包含模型 CRUD、定价编辑、可见性、TPM / 并发上限编辑、Cache 定价等。

- [ ] **Step 1: 读页面**

```bash
cd frontend && cat src/pages/admin/models.tsx
```

- [ ] **Step 2-3: 追加 `admin.models` namespace**

预期：标题、Create model 对话框、Edit model 对话框（定价、Cache 定价、max_input_tokens、TPM、concurrency limit、capabilities）、可见性 toggle、删除确认。

翻译要点：
- `Public name` → `公开名称`；提示文案：`"This is the name clients use in the API."` 译完整 — `"客户端在调用 API 时使用这个名称。"`
- `Upstream name` → `上游名称`；`"The name sent to the provider on the wire."` 译完整 — `"实际发送给服务商的模型名。"`
- 定价字段 `input_price_per_1m / output_price_per_1m / cache_*_price_per_1m` 保留英文 label 还是译？建议 label 译"输入价 / 输出价 / 缓存写入价 / 缓存读取价"，**单位 `$/1M tokens` 保留**
- `max_input_tokens` 字段名保留英文（这是 DB 列），label "最大输入 tokens"
- `TPM (tokens/min) → TPM（tokens/分钟）`；`Concurrency limit → 并发上限`
- 提示句不可省略，例如 capabilities JSON 编辑区的格式提示

- [ ] **Step 4: 改文件**

工作量大，分批提交也可以；但本 Task 力求一次完成。

- [ ] **Step 5: 编译 + EN/中文回归**

逐个对话框（Create / Edit）核对。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/i18n/dict-en.ts frontend/src/lib/i18n/dict-zh.ts frontend/src/pages/admin/models.tsx
git commit -m "feat(i18n): translate admin models page"
```

---

## Task 17: admin/providers.tsx

**Files:**
- Modify: `frontend/src/lib/i18n/dict-en.ts`
- Modify: `frontend/src/lib/i18n/dict-zh.ts`
- Modify: `frontend/src/pages/admin/providers.tsx`

- [ ] **Step 1: 读页面**

```bash
cd frontend && cat src/pages/admin/providers.tsx
```

- [ ] **Step 2-3: 追加 `admin.providers` namespace**

预期：服务商列表、新增/编辑（Base URL / API key / Enabled）。

翻译要点：
- `Base URL` 保留英文
- `Provider key → 服务商 API Key`（这里 API Key 是 Provider 那侧的）
- `Enabled / Disabled → 启用 / 禁用`
- 提示："API key is write-only; existing value is masked" 译完整：`"API Key 仅可写入；现有值会被掩码遮蔽，无法读取。"`

- [ ] **Step 4: 改文件**

- [ ] **Step 5: 编译 + EN/中文回归**

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/i18n/dict-en.ts frontend/src/lib/i18n/dict-zh.ts frontend/src/pages/admin/providers.tsx
git commit -m "feat(i18n): translate admin providers page"
```

---

## Task 18: admin/logs.tsx

**Files:**
- Modify: `frontend/src/lib/i18n/dict-en.ts`
- Modify: `frontend/src/lib/i18n/dict-zh.ts`
- Modify: `frontend/src/pages/admin/logs.tsx`

- [ ] **Step 1: 读页面**

```bash
cd frontend && cat src/pages/admin/logs.tsx
```

- [ ] **Step 2-3: 追加 `admin.logs` namespace**

注意：和 usage-logs 不同——admin/logs 是全局所有用户的请求日志。drawer 共用 `logDrawer`（Task 8 已加），所以本 Task 只补 admin/logs 页面自己的 chrome。

预期：标题、副标题（"All requests across all users."）、筛选器（用户、模型、状态、时间范围）、表格列（多一列 `User`）。

- [ ] **Step 4: 改文件**

- [ ] **Step 5: 编译 + EN/中文回归**

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/i18n/dict-en.ts frontend/src/lib/i18n/dict-zh.ts frontend/src/pages/admin/logs.tsx
git commit -m "feat(i18n): translate admin logs page"
```

---

## Task 19: 收尾扫描 + 最终验证

**Files:**
- 可能需要 Modify: 任一遗漏的页面 / 组件

- [ ] **Step 1: grep 残留英文 UI 字符串**

```bash
cd frontend && grep -rnE ">[ ]*[A-Z][a-zA-Z ]{2,}<" src/pages/ src/components/ | grep -v -E "(t\(|\\{t\(|=\"|\\| |Icon|/\\* )"
```

期望输出：尽量空。命中的项要么：
- 是技术名词（API Key / JWT / RPM 等）—— OK
- 是 Relay / MVP 品牌 —— OK
- 是模型名 / Provider 名 —— OK
- 是代码块内容 —— OK
- 否则就是遗漏，回去补字典 + 替换

- [ ] **Step 2: grep 中文是否被意外硬编码（防止有人没走字典直接写中文）**

```bash
cd frontend && grep -rn "[一-鿿]" src/pages/ src/components/ | grep -v "dict-zh"
```

期望输出：仅在 dict-zh.ts 命中。其他文件不应有中文字符。

- [ ] **Step 3: 类型一致性最终检查**

```bash
cd frontend && npm run build
```

Expected: 干净通过，无 warning。

- [ ] **Step 4: 浏览器完整回归**

启动 dev：
```bash
cd frontend && npm run dev
```

依次进入：
1. login（未登录）→ 切语言 → 登录
2. dashboard
3. api-keys（创建、揭示密钥确认提示完整）
4. usage-logs（点开 drawer）
5. playground（试发请求确认功能未坏）
6. models
7. billing
8. generations
9. docs（H1/H2 + intro 已翻译；正文段落可英文）
10. admin/overview
11. admin/users（充值/调整对话框，金额提示完整）
12. admin/models（创建/编辑对话框）
13. admin/providers
14. admin/logs（点开 drawer）

每一页都切 EN ↔ 中文，要求：
- EN 与改造前视觉一致
- 中文除 spec §5.1 保留项外无英文残留
- 刷新 / 关闭 tab 再打开，语言记忆生效
- 切换 EN ↔ 中文不需要刷新

- [ ] **Step 5: 如有遗漏，补字典 + 替换，再走 Step 1-4**

- [ ] **Step 6: 最终 Commit（如有补漏）**

```bash
git add -p   # 选择性 stage 本次补漏
git commit -m "chore(i18n): pick up stray strings missed during page passes"
```

如果 Step 1 直接干净通过，跳过此 Step。

---

## Self-Review

**Spec coverage**

- §2 方案（手写 Context + dict）→ Task 1
- §4.1 目录结构 → Task 1 (lib/i18n/) + Task 2 (LanguageSwitcher)
- §4.2 LanguageProvider 注入 + 初始 lang 检测 → Task 1 (Provider) + Task 3 (main.tsx)
- §4.3 useT / useLang API + 类型推导 TKey → Task 1
- §4.4 字典 namespace 划分 → Tasks 1, 5-18 各取所需
- §5.1 保留英文清单 → 每个 Task 的"翻译要点"都重复提示，并在 Task 19 grep 时识别
- §5.2 翻译口径（不直译、Playground 沿用英文等）→ Tasks 6-18 的翻译要点
- §5.3 硬约束（金额/上限不可省略）→ Task 7 (api-keys 安全提示)、Task 11 (billing)、Task 15 (admin users 调整)、Task 17 (providers API key 提示)
- §6 切换器 UI → Task 2 + 在 Task 4 (shell) / Task 5 (login) 嵌入
- §7 实施顺序 → Tasks 1-19 顺序
- §9 验收 → Task 19 全量回归

**Placeholder scan**

- 无 "TBD"、"implement later"
- 每个文件改动都有具体步骤
- Tasks 6-18 的"识别 UI 文案 → 加 key → 翻译 → 替换"模式重复但完整；没有写 "Similar to Task N"
- 唯一灵活之处：Tasks 6-18 没有把每个页面的字符串清单逐个列出（那会让计划文档变成几千行重复），而是给出**命名规范**和**翻译要点**——这是合理 trade-off，因为：
  - 执行者会先 read 文件再加 key，文件本身就是清单
  - 翻译要点保证 §5 的口径不被忽略

**Type consistency**

- `Lang = "en" | "zh"` 全程一致
- `TKey` 来自 `PathOf<EnDict>`，所有 `t(...)` 调用受同一类型约束
- `LanguageProvider` / `useT` / `useLang` 命名贯穿
- `LanguageSwitcher` 在 Task 2 定义、Task 4/5 消费，命名一致

**风险防控**

- Task 19 的两个 grep（残留英文、误硬编码中文）防遗漏
- 每个 Task 都有"EN 视觉回归"环节，防止抽 en 字典时改坏原文
- 充值/调整/密钥揭示等高风险提示在 Task 7/11/15/17 显式要求"提示不可省略"

无需修订，可执行。
