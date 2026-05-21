# 黑白模式切换 + 暗色对比度修复 — 设计文档

日期：2026-05-21
状态：待评审

## 1. 背景与目标

Relay 前端目前是**刻意的 dark-only 操作台**（见 `DESIGN.md` 与 `CLAUDE.md` "Dark theme is the only theme"）。本次变更：

1. 新增**亮 / 暗主题切换**，默认**跟随系统**。
2. 修复当前暗色主题的对比度问题——**重点是侧边栏看不清**，其余区域小幅增强。

纯前端改动，不触碰后端、计费、鉴权任何逻辑。

## 2. 范围

- **覆盖**：全站——落地页、登录页、工作台所有页面、管理后台。半套主题会很跳，做就做全。
- **修复**：暗色主题的对比度。亮色主题作为新增配色一并交付。

## 3. 决策汇总

| 决策点 | 结论 | 理由 |
|---|---|---|
| 主题范围 | 全站 | 避免半套主题割裂 |
| 默认主题 | **跟随系统** `prefers-color-scheme`，无系统信号时回退暗色 | 用户要求；暗色是产品本色 |
| 切换控件形态 | 三态 `系统 · 亮 · 暗` | 跟随系统必须可重新选回；对齐 GitHub 等主流约定 |
| 持久化 | `localStorage` 的 `theme` 键，存 `system\|light\|dark` | 复用 i18n 的 `lang` 持久化模式 |
| 状态管理 | 手写 `ThemeProvider` + `useTheme`，仿 `LanguageProvider` | 不引第三方库，与 i18n 一致；CLAUDE.md 倾向不加依赖 |
| CSS 结构 | `:root` = 亮色，`.dark` = 暗色覆盖 | 对齐 Tailwind 标准 `.dark` 约定；仓库已有 `@custom-variant dark` 和 `<html class="dark">`，本就是为此预留 |
| 切换控件位置 | ① 侧边栏用户 Popover 内（语言行旁）② 落地页头部（语言切换器旁） | 复用既有控件聚集点 |
| 防闪烁 | `index.html` 内联 boot script，React 挂载前定主题 | 避免默认暗色应用闪白（反之亦然） |

> **对已批准方案的一处技术性细化**：评审对话里曾说"`:root` 保留暗色、`html.light` 作为 opt-in"。实现时改为 **`:root` = 亮色 / `.dark` = 暗色覆盖**——这是 Tailwind 的标准约定，且仓库 `index.html` 已有 `class="dark"`、`index.css` 已有 `@custom-variant dark`，本就是为这套约定预留的。用户可见行为完全不变（默认仍跟随系统、回退暗色），只是内部 CSS 组织方式更合规。

## 4. 架构设计

### 4.1 主题状态模型

两个概念分开：

- **preference（偏好）**：用户的选择，`"system" | "light" | "dark"`，持久化到 `localStorage["theme"]`。无值时视为 `"system"`。
- **resolved（生效主题）**：实际渲染的主题，`"light" | "dark"`。
  - `preference === "system"` → 读 `matchMedia("(prefers-color-scheme: dark)")`。
  - 否则 → 等于 preference。

`<html>` 上的 `.dark` 类由 resolved 决定。

### 4.2 ThemeProvider / useTheme

新建 `frontend/src/lib/theme.tsx`，结构对照 `lib/i18n/index.tsx`：

- `ThemeProvider`：持有 `preference` state；`useEffect` 把 resolved 写到 `document.documentElement.classList.toggle("dark", …)`；当 `preference === "system"` 时监听 `matchMedia` 的 `change` 事件，系统切换时实时跟随。
- `useTheme()` → `{ preference, resolved, setPreference }`。
- 初始 `preference` 读 `localStorage`；`setPreference` 同步写回（`try/catch`，失败静默，与 i18n 一致）。
- SSR 安全：`typeof window === "undefined"` 时回退 `"system"` / `"dark"`（与 i18n `detectInitialLang` 同款守卫）。

### 4.3 防闪烁 boot script

`frontend/index.html` 的 `<head>` 内、样式表之后加一段同步内联脚本：

```html
<script>
  (function () {
    try {
      var p = localStorage.getItem("theme");
      var sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      var dark = p === "dark" || ((p === "system" || !p) && sysDark);
      document.documentElement.classList.toggle("dark", dark);
    } catch (e) {}
  })();
</script>
```

`<html class="dark">` 保留作为无 JS 时的兜底（产品默认暗色）；boot script 在首次绘制前按真实偏好校正。该脚本与 `ThemeProvider` 的解析逻辑必须保持一致。

> 注意 CSP：项目对前端发严格 `Content-Security-Policy`，会拦截内联脚本（见 `CLAUDE.md` Playground 段）。两条出路，实现时择一：① 该脚本改为 `public/` 下的外部文件（如 `/theme-boot.js`），`<head>` 内 `<script src>` 同步引入，靠 `script-src 'self'` 放行——无需放宽 CSP，首选；② 保留内联并对其加 CSP hash。**实现前必须先查后端 CSP 头的实际配置与作用范围**，这是不可遗漏的待办点。

### 4.4 CSS token 结构（`frontend/src/index.css`）

- 保留 `@custom-variant dark (&:is(.dark *))`。
- `:root` 改为承载**亮色**基础 token。
- 新增 `.dark { … }` 承载**暗色**基础 token（即当前 `:root` 的值，并应用第 6 节的对比度修复）。
- **派生 token**（`--card`、`--popover`、`--primary`、`--secondary`、`--muted`、`--destructive`、`--ring`、`--input`、`--radius`、字体）只在 `:root` 定义一次——它们的值是 `var(--surface)` 这类引用，CSS 自定义属性惰性解析，会自动跟随当前主题，无需在 `.dark` 重复。
- `.dark` 只重定义**基础 token**：`background / surface / surface-2 / surface-3 / border / border-strong / border-soft / foreground / muted-foreground / faint / dim / accent / accent-dim / accent-foreground / success / warn / danger / info`，以及差异化的 provider 色 `xai`。
- `@theme inline` 块不变——它把 `--color-*` 映射到 `var(--*)`，对两套主题自动生效。

## 5. 亮色色板（`:root`）

以 Linear / Vercel / Stripe 亮色开发者工具为参照：页面浅灰、卡片纯白、靠边框与表面分层（不用阴影），单一绿色强调。下表为**最终实现值**（已经过 WCAG AA 对比度校验微调）；与 `frontend/src/index.css` 的 `:root` 块一致。

| Token | 亮色值 | 说明 |
|---|---|---|
| `--background` | `#f6f7f8` | 页面底——柔和浅灰，非纯白 |
| `--surface` | `#ffffff` | 卡片 / 侧边栏 / 弹层 |
| `--surface-2` | `#f0f1f3` | 行 hover、tab list、嵌套面板 |
| `--surface-3` | `#e7e9ec` | 输入框——最"凹"的编辑层 |
| `--border` | `#e3e5e9` | 通用发丝线 |
| `--border-strong` | `#cbcfd5` | 强调边框 |
| `--border-soft` | `#eef0f2` | 弱化边框 |
| `--foreground` | `#1a1c1f` | 正文 / 标题——近黑 |
| `--muted-foreground` | `#585d66` | 次要文字——确保白底可读 |
| `--faint` | `#868c95` | 提示 / 时间戳 |
| `--dim` | `#a9aeb6` | 极淡——占位、cancelled 终态 |
| `--accent` | `#1a7a2e` | 强调绿——白底需更深的绿（`#7be38b` 在白底不可读） |
| `--accent-dim` | `#145c22` | 强调绿暗调 |
| `--accent-foreground` | `#ffffff` | 叠在 accent 上的文字——亮色下为白 |
| `--success` | `#1a7a2e` | |
| `--warn` | `#9a6500` | 白底加深 |
| `--danger` | `#c02c2c` | |
| `--info` | `#1c60b0` | 白底加深 |
| `--xai` | `#6b7280` | provider 色覆盖——原 `#b8b8b8` 在白底不可见 |

其余 provider 品牌色（`openai / anthropic / gemini / veo / apimart / deepseek`）两套主题共用，定义在 `:root`，`.dark` 不覆盖。`accent` 与 `accent-foreground` 必须成对——亮色下是 `#1a7a2e` + `#ffffff`，暗色下是 `#7be38b` + `#0a0b0d`，DESIGN.md 的"accent 配 accent-foreground"规则不变，只是值随主题。

`color-mix` 派生的色调（`bg-success/10` 等）引用 `var(--token)`，自动随主题适配，无需改组件。

## 6. 暗色对比度修复（`.dark`）

### 6.1 全局小幅增强（"其余稍微增强一点"）

| Token | 现值 | 调整后（起始值） | 说明 |
|---|---|---|---|
| `--muted-foreground` | `#9097a1` | `#a2a9b4` | 次要文字小幅提亮 |
| `--faint` | `#5c636d` | `#6c727c` | 提示 / 时间戳提亮 |
| `--dim` | `#43484f` | `#565c64` | 极淡文字小幅提亮（仍保留"淡"的层级） |
| `--border` | `#23262b` | `#2b2f35` | 发丝线小幅加强 |

幅度克制，保持暗色气质。

### 6.2 侧边栏专项（重点，改 `components/shell.tsx`）

当前问题：侧边栏 `bg-surface (#111316)` 与页面 `background (#0a0b0d)` 仅靠 1px 极淡 border 区隔，且未选中导航项用 `text-muted-foreground`，整体偏暗难辨。

- **面板边界**：`<aside>` 的 `border-r border-border` → `border-r border-border-strong`，让侧边栏作为独立面板更清晰。
- **未选中导航项**（`NavItemLink` inactive）：文字从 `text-muted-foreground` 提到更亮档（`text-foreground/75` 一类），hover 仍到 `text-foreground`；选中态（accent 竖条 + `bg-surface-2` + `text-foreground`）已足够强，保持。
- **分组标签**（`NavGroupLabel`）：维持 `text-muted-foreground`，受 6.1 token 提亮已改善。

精确数值在实现阶段用浏览器预览逐一对照确定；本节给出方向与起始值。

## 7. ThemeSwitcher 组件

新建 `frontend/src/components/theme-switcher.tsx`，仿 `language-switcher.tsx`：

- 三态文字 pill：`系统 · 亮 · 暗`（用 `·` 分隔，与 `LanguageSwitcher` 一致）。
- 读 `useTheme()`，点击调 `setPreference`。
- `aria-pressed` 标记当前 preference；选中态 `text-foreground font-medium`，其余 `text-muted-foreground hover:text-foreground`；带 `transition-colors` 与 focus ring。
- 接受 `className`。**不引入 `LanguageSwitcher` 那种 `compact` 简写态**——主题三态标签（`系统 · 亮色 · 暗色` / `System · Light · Dark`）本就短，且英文无自然的超短缩写（不像 `中文→中`），硬加简写反而难看。侧边栏 Popover 行能否容纳全标签，在 Task 8 QA 用浏览器实际核对；若 EN 标签溢出再处理。
- 文案走 i18n，不硬编码。

## 8. 接入点

| 文件 | 改动 |
|---|---|
| `frontend/index.html` | 加 4.3 的 boot script；`<html class="dark">` 保留 |
| `frontend/src/main.tsx` | 在 `LanguageProvider` 外层（或相邻）包 `ThemeProvider`；`Toaster` 的写死 `theme="dark"` 改为读 `useTheme().resolved` |
| `frontend/src/lib/theme.tsx` | **新建**，`ThemeProvider` / `useTheme` |
| `frontend/src/components/theme-switcher.tsx` | **新建** |
| `frontend/src/components/shell.tsx` | 用户 Popover 内加"主题"行（仿"语言"行，放 `ThemeSwitcher`）；侧边栏对比度修复（第 6.2 节） |
| `frontend/src/pages/landing.tsx` | 头部 `LanguageSwitcher` 旁加 `ThemeSwitcher` |
| `frontend/src/index.css` | 第 4.4 + 5 + 6 节的 token 改造 |

`Toaster` 在 `main.tsx` 里直接渲染，无法直接用 hook——抽一个极小的 `ThemedToaster` 组件（调 `useTheme()` 传 `theme={resolved}`），或把 `Toaster` 下移到 `App` 内的 Provider 作用域中。实现时取其一。

## 9. i18n

`dict-en.ts` 与 `dict-zh.ts` 同步新增 key（`EnDict` 类型会让缺漏变成 TS 错误）：

- `nav.theme` — Popover 内"主题"行标签。
- `theme.system` / `theme.light` / `theme.dark` — 三态标签。
- 如需紧凑态短标签，另加 `theme.systemShort` 等。

## 10. 文档更新

- **`DESIGN.md`**：`description` 与 Overview 的 "dark-only" 改为双主题表述；Colors 节补充亮色色板与"两套主题如何取值"的规则；切换控件 / `ThemeSwitcher` 记入 Components。保持"代码与 DESIGN.md 冲突时改代码"的原则——本次是同步更新，不是事后补写。
- **`CLAUDE.md`**：前端约定段 "Dark theme is the only theme. Tokens live in `src/index.css` under `:root`…" 更新为：双主题，`:root` = 亮色 / `.dark` = 暗色，默认跟随系统。

## 11. 不在范围内

- 每页 / 每区域独立主题。
- 主题相关的第三方库（next-themes 等）。
- 后端、计费、鉴权、数据库任何改动。
- 主题之外的视觉重构（只做对比度修复，不重排版面）。
- 高对比度 / 护眼等额外主题——只有亮、暗两套。

## 12. 测试与验收

- `cd frontend && npm run build`（含 `tsc -b`）通过，无 `any`、无类型错误。
- 手测矩阵：
  - 首次访问（清 `localStorage`）：系统暗 → 应用暗；系统亮 → 应用亮。
  - 三态切换即时生效并持久化（刷新保持）。
  - `preference = 系统` 时，操作系统切换主题，页面实时跟随。
  - 全站抽查：落地页 / 登录 / 仪表盘 / 表格页 / 弹窗 / 管理后台在两套主题下均无不可读文字、无破色。
  - 刷新无主题闪烁（boot script 生效）。
  - 暗色侧边栏对比度对照修复前明显改善。
- CSP：确认内联 boot script 被放行，控制台无 CSP 报错。
