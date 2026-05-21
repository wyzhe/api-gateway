# 黑白模式切换 + 暗色对比度修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 Relay 前端加上跟随系统的亮 / 暗主题切换，并修复暗色主题（重点是侧边栏）的对比度。

**Architecture:** 纯前端改动。CSS 用 `:root` 承载亮色 token、`.dark` 承载暗色 token（对齐 Tailwind 约定）。一段 `public/` 下的外部启动脚本在首次绘制前按 `localStorage` + 系统偏好给 `<html>` 定 `.dark` 类（避免闪烁、绕开 CSP 对内联脚本的拦截）。运行时由手写的 `ThemeProvider` / `useTheme` 管理偏好（`system | light | dark`），三态 `ThemeSwitcher` 控件接入侧边栏 Popover 与落地页头部。后端、计费、鉴权零改动。

**Tech Stack:** React 19 + TypeScript（strict）、Tailwind v4（`@theme inline`）、Vite、sonner（toast）。

设计依据：`docs/superpowers/specs/2026-05-21-theme-toggle-design.md`

**全局约定**
- 所有命令在仓库根目录 `/Users/guzhe/Desktop/vibe-coding-app/api-gateway/llm-api-gateway` 下执行；前端命令需 `cd frontend`。
- 每个任务结束跑 `cd frontend && npm run build`（即 `tsc -b && vite build`）作为验证关卡——TypeScript strict、`noImplicitAny`，类型错误会让 build 失败。
- 本仓库前端无单元测试框架（约定是 `tsc -b` + `npm run build` + 人工核对），故本计划用「构建通过 + 浏览器核对」作为验证手段，不引入测试框架（避免范围蔓延）。
- 颜色 hex 值标注为「起始值」的，在 Task 8 用浏览器逐一微调；其余值照搬。

---

### Task 1: CSS token 重构 —— `:root` 亮色 / `.dark` 暗色 + 暗色对比度修复

把当前堆在 `:root` 的暗色 token 拆成：`:root` = 亮色、`.dark` = 暗色（含对比度修复），派生 token 单独放共享块。改完后 app 仍带 `<html class="dark">`，照常渲染暗色（值已是修复后的）。

**Files:**
- Modify: `frontend/src/index.css:6-52`（替换 `:root { … }` 整块）

- [ ] **Step 1: 替换 `index.css` 的 token 定义块**

打开 `frontend/src/index.css`，把第 6–52 行（注释 `/* Relay design tokens … */` 加整个 `:root { … }` 块）整体替换为下面内容。**只替换这一块**——第 1–5 行（`@import` 与 `@custom-variant dark`）保持不动，`@theme inline`、`@layer base`、`@layer components` 三块保持不动。

```css
/* Relay design tokens.
   :root = light theme. .dark = dark theme. The active theme is decided before
   first paint by public/theme-boot.js (follows the OS by default) and is kept
   in sync at runtime by ThemeProvider (src/lib/theme.tsx). */
:root {
  --background: #f6f7f8;
  --surface: #ffffff;
  --surface-2: #f0f1f3;
  --surface-3: #e7e9ec;
  --border: #e3e5e9;
  --border-strong: #cbcfd5;
  --border-soft: #eef0f2;

  --foreground: #1a1c1f;
  --muted-foreground: #585d66;
  --faint: #868c95;
  --dim: #a9aeb6;

  --accent: #2f9e44;
  --accent-dim: #248236;
  --accent-foreground: #ffffff;

  --success: #2f9e44;
  --warn: #b0750f;
  --danger: #d33d3d;
  --info: #2873c8;

  --openai: #10a37f;
  --anthropic: #d97757;
  --gemini: #5b8def;
  --xai: #6b7280;
  --veo: #c084fc;
  --apimart: #2f9e44;
  --deepseek: #4d6bfe;

  --radius: 8px;
}

.dark {
  --background: #0a0b0d;
  --surface: #111316;
  --surface-2: #16191d;
  --surface-3: #1b1e23;
  --border: #2b2f35;
  --border-strong: #2e3239;
  --border-soft: #1b1e22;

  --foreground: #eceef1;
  --muted-foreground: #a2a9b4;
  --faint: #6c727c;
  --dim: #565c64;

  --accent: #7be38b;
  --accent-dim: #4f9e5c;
  --accent-foreground: #0a0b0d;

  --success: #4ade80;
  --warn: #f5b544;
  --danger: #f87171;
  --info: #7ab7ff;

  --xai: #b8b8b8;
  --apimart: #7be38b;
}

/* Derived tokens — reference the base tokens above. Declared for both themes
   in one block so each var() resolves against the active theme's base values. */
:root,
.dark {
  --card: var(--surface);
  --card-foreground: var(--foreground);
  --popover: var(--surface-2);
  --popover-foreground: var(--foreground);
  --primary: var(--accent);
  --primary-foreground: var(--accent-foreground);
  --secondary: var(--surface-3);
  --secondary-foreground: var(--foreground);
  --muted: var(--surface-2);
  --destructive: var(--danger);
  --ring: var(--accent);
  --input: var(--surface-3);
}
```

说明：
- `.dark` 只重定义**有差异**的 token。`--openai/--anthropic/--gemini/--veo/--deepseek` 两套主题相同，只在 `:root` 定义；`--xai`、`--apimart` 在暗色有差异，故 `.dark` 覆盖。
- `--radius` 是常量，只在 `:root` 定义即可（无 `var()`，正常继承）。
- 派生 token 放 `:root, .dark` 共享块——它们的值含 `var()`，写在同时命中亮 / 暗根元素的选择器里，`var()` 才能按当前主题解析。
- 暗色对比度修复已包含在 `.dark` 块：`--muted-foreground` `#9097a1→#a2a9b4`、`--faint` `#5c636d→#6c727c`、`--dim` `#43484f→#565c64`、`--border` `#23262b→#2b2f35`。

- [ ] **Step 2: 构建验证**

Run: `cd frontend && npm run build`
Expected: 构建成功，无 TypeScript / CSS 错误。

- [ ] **Step 3: 浏览器核对暗色仍正常**

Run: `cd frontend && npm run dev`
打开 Vite 提示的地址（默认 `http://localhost:5173`）。此时 `index.html` 仍写死 `class="dark"`，页面应照常渲染**暗色**，且对比度较修复前略有提升（侧边栏后续 Task 7 再专项处理）。
可选：在浏览器 DevTools 里手动删掉 `<html>` 的 `dark` 类，确认页面切到亮色且无破色——这是亮色 `:root` 的首次目检。核对完把 `dark` 类加回。
停止 dev server（Ctrl+C）。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/index.css
git commit -m "$(cat <<'EOF'
Restructure CSS tokens into light :root + dark .dark

Move the dark palette into a .dark block and add a light palette in
:root, following the standard Tailwind dark-class convention. Includes
a modest dark-theme contrast bump (muted-foreground, faint, dim, border).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 防闪烁启动脚本

新增一个外部启动脚本，在首次绘制前按 `localStorage["theme"]` + 系统偏好给 `<html>` 加 / 去 `dark` 类。用外部文件而非内联脚本，是为了在后端 CSP `script-src 'self'`（见 `backend/app/main.py:100`）下被放行。

**Files:**
- Create: `frontend/public/theme-boot.js`
- Modify: `frontend/index.html`（`<head>` 内加一行 `<script>`）

- [ ] **Step 1: 创建启动脚本**

创建 `frontend/public/theme-boot.js`：

```js
// Runs before first paint. Sets the .dark class on <html> from the stored
// theme preference, falling back to the OS color-scheme. Keep this logic in
// sync with resolveTheme() in src/lib/theme.tsx.
(function () {
  try {
    var pref = localStorage.getItem("theme"); // "system" | "light" | "dark" | null
    var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var dark = pref === "dark" || ((pref === "system" || !pref) && systemDark);
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {
    /* localStorage / matchMedia unavailable — keep the class as authored in index.html */
  }
})();
```

- [ ] **Step 2: 在 `index.html` 引入脚本**

打开 `frontend/index.html`，在 `<head>` 内 `<meta name="viewport" … />` 那一行的**下一行**插入：

```html
    <script src="/theme-boot.js"></script>
```

放在这里是为了让它在样式表和字体加载之前同步执行（阻塞解析、先于首次绘制）。`<html lang="en" class="dark">` 的 `class="dark"` **保留**——作为禁用 JS 时的兜底默认（产品默认暗色）。

- [ ] **Step 3: 构建验证**

Run: `cd frontend && npm run build`
Expected: 构建成功。确认 `dist/theme-boot.js` 存在（Vite 把 `public/` 原样拷到 dist 根）：
Run: `ls frontend/dist/theme-boot.js`
Expected: 文件存在。

- [ ] **Step 4: 浏览器核对跟随系统**

Run: `cd frontend && npm run dev`
打开页面。把操作系统切到「浅色外观」并清掉站点的 `localStorage`（DevTools → Application → Local Storage 删 `theme` 键，或本就没有），刷新——页面应渲染**亮色**。把系统切回「深色外观」刷新——应渲染**暗色**。DevTools Console 应无 CSP 报错。
停止 dev server。

- [ ] **Step 5: 提交**

```bash
git add frontend/public/theme-boot.js frontend/index.html
git commit -m "$(cat <<'EOF'
Add pre-paint theme boot script

External script (CSP-friendly under script-src 'self') sets the .dark
class on <html> from the stored preference / OS color-scheme before
first paint, preventing a theme flash.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: ThemeProvider / useTheme

新增运行时主题状态模块，结构对照 `src/lib/i18n/index.tsx` 的 `LanguageProvider`。

**Files:**
- Create: `frontend/src/lib/theme.tsx`

- [ ] **Step 1: 创建 `theme.tsx`**

创建 `frontend/src/lib/theme.tsx`：

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

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "theme";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "system" || stored === "light" || stored === "dark") {
    return stored;
  }
  return "system";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia(MEDIA_QUERY).matches;
}

// Keep this in sync with public/theme-boot.js.
function resolveTheme(pref: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (pref === "light") return "light";
  if (pref === "dark") return "dark";
  return systemDark ? "dark" : "light";
}

type Ctx = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (p: ThemePreference) => void;
};

const ThemeContext = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] =
    useState<ThemePreference>(readStoredPreference);
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);

  // Track the OS color-scheme so preference="system" stays live.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(MEDIA_QUERY);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const resolved = resolveTheme(preference, systemDark);

  // Apply the resolved theme to <html>.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable — the choice just won't survive a reload.
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
```

- [ ] **Step 2: 构建验证**

Run: `cd frontend && npm run build`
Expected: 构建成功。（此时 `theme.tsx` 还未被任何文件 import；Vite 不会报未用模块错误，`tsc -b` 也通过。）

- [ ] **Step 3: 提交**

```bash
git add frontend/src/lib/theme.tsx
git commit -m "$(cat <<'EOF'
Add ThemeProvider / useTheme

Runtime theme state mirroring the i18n LanguageProvider: preference
(system|light|dark) persisted to localStorage, resolved theme applied
to <html>, live OS color-scheme tracking when preference is "system".

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 接入 ThemeProvider + 主题感知的 Toaster

把 `ThemeProvider` 挂到 app 根；`sonner` 的 `Toaster` 当前写死 `theme="dark"`，抽成读 `useTheme()` 的小组件。

**Files:**
- Create: `frontend/src/components/themed-toaster.tsx`
- Modify: `frontend/src/main.tsx`（整文件替换）

- [ ] **Step 1: 创建 `themed-toaster.tsx`**

创建 `frontend/src/components/themed-toaster.tsx`：

```tsx
import { Toaster } from "sonner";
import { useTheme } from "@/lib/theme";

/** sonner Toaster that follows the active Relay theme. */
export function ThemedToaster() {
  const { resolved } = useTheme();
  return (
    <Toaster
      theme={resolved}
      richColors
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "bg-surface-2 border border-border text-foreground",
        },
      }}
    />
  );
}
```

- [ ] **Step 2: 替换 `main.tsx`**

把 `frontend/src/main.tsx` 整个文件替换为：

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import { ThemedToaster } from "./components/themed-toaster";
import { AuthProvider } from "./lib/auth";
import { LanguageProvider } from "./lib/i18n";
import { ThemeProvider } from "./lib/theme";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <BrowserRouter>
          <AuthProvider>
            <App />
            <ThemedToaster />
          </AuthProvider>
        </BrowserRouter>
      </LanguageProvider>
    </ThemeProvider>
  </StrictMode>,
);
```

- [ ] **Step 3: 构建验证**

Run: `cd frontend && npm run build`
Expected: 构建成功。

- [ ] **Step 4: 浏览器核对**

Run: `cd frontend && npm run dev`
页面正常加载、toast 正常（可触发一次任意 toast，如复制操作）。在 DevTools Console 跑 `localStorage.setItem('theme','light'); location.reload()` —— 页面应切亮色；再 `localStorage.setItem('theme','dark'); location.reload()` —— 切回暗色。改回 `localStorage.removeItem('theme')`。
停止 dev server。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/themed-toaster.tsx frontend/src/main.tsx
git commit -m "$(cat <<'EOF'
Wire ThemeProvider into the app root

Mount ThemeProvider at the top of the tree and replace the hardcoded
Toaster theme="dark" with a ThemedToaster that follows the active theme.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: i18n 文案 + ThemeSwitcher 组件

加切换器需要的 i18n key（两套字典同步，否则 `EnDict` 类型报错），再写三态 `ThemeSwitcher`，结构对照 `language-switcher.tsx`。

**Files:**
- Modify: `frontend/src/lib/i18n/dict-en.ts`（`nav` 块内 + `nav` 块后）
- Modify: `frontend/src/lib/i18n/dict-zh.ts`（`nav` 块内 + `nav` 块后）
- Create: `frontend/src/components/theme-switcher.tsx`

- [ ] **Step 1: dict-en.ts —— 在 `nav` 块加 `theme` 标签，并在 `nav` 块后加 `theme` 段**

`dict-en.ts` 里 `nav` 块当前最后两行是：

```ts
    language: "Language",
  },
```

替换为：

```ts
    language: "Language",
    theme: "Theme",
  },
  theme: {
    system: "System",
    light: "Light",
    dark: "Dark",
  },
```

- [ ] **Step 2: dict-zh.ts —— 同步**

`dict-zh.ts` 里 `nav` 块当前最后两行是：

```ts
    language: "语言",
  },
```

替换为：

```ts
    language: "语言",
    theme: "主题",
  },
  theme: {
    system: "系统",
    light: "亮色",
    dark: "暗色",
  },
```

- [ ] **Step 3: 创建 `theme-switcher.tsx`**

创建 `frontend/src/components/theme-switcher.tsx`：

```tsx
import { Fragment } from "react";
import { useT, type TKey } from "@/lib/i18n";
import type { ThemePreference } from "@/lib/theme";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: ReadonlyArray<readonly [ThemePreference, TKey]> = [
  ["system", "theme.system"],
  ["light", "theme.light"],
  ["dark", "theme.dark"],
];

export function ThemeSwitcher({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  const t = useT();
  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-[11px]",
        className,
      )}
      role="group"
      aria-label={t("nav.theme")}
    >
      {OPTIONS.map(([value, key], i) => (
        <Fragment key={value}>
          {i > 0 && (
            <span className="text-faint" aria-hidden>
              ·
            </span>
          )}
          <button
            type="button"
            onClick={() => setPreference(value)}
            aria-pressed={preference === value}
            className={cn(
              "whitespace-nowrap transition-colors px-0.5 rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              preference === value
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(key)}
          </button>
        </Fragment>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: 构建验证**

Run: `cd frontend && npm run build`
Expected: 构建成功。若 dict-zh 漏 key，`tsc -b` 会在 `dict-zh.ts` 处报类型错误——补齐即可。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/i18n/dict-en.ts frontend/src/lib/i18n/dict-zh.ts frontend/src/components/theme-switcher.tsx
git commit -m "$(cat <<'EOF'
Add ThemeSwitcher component and i18n strings

Three-way system / light / dark switcher mirroring LanguageSwitcher,
plus the matching nav.theme + theme.* keys in both dictionaries.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 把 ThemeSwitcher 接入侧边栏 Popover 与落地页头部

**Files:**
- Modify: `frontend/src/components/shell.tsx`（import + 用户 Popover 内加「主题」行）
- Modify: `frontend/src/pages/landing.tsx`（import + 头部加切换器）

- [ ] **Step 1: shell.tsx —— 加 import**

`frontend/src/components/shell.tsx` 顶部，`import { LanguageSwitcher } from "@/components/language-switcher";` 那一行的下一行加：

```tsx
import { ThemeSwitcher } from "@/components/theme-switcher";
```

- [ ] **Step 2: shell.tsx —— Popover 内加「主题」行**

`shell.tsx` 用户 Popover 里当前有这段「语言」行：

```tsx
              <div className="flex items-center justify-between px-2 py-1.5 text-[13px] text-muted-foreground">
                <span>{t("nav.language")}</span>
                <LanguageSwitcher compact />
              </div>
```

在它**正上方**插入「主题」行，使其成为：

```tsx
              <div className="flex items-center justify-between px-2 py-1.5 text-[13px] text-muted-foreground">
                <span>{t("nav.theme")}</span>
                <ThemeSwitcher />
              </div>
              <div className="flex items-center justify-between px-2 py-1.5 text-[13px] text-muted-foreground">
                <span>{t("nav.language")}</span>
                <LanguageSwitcher compact />
              </div>
```

- [ ] **Step 3: landing.tsx —— 加 import**

`frontend/src/pages/landing.tsx` 顶部，`import { LanguageSwitcher } from "@/components/language-switcher";` 那一行的下一行加：

```tsx
import { ThemeSwitcher } from "@/components/theme-switcher";
```

- [ ] **Step 4: landing.tsx —— 头部加切换器**

`landing.tsx` 头部当前是：

```tsx
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <PrimaryCta className="min-w-[96px]" />
          </div>
```

替换为：

```tsx
          <div className="flex items-center gap-2">
            <ThemeSwitcher />
            <LanguageSwitcher />
            <PrimaryCta className="min-w-[96px]" />
          </div>
```

- [ ] **Step 5: 构建验证**

Run: `cd frontend && npm run build`
Expected: 构建成功。

- [ ] **Step 6: 浏览器核对切换功能**

Run: `cd frontend && npm run dev`
- 落地页头部应出现 `系统 · 亮 · 暗` 切换器；点「亮」→ 整页切亮色，点「暗」→ 切暗色，点「系统」→ 回到跟随系统。刷新后选择保持。
- 登录后，侧边栏左下角头像点开 Popover，应有「主题」行；切换即时生效。
停止 dev server。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/components/shell.tsx frontend/src/pages/landing.tsx
git commit -m "$(cat <<'EOF'
Wire ThemeSwitcher into the sidebar popover and landing header

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 暗色侧边栏对比度专项修复

用户反馈的核心问题。强化侧边栏面板边界，并提亮暗色下未选中导航项的文字。

**Files:**
- Modify: `frontend/src/components/shell.tsx`（`<aside>` 边框；`NavItemLink` 未选中态文字）

- [ ] **Step 1: 强化侧边栏右边界**

`shell.tsx` 里 `<aside>` 当前是：

```tsx
      <aside className="w-56 shrink-0 border-r border-border bg-surface flex flex-col">
```

把 `border-border` 改为 `border-border-strong`：

```tsx
      <aside className="w-56 shrink-0 border-r border-border-strong bg-surface flex flex-col">
```

- [ ] **Step 2: 提亮未选中导航项文字**

`shell.tsx` 底部 `NavItemLink` 函数里的 `className` 当前是：

```tsx
        cn(
          "relative flex items-center gap-2 px-2 py-1 rounded-md text-[13px]",
          isActive
            ? "bg-surface-2 text-foreground before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:bg-accent before:rounded-r-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-surface-2",
        )
```

把未选中分支的 `text-muted-foreground` 改为 `text-foreground/70`：

```tsx
        cn(
          "relative flex items-center gap-2 px-2 py-1 rounded-md text-[13px]",
          isActive
            ? "bg-surface-2 text-foreground before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:bg-accent before:rounded-r-sm"
            : "text-foreground/70 hover:text-foreground hover:bg-surface-2",
        )
```

说明：`text-foreground/70` 在暗色下（`foreground #eceef1` @70% 叠在 `surface #111316` 上）明显亮于原 `muted-foreground`，解决侧边栏发暗；在亮色下（`foreground #1a1c1f` @70%）接近 `muted-foreground` 的观感，不会过重。精确不透明度（70 / 75 / 80）在 Task 8 微调。`NavGroupLabel` 维持 `text-muted-foreground` 不变——已受 Task 1 的 token 提亮改善。

- [ ] **Step 3: 构建验证**

Run: `cd frontend && npm run build`
Expected: 构建成功。

- [ ] **Step 4: 浏览器核对**

Run: `cd frontend && npm run dev`
登录进工作台，暗色主题下侧边栏：面板右边界更清晰、未选中导航项明显比修复前易读、选中项（accent 竖条 + 高亮底）仍清楚。切到亮色确认侧边栏不过重、层次正常。
停止 dev server。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/shell.tsx
git commit -m "$(cat <<'EOF'
Improve dark-theme sidebar legibility

Strengthen the sidebar's right divider and brighten inactive nav item
text so the dark sidebar is easier to read.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 双主题跨页面视觉 QA + 取值微调

逐页在两套主题下核对，微调标注为「起始值」的颜色与侧边栏不透明度。

**Files:**
- 视核对结果可能 Modify: `frontend/src/index.css`、`frontend/src/components/shell.tsx`

- [ ] **Step 1: 起 dev server，逐页核对**

Run: `cd frontend && npm run dev`
在**亮色**与**暗色**下分别走查以下页面，逐一确认无不可读文字、无破色、层次清晰：
- 落地页 `/`
- 登录页 `/login`
- 仪表盘 `/dashboard`（KPI 条、图表、近期活动）
- API 密钥 `/keys`（表格、行内操作、创建弹窗）
- 用量日志 `/logs`（表格、日志详情抽屉 `LogDetailDrawer`）
- Playground `/playground`（输入区、流式生成态）
- 模型 `/models`、文档 `/docs`
- 管理后台 `/admin` 各页（总览、用户、模型、服务商、全部日志）
重点排查：状态点 `DotStatus`、徽章 `Badge`、`color-mix` 色调（`bg-success/10` 等）、`ProviderTag` 的彩色圆点（尤其亮色下的 `xai` 灰点）、弹窗 / 抽屉 / tooltip 的弹层。

- [ ] **Step 2: 按需微调取值**

如发现问题，在 `frontend/src/index.css` 调对应 token（亮色改 `:root`，暗色改 `.dark`），或在 `shell.tsx` 调侧边栏 `text-foreground/NN` 的不透明度。常见微调方向：
- 亮色页面太刺眼 → `:root` 的 `--background` 调更柔（如 `#f4f5f7`）。
- 亮色强调绿对比不足 → `:root` 的 `--accent` 调更深（如 `#2b8f3e`）。
- 暗色侧边栏仍偏暗 → `shell.tsx` 未选中项 `text-foreground/70` → `/78` 或 `/85`。
每次改完重跑 `npm run build` 并刷新核对。

- [ ] **Step 3: 防闪烁终检**

清掉 `localStorage` 的 `theme` 键，分别在系统浅色 / 深色下硬刷新页面（Cmd+Shift+R），确认**无主题闪烁**（不会先暗后亮或先亮后暗）。DevTools Console 确认无 CSP 相关报错。
停止 dev server。

- [ ] **Step 4: 构建验证**

Run: `cd frontend && npm run build`
Expected: 构建成功。

- [ ] **Step 5: 提交（若 Step 2 有改动）**

```bash
git add frontend/src/index.css frontend/src/components/shell.tsx
git commit -m "$(cat <<'EOF'
Tune theme palette values after cross-page QA

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

若 Step 2 没有任何改动，跳过本次提交。

---

### Task 9: 更新 DESIGN.md 与 CLAUDE.md

把"dark-only"的设计文档同步成双主题。

**Files:**
- Modify: `DESIGN.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: DESIGN.md —— 概述与定位**

`DESIGN.md` 顶部 frontmatter 的 `description` 与正文 `## Overview` 段中"dark-only operator console"的表述，改为说明现在支持亮 / 暗双主题、默认跟随系统、暗色仍是产品的主基调。保留"开发者工具、信息密度、终端气质"的定位描述。

- [ ] **Step 2: DESIGN.md —— Colors 段补充亮色**

在 `## Colors` 段补充：现有色板为暗色主题；新增亮色主题色板（照 `frontend/src/index.css` 里 `:root` 最终值列出 `background / surface / surface-2 / surface-3 / border / border-strong / foreground / muted-foreground / faint / dim / accent / accent-foreground / success / warn / danger / info / xai` 的亮色值）。补一条规则：颜色 token 分亮 / 暗两套，`:root` = 亮色、`.dark` = 暗色，组件仍只用 Tailwind 工具类 / CSS 变量，不写死 hex；`accent` 与 `accent-foreground` 成对取值随主题变化（亮色 `#2f9e44`+`#ffffff`，暗色 `#7be38b`+`#0a0b0d`）。

- [ ] **Step 3: DESIGN.md —— Components 段登记新组件**

在 `### Composite / shared` 表格加一行 `ThemeSwitcher` | `components/theme-switcher.tsx` | 三态 `系统 / 亮 / 暗` 主题切换器，位于侧边栏用户 Popover 与落地页头部，仿 `LanguageSwitcher`。
同时把 `LanguageSwitcher` 那一行的描述补一句它旁边现在还有 `ThemeSwitcher`（如有必要）。

- [ ] **Step 4: DESIGN.md —— 实现指针**

`## Implementation pointers` 段里"All tokens live in … under `:root`"更新为：token 分 `:root`（亮色）与 `.dark`（暗色）两块，派生 token 在 `:root, .dark` 共享块；新增 token 需同时在两套主题定义。

- [ ] **Step 5: CLAUDE.md —— 前端约定段**

`CLAUDE.md` 的「Frontend conventions」段里这句：

> Dark theme is the only theme. Tokens live in `src/index.css` under `:root` and are exported into Tailwind via `@theme inline`.

改为说明：支持亮 / 暗双主题，默认跟随系统（`prefers-color-scheme`）、可手动切换并持久化；token 在 `src/index.css` 分 `:root`（亮色）/ `.dark`（暗色），经 `@theme inline` 导出到 Tailwind；主题状态由 `src/lib/theme.tsx` 的 `ThemeProvider` / `useTheme` 管理，首屏由 `public/theme-boot.js` 防闪烁。

- [ ] **Step 6: 校对**

通读改动段落，确认无残留"dark-only / only theme"等过时表述，新旧描述不矛盾。

- [ ] **Step 7: 提交**

```bash
git add DESIGN.md CLAUDE.md
git commit -m "$(cat <<'EOF'
Document dual-theme support in DESIGN.md and CLAUDE.md

Update the design system docs from dark-only to light + dark with a
system-following default; add the light palette and the ThemeSwitcher.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 完成标准

- `cd frontend && npm run build` 通过，无类型错误、无 `any`。
- 切换器三态在落地页与侧边栏 Popover 均可用，选择持久化、刷新保持。
- 首次访问（无存储）跟随系统色彩；`preference=系统` 时系统切换实时跟随。
- 全站亮 / 暗两套主题均无不可读文字、无破色。
- 暗色侧边栏对比度较修复前明显改善。
- 刷新无主题闪烁，Console 无 CSP 报错。
- `DESIGN.md` / `CLAUDE.md` 已同步为双主题。
