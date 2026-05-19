# 前端中英文 i18n — 设计文档

- 日期：2026-05-18
- 分支：`feat/frontend-i18n-zh`
- 范围：仅 `frontend/`，后端不动
- 状态：草案，待用户确认后转入实现计划

## 1. 背景与目标

Relay 控制台目前完全是英文界面。要让中文用户能切换到本地化的 UI，**同时保留所有行业标准技术术语和代码示例的英文原样**。

非目标：

- 不引入 SSR、不做 URL 路径 i18n（`/zh/dashboard` 之类）
- 不做后端响应的本地化（错误信息保持英文，由前端可选包装）
- 不做翻译工作流（Crowdin / 外部翻译团队）

## 2. 方案选型（已确认）

手写 `Context + 字典`，理由记录于会话中：

- 与项目 hand-rolled 风格一致（CLAUDE.md 明确不引入 shadcn CLI 等"会被改的"依赖）
- 零新增 npm 依赖；包体 ≈ 1KB
- 仅 2 种语言、约 200–300 条文案，react-i18next 的 90% 能力用不到
- 强类型 key：`t("nav.dashboard")` 拼错编译期报错

被否决：react-i18next（依赖更重、样板更多、类型增强需额外配 d.ts）。

## 3. 用户决策快照

| 项目 | 选择 |
|---|---|
| 默认语言 | 首次按 `navigator.language` 检测（`zh-*` → 中文；其余 → 英文），之后 `localStorage` 记忆 |
| 切换器位置 | sidebar 底部用户区 + login 页右上角 |
| 保留英文 | API Key / JWT / Token / Bearer / SSE / RPM / TPM 等技术名词；模型名（`claude-sonnet-4.6` 等）和 provider 名（`APIMart`）；代码示例、curl、JSON 字段名；品牌 `Relay`、`MVP` 徽标 |

## 4. 架构

### 4.1 目录

```
frontend/src/lib/i18n/
  index.tsx       — LanguageProvider, useT, useLang, 导出 Lang 类型
  dict-en.ts      — 英文字典（key 的权威来源）
  dict-zh.ts      — 中文字典（结构必须与 en 完全一致）
  types.ts        — 由 dict-en 推导的 Dict / TKey 字面量联合
frontend/src/components/
  language-switcher.tsx  — EN | 中文 切换控件
```

字典放在 `lib/i18n/` 而非 `pages/`，因为它是跨页面的运行时配置。

### 4.2 运行时

```tsx
// main.tsx
<LanguageProvider>
  <BrowserRouter>
    <App />
  </BrowserRouter>
</LanguageProvider>
```

`LanguageProvider`：

1. 初始 `lang`：`localStorage.getItem("lang")` → 没有则 `navigator.language.startsWith("zh") ? "zh" : "en"`
2. `setLang(next)`：更新 state + 写 `localStorage.setItem("lang", next)`
3. `document.documentElement.lang` 同步更新（无障碍 + 浏览器内建翻译识别）
4. 不做任何 fetch / 网络请求；字典走静态 import

### 4.3 API

```ts
type Lang = "en" | "zh";

useLang(): { lang: Lang; setLang: (l: Lang) => void };
useT(): (key: TKey, vars?: Record<string, string | number>) => string;
```

- `TKey` 是从 `dict-en` 类型反推出的点号路径字面量联合，例如 `"nav.dashboard" | "login.submit" | ...`
- 插值规则：把字符串里的 `{name}` 替换为 `vars.name`。不递归、不支持复数（中英文都不需要）
- 字典缺 key 时（zh 缺、en 有）：TS 编译报错（强制结构对齐）；运行时不会发生

### 4.4 字典结构

顶层 namespace 与页面对齐：

```
common      — Save / Cancel / Confirm / Loading / Empty / Retry / Copy / Delete ...
nav         — sidebar 项 + Workspace/Admin 切换 + Sign out
login       — login.tsx
dashboard   — dashboard.tsx
apiKeys     — api-keys.tsx
usageLogs   — usage-logs.tsx
playground  — playground.tsx
models      — models.tsx
billing     — billing.tsx
generations — generations.tsx
docs        — docs.tsx
admin.overview / admin.users / admin.models / admin.providers / admin.logs
logDrawer   — log-detail-drawer.tsx
```

## 5. 翻译规范

### 5.1 保留英文 / 原样的内容

- **技术名词**：`API Key`、`JWT`、`Token`、`Bearer`、`SSE`、`RPM`、`TPM`、`Decimal`、`Webhook`、`OpenAI`、`Anthropic`、`HTTPS`、`CORS`、`UTC` 等
- **标识符**：模型 `public_name`（`claude-sonnet-4.6` 等）、Provider 名（`APIMart`）、字段名（`task_id`、`request_id`、`max_tokens` 等）
- **代码块**：curl、JSON、TS/Python 示例、SSE 帧示例完全不动
- **品牌**：`Relay`、`MVP` 徽标

### 5.2 翻译时遵循的口径

- "API Key" 在长句中保留英文；但 sidebar 短标签 `API Keys` 仍写 `API Keys`（避免变成"API 密钥"造成左侧栏宽度突变）
- 动作词要符合中文软件习惯：`Save → 保存`、`Cancel → 取消`、`Delete → 删除`、`Revoke → 吊销`、`Recharge → 充值`、`Adjust → 调整`
- 业务概念用项目惯用译法：`Balance → 余额`、`Monthly limit → 月度上限`、`Provider (section) → 服务商`、`Generations → 生成记录`、`Audit logs → 审计日志`、`Spend / Cost → 花费 / 费用`
- `Playground` 沿用英文（中文开发者熟悉度高，"试用台"反而别扭）
- `Workspace / Admin` 在 sidebar 分组标题处译为 `工作区 / 管理后台`
- 提示性长句允许重组语序，**不强求逐字翻译**；按你的话："不要全部直译"
- 但**不允许擅自省略**：每条 en 都必须有对应 zh，不能因为"看起来啰嗦"就删掉

### 5.3 不可缩写 / 不可省略的硬约束

- 错误提示中的"原因 + 影响 + 建议下一步"三段式如果英文里有，中文也要有
- 数字单位（`/min`、`/day`、`tokens`、`USD`）保留
- 月度上限、费率、余额这类金额相关字段的措辞要保证用户能准确理解扣费规则，不允许为了简短去掉关键定语

## 6. 切换器 UI

- 两枚 pill 按钮 `EN ｜ 中文`，激活态用 `var(--accent)` 描边或填充（与现有 Switch / Tab 视觉调性一致）
- 高度 ≈ 24px（小巧不抢注意力）
- 位置 1：`shell.tsx` 底部用户区 `<Button onClick={logout}>` 上方
- 位置 2：`login.tsx` 卡片外的右上角 `absolute top-4 right-4`
- 不弹下拉、不需要 icon

## 7. 实施顺序

1. 搭骨架：`lib/i18n/`（Provider、hook、空字典）、`language-switcher.tsx`
2. 注入 `LanguageProvider` 到 `main.tsx`
3. 抽 `dict-en`：把英文文案集中到字典，页面替换为 `t(...)`；这步**不引入任何翻译**，只是搬家，确保 UI 在 EN 下完全没变
4. 写 `dict-zh`：对照 `dict-en` 翻译每一条
5. 切换器接入 sidebar + login
6. `npm run build` 走 TS + 构建；浏览器手动切换 EN ↔ 中文，确认无遗漏（无遗漏的判据：搜索 `frontend/src` 找不出明显的英文 UI 字符串硬编码）

## 8. 风险与边界

| 风险 | 处置 |
|---|---|
| 中文文案变长撑破 sidebar / 表格列 | 第 6 步手动检查；如果某个标签明显超宽，回到字典调短或用 `truncate` |
| `Toast` / `sonner` 里 catch 块抛出的错误是后端英文 message | 本次不翻后端 message；前端固定提示（如"请求失败"）走字典，后端 message 原样 append。后续可以加 error code 字典映射 |
| Docs 页大段说明文字工作量大 | 先翻 UI chrome（标题、tab、按钮、表格列）；正文段落分两次进行，本次至少把 H1/H2 + intro 段翻译 |
| 用户切语言后某些下拉里的固定选项忘记接 `t()` | 实施第 3 步要遍历 grep `>([A-Z])[a-z ]+<` 这类硬编码模式 |
| 与并行分支 `feat/post-mvp-batch-1` 合并冲突 | 本分支只动 `frontend/`，后端不动；冲突面应小。合并时以 main 为基准 |

## 9. 验收

- `npm run build` 通过（TS 严格模式）
- 切到中文：sidebar、login、dashboard、api-keys、playground、models、billing、generations、usage-logs、docs（intro + 主要 H1/H2）、admin 5 页、log-detail-drawer 中没有英文 UI 文案残留（不含 §5.1 保留项）
- 切回英文：UI 与今天的 main 完全一致（字符级一致，因为只是从字典里取）
- 刷新页面后语言记忆生效
- 切换器在 sidebar 和 login 都可见且可用

## 10. 不在本次范围内

- 后端错误 message 的本地化
- Docs 页面的全部正文段落（仅做主结构 + intro）
- 第三种语言、URL 路径 i18n、SSR
- 翻译工作流接入（Crowdin 等）
