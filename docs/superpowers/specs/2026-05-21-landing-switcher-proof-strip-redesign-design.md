# 落地页切换器与 hero proof strip 优化 — 设计文档

**日期**: 2026-05-21
**状态**: Draft — 待 user review
**作者**: brainstorming with user

## 1. 概述与动机

用户反馈落地页(`frontend/src/pages/landing.tsx`)有两处视觉问题,需对齐真实产品惯例优化。

### 图1 — 主题 / 语言切换器

落地页头部的主题切换器(系统 / 亮色 / 暗色)和语言切换器(EN / 中文)目前渲染为「圆点 `·` 分隔的裸文字」。问题:

- **看不出是可点击的控件** —— 没有边框、底色或任何控件外观,读起来像一段普通文字。
- **两组开关黏在一起** —— 主题三项和语言两项之间只有一个 `gap-2`,视觉上分不清「系统/亮色/暗色」和「EN/中文」是两组独立开关。

### 图2 — hero proof strip

hero 区左栏 CTA 按钮下方的四条要点(`/v1`、`文本 / 图像 / 视频`、`Key 级额度`、`全链路日志`)排布拥挤。根因:

- 四列硬塞进 hero 左栏,每列约 130px 宽。
- `value` 用了等宽字体(`mono`),中文是全角字符,`文本 / 图像 / 视频` 被撑到换行,四格高度不齐。
- 单元格只有右内边距(`pr-4`),文字贴左边、分隔线贴文字。
- `label` 用了 `text-faint`(near-invisible 档),违反 DESIGN.md「Don't use for text the user must read」—— 标签是需要读的。

### 已确认的方向

设计方向已通过可视化 mockup 与用户确认:

- **图1 采用方案 B** —— 图标主题 + 文字语言的 segmented control(分段控件)。
- **图2 采用方案 C** —— 2×2 卡片网格。

## 2. 范围

本次涵盖:

- 重做 `ThemeSwitcher`、`LanguageSwitcher` 两个组件为分段控件。
- 重排 `landing.tsx` hero proof strip 为 2×2 卡片网格。
- 同步更新 `DESIGN.md` 中两个组件的描述。

`ThemeSwitcher` / `LanguageSwitcher` 是**共享组件**,改动会波及它们的全部使用位置(下表),这是预期内的 —— 目的是全站一致,避免落地页与应用内割裂。

| 组件 | 使用位置 |
|---|---|
| `ThemeSwitcher` | `landing.tsx` 头部、`shell.tsx` 侧边栏用户 Popover |
| `LanguageSwitcher` | `landing.tsx` 头部、`shell.tsx` 侧边栏 Popover、`login.tsx` 右上角 |

`TooltipProvider` 在 `App.tsx` 中包裹全部路由(含落地页、登录页),故新加的 `Tooltip` 在所有这些位置都可用。

### 不在本次范围

- 不改切换器的功能 / 状态逻辑(`useTheme` / `useLang` 不动)。
- 不抽取共享的 `SegmentedControl` primitive —— 两个组件维持各自独立的文件,与当前代码结构一致(当前两组件已是平行的重复结构,这是既有的代码取舍)。
- 不改 proof strip 的文案(`landing.hero.proof.*` 的 i18n 不动)。
- 不改 hero 整体构图(proof strip 仍留在左栏原位置,不移成通栏)。
- 移动端布局不专门重做(分段控件宽度与现状裸文字相当)。

## 3. 图1 — 切换器改为分段控件

### 3.1 视觉规格(两个组件共用)

复用 DESIGN.md 已有的 `tabs-list` / `tab-active` token,不引入新颜色 / 新尺寸:

- **容器**:`inline-flex items-center h-7 rounded-md bg-surface-2 p-0.5`,保留 `role="group"` + `aria-label`。
- **每段按钮**:`inline-flex items-center justify-center h-6 rounded-sm transition-colors`(段 `h-6` + 容器 `p-0.5` = `h-7`),焦点态 `focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring`。
  - **选中**:`bg-surface text-foreground`(与 `tab-active` 一致)。**不使用绿色 accent** —— DESIGN.md 规定 accent 仅用于主按钮 / 侧边栏激活项 / 成功态 / 品牌标 / hero 强调文字,主题开关不在其列。
  - **未选中**:`text-muted-foreground hover:text-foreground`。
- 段与段之间不再有 `·` 分隔符 —— 轨道底色 + 选中 pill 已表达分组与选中。两组件中已不再需要的 `Fragment` import 一并移除。

### 3.2 ThemeSwitcher

- 三段,内容为**图标**(lucide-react),无文字:
  - `system` → `Monitor`
  - `light` → `Sun`
  - `dark` → `Moon`
- `OPTIONS` 配置由 `[ThemePreference, TKey]` 扩展为携带对应图标组件。
- 图标尺寸 `h-3.5 w-3.5`;图标段按钮加 `w-6`(配合 §3.1 的 `h-6` 构成 24×24 方形)。
- **无障碍**:图标无可见文字,每段按钮加 `aria-label={t(themeKey)}`、保留 `aria-pressed={preference === value}`,并用项目的 `Tooltip` primitive 包裹按钮,`content` 为对应中文「系统 / 亮色 / 暗色」。
- 保留 `className` prop;不新增 prop。

### 3.3 LanguageSwitcher

- 两段,内容为**文字** `EN` / `中文`,段内文字 `text-xs`。
- **移除 `compact` prop** 及 `OPTIONS` 里的 `shortLabel`(第三元组项)—— 分段控件本身已足够紧凑,侧边栏 Popover 行(`w-56`,行内可用宽约 180px)放得下「EN / 中文」。`OPTIONS` 简化为 `[Lang, string]`。
- 每段保留 `aria-pressed`;容器保留 `role="group" aria-label="Language"`。

### 3.4 落地页头部

`landing.tsx` 头部右侧 `<div className="flex items-center gap-2">` 结构不变,内部 `ThemeSwitcher` / `LanguageSwitcher` / `PrimaryCta` 三者顺序与 `gap-2` 维持现状。

### 3.5 侧边栏 Popover

`shell.tsx` 内「主题」「语言」两行维持 `flex items-center justify-between` 结构:左侧标签文字、右侧分段控件。`shell.tsx:154` 由 `<LanguageSwitcher compact />` 改为 `<LanguageSwitcher />`。控件变为 `h-7` 后该行会略高于相邻菜单项,属预期、无需额外处理。

## 4. 图2 — hero proof strip 改为 2×2 卡片

### 4.1 布局

`landing.tsx` 中 hero proof strip 当前的外层:

```
<div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-y border-border">
```

改为:

```
<div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3">
```

—— 移动端 1 列,`sm` 起 2×2;`gap-3` 与同页 modalities / capabilities 网格一致。移除 `border-y` 横条与单元格的 `border-r` / `border-b` 分隔线。

### 4.2 ProofCard 组件

在 `landing.tsx` 内新增局部组件 `ProofCard`(与现有 `ModelCard`、`CapabilityCard` 同级,**不进** `components/` —— 它是落地页专用,与那两个局部组件一致):

```tsx
function ProofCard({ value, label, mono }: { value: string; label: string; mono?: boolean }) {
  return (
    <article className="rounded-md border border-border bg-surface p-4">
      <div className={cn("text-base font-semibold", mono && "mono")}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </article>
  );
}
```

- 卡片样式 `rounded-md border border-border bg-surface p-4`,与 `ModelCard` / `CapabilityCard` 一致。
- `value`:`text-base font-semibold`,默认 sans;`mono` 为真时加 `mono` class。
- `label`:`mt-1 text-xs text-muted-foreground`(从原 `text-faint` 提到可读档)。
- 需 import `cn`(来自 `@/lib/utils`)—— `landing.tsx` 当前未引入,需新增。

### 4.3 proof 数据加 mono 标记

`landing.tsx` 中 `proofs` 数组构造时,给 endpoint 项(`/v1`)加 `mono: true`,其余三项不加(`文本 / 图像 / 视频`、`Key 级额度`、`全链路日志` 是中文短语,用 sans)。`/v1` 是路径,按 DESIGN.md「paths 用 mono」。

渲染由原来的 inline `<div>` map 改为 `proofs.map((p) => <ProofCard key={p.value} {...p} />)`。

## 5. 受影响文件清单

| 文件 | 改动 |
|---|---|
| `frontend/src/components/theme-switcher.tsx` | 重写为图标分段控件;import lucide 图标 + `Tooltip`;移除 `Fragment` |
| `frontend/src/components/language-switcher.tsx` | 重写为文字分段控件;移除 `compact` prop / `shortLabel`;移除 `Fragment` |
| `frontend/src/components/shell.tsx` | `<LanguageSwitcher compact />` → `<LanguageSwitcher />` |
| `frontend/src/pages/landing.tsx` | 新增 `ProofCard`;proof strip 改 2×2;`proofs` 加 `mono` 标记;import `cn` |
| `DESIGN.md` | 更新 `ThemeSwitcher` / `LanguageSwitcher` 组件描述 |

`login.tsx` 用的是 `<LanguageSwitcher />`(本就无 `compact`),代码无需改动,会自动获得新外观。

## 6. DESIGN.md 同步更新

`## Components` → `### Composite / shared` 表中:

- **`LanguageSwitcher`**:描述由「The `EN / 中文` pill」改为说明其为 segmented control(分段控件),并说明已无 `compact` 变体。
- **`ThemeSwitcher`**:描述由「three-way `系统 / 亮 / 暗` ... Mirrors `LanguageSwitcher` in structure」更新为图标分段控件(Monitor / Sun / Moon),保留「Takes only a `className` prop」。

## 7. 验证

- `cd frontend && npm run build`(`tsc -b` 先跑,类型错误会 fail build)。
- dev server 浏览器手动验证:
  - **落地页头部**:主题三图标段、语言两文字段,选中态为白色 pill;切换主题 / 语言生效;hover / focus 态正常;图标 Tooltip 正常弹出。
  - **亮色 + 暗色**两种主题下都检查(项目以暗色为主色调)。
  - **侧边栏用户 Popover**:主题 / 语言两行的分段控件显示正常、不溢出 `w-56`。
  - **登录页**右上角语言分段控件正常。
  - **hero proof strip**:2×2 四张卡片,`文本 / 图像 / 视频` 单行不换行,四卡等高,标签 `text-muted-foreground` 可读;`/v1` 为等宽体、其余为 sans。
  - **移动端窄屏**:proof 卡片回落到 1 列;头部切换器不溢出。
