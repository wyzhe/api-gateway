# Frontend Migration Plan · `frontend/` → `frontend-muxcode/`

把 `frontend-muxcode/` 当作 **`frontend/` 的视觉重构目标**，**不是永久并行**。
本文档定义迁移的范围、deadline、规则和切换流程。

---

## 当前状态

| | `frontend/`（老） | `frontend-muxcode/`（新） |
| --- | --- | --- |
| 用途 | 现在生产用的 UI | MuxCode 风格的重构目标 |
| Tailwind | v4 + `@tailwindcss/vite` | v3 + postcss |
| 端口（dev） | 5173 | 5174 |
| 页面完整度 | 100% | 仅 Home + Login + Dashboard 骨架 |
| 状态 | **freeze（只修关键 bug）** | **active development** |

---

## 三条强约束（写进 AGENTS.md / CLAUDE.md）

### 约束 1 · `frontend/` 进入 freeze

- 老 frontend 不再加新功能
- 只接受**关键 bug 修复**（生产事故、安全漏洞、数据丢失类）
- 任何 UI / 文案 / 样式调整都**只在 frontend-muxcode 做**
- 提交信息要标注 `[frontend-freeze]` 或 `[muxcode]` 让 reviewer 清楚

### 约束 2 · 类型单一源头

两个前端共享的类型必须从一个地方来：

**方案 A（推荐）**：保持 `frontend/src/lib/types.ts` 是源头，frontend-muxcode 通过相对路径 import：

```ts
// frontend-muxcode/src/lib/types.ts
export type * from "../../../frontend/src/lib/types";
```

或者用 TS path alias，让 `@shared/types` 都指向 `frontend/src/lib/types.ts`。

**方案 B（更彻底）**：抽到 monorepo 顶层 `shared/types/`，两个前端都引用。需要起 workspace。

迁移完成（切换）时，方案 A 直接转 inline；方案 B 不动。

### 约束 3 · Deadline = 8 周

从今天起 8 周内 frontend-muxcode 必须达到 feature parity（见下方清单），然后执行切换 SOP。

如果 8 周到了还没完成：
- **要么**延期 deadline 但同时削减 parity 范围（砍掉哪些页面不做）
- **要么**直接放弃 muxcode，把老 frontend 的设计系统升级
- **绝不**允许"再拖一拖"。两套前端拖三年是行业反面教材。

---

## Parity Checklist（12 页面 + 2 路由组）

> 每个 ☐ 完成后改成 ☑️ 并写上完成日期。每完成一个跑 `npm run build` 必须通过。

### 公开页

- [x] `/` Landing — MuxCode 模板已经有
- [x] `/login` Login — 本次脚手架已完成最小版本
- [ ] `/oauth-complete` OAuth 回跳处理（解析 query token，setToken，redirect）

### 用户控制台（需要登录）

- [ ] `/dashboard` — KPI 卡 + 今日/本月用量图 + 最近活动 + 公告（参考 `frontend/src/pages/dashboard.tsx`）
- [ ] `/api-keys` — Key 列表 + 创建/撤销/编辑/查看明文（reveal）+ 设置 monthly_limit / rpm / tpm / concurrent
- [ ] `/usage-logs` — 请求日志列表 + 详情 Drawer（复用 `LogDetailDrawer` 组件）
- [ ] `/billing` — 账单 / Transaction Ledger
- [ ] `/playground` — Chat / Anthropic Messages / Image / Video 四 tab 测试（**这个最大，26KB**）
- [ ] `/models` — 模型广场（卡片网格 + 按 provider/type 筛选）
- [ ] `/generations` — 图像/视频生成历史 + 下载
- [ ] `/docs` — 接入文档
- [ ] `/account` — 个人信息 + 改密 + OAuth 已绑账号

### 管理员

- [ ] `/admin/users` — 用户列表 + 充值 / 调整 / 禁用 / 改 role
- [ ] `/admin/models` — 模型增删改 + 价格 markup + healthcheck
- [ ] `/admin/providers` — 上游 provider 管理
- [ ] `/admin/logs` — 全局日志（含其他用户）
- [ ] `/admin/audit` — 审计日志查看

---

## Auth 契约（已实现）

frontend-muxcode 复用老 frontend 的 token 存储 key，**这样用户在 5173 登录后切到 5174 不需要重登**：

| | Key |
| --- | --- |
| Access token | `localStorage["lgw_jwt"]` |
| Refresh token | `localStorage["lgw_refresh"]` |

后端调用契约：

| 接口 | 方法 | Body | 说明 |
| --- | --- | --- | --- |
| `/api/auth/login` | POST | `{email, password}` | 返回 `{access_token, refresh_token, user}` |
| `/api/auth/refresh` | POST | `{refresh_token}` | 返回新 access + refresh |
| `/api/auth/me` | GET | — | 当前用户 |
| `/api/auth/logout` | POST | — | 撤销 refresh |
| `/api/auth/oauth/providers` | GET | — | `{google: bool, github: bool}` |
| `/api/auth/oauth/{provider}/start` | GET | query `?redirect=` | 重定向到上游 OAuth |
| `/api/auth/oauth/{provider}/callback` | GET | — | OAuth 回跳，setCookie + redirect |
| `/api/auth/oauth/exchange` | POST | — | 用 cookie 换 token |

参见 `frontend-muxcode/src/lib/api.ts` 和 `auth.tsx`。

---

## 怎么同时跑两个前端

```bash
# 1. backend + worker（一个终端各一个）
cd backend
.venv/bin/uvicorn app.main:app --reload --port 8000
.venv/bin/arq app.worker.WorkerSettings

# 2. 老 frontend（→ http://localhost:5173）
cd frontend && npm run dev

# 3. 新 frontend-muxcode（→ http://localhost:5174）
cd frontend-muxcode && npm install && npm run dev
```

两个前端都 proxy `/api` 和 `/v1` 到 backend `:8000`。用户在哪个都行，登录态因为 localStorage key 一致是同步的。

> Tailwind v4（老）和 v3（新）**互不影响**——每个前端有自己的 build pipeline，CSS 不会冲突，因为根本不会同时加载到一个页面。

---

## 切换 SOP（8 周后做这个）

### Step 1 · Parity Gate

最后一次 review parity checklist。**所有 ☑️ 才能进 Step 2**。

### Step 2 · 视觉回归

跑 Playwright 视觉回归（frontend-muxcode 已经有 `tests/visual.spec.ts` 但目前对比的是 tabcode.cc，要改成对比 frontend vs frontend-muxcode）：

```bash
cd frontend-muxcode
npm run visual
```

确认所有页面 diff < 30%（不是越接近老 UI 越好——本来就是要换皮——但要确认没有页面"残废"）。

### Step 3 · 备份 + 切换

```bash
cd llm-api-gateway

# 备份老的
mv frontend frontend.legacy

# 升级新的为正式名
mv frontend-muxcode frontend

# 更新 vite 端口回 5173（如果之前是 5174）
sed -i '' 's/port: 5174/port: 5173/' frontend/vite.config.ts
```

### Step 4 · 更新 CI / docs

- README.md 路径修正
- AGENTS.md / CLAUDE.md 移除 frontend-muxcode 相关内容
- `restart.sh` 路径检查
- GitHub Actions / Vercel 配置如果有 frontend 路径硬编码要更新

### Step 5 · 烟雾测试

按 README "End-to-end smoke test (8 flows)" 全跑一遍。

### Step 6 · 归档 frontend.legacy

3 个月后无回滚需求，可以删 `frontend.legacy`（git 历史还在）。

---

## 常见决策项 / FAQ

### Q: shadcn primitive 怎么处理？老 frontend 用了一套 hand-rolled 的，新的 muxcode 也是自己写的，要合并吗？

A: **不合并，frontend-muxcode 写自己的版本**。老的 frontend 已经 freeze，没必要回去改。muxcode 的 primitive 重新按需要写，参考 MuxCode 已有的 `src/components/` 风格。

### Q: i18n 怎么办？老 frontend 有 `useT` / `TKey` 多语言支持。

A: **暂时跳过**。frontend-muxcode 先做中文一种语言。等 parity 完成后再考虑加 i18n（如果需要的话用 react-i18next，简单）。已写的 Login 页有写死中文，到时候提出来即可。

### Q: 老 frontend 的 `LogDetailDrawer`、`KpiTile` 这些复用组件，能直接搬过来吗？

A: **可以参考逻辑，但样式要用 muxcode 的设计系统重写**。直接搬就违背了"换皮"的目的。一个推荐做法：把组件的 props 接口和数据处理逻辑保留，body 部分用 muxcode 风格重写。

### Q: Tailwind v3 还是 v4？

A: **muxcode 先用 v3**（已经配好），切换那一步**不强制**升 v4，可以以后单独迁移。v3 → v4 是一次独立的工程，混在 UI 重构里风险太大。

### Q: 用户登录后 5173 和 5174 都能用，会不会两边状态不同步？

A: 只要 token 一致，两边 `/api/auth/me` 拉到的都是同一个 user，状态不会冲突。
但如果用户在 5173 修改了 API Key，5174 那边的列表不会自动刷新——这个无所谓，反正最终目标是删掉 5173。

---

## 给 Claude Code 的接手提示词

```
你现在接手 frontend-muxcode 的开发，目标是达到 frontend/ 的 feature parity，
最终替换掉它。

读 MIGRATION_PLAN.md 了解：
- 12 个页面的 parity checklist
- Auth 契约 + token 存储 key
- 两个前端的运行方式
- 8 周 deadline 和切换 SOP

读 frontend/src/lib/types.ts 了解所有 API 数据类型。
读 frontend/src/pages/ 看老 UI 实现了哪些功能（参考逻辑，不抄样式）。
读 frontend-muxcode/src/lib/api.ts 和 auth.tsx 了解已有的最小 API 客户端。

按以下顺序逐个实现 parity checklist 里的页面：
1. /oauth-complete（最小，先做）
2. /dashboard（提升新户激活感）
3. /api-keys
4. /usage-logs（复用 LogDetailDrawer 概念）
5. /billing
6. /account
7. /models
8. /generations
9. /docs
10. /playground（最大，留最后）
11. /admin/*

每完成一个页面：
- 跑 npm run build 确认 TS 编译过
- 启 backend + frontend-muxcode，手动验一遍核心交互
- 在 MIGRATION_PLAN.md 里把对应 checkbox 改成 ☑️ 并写完成日期
- commit message 用 [muxcode] 前缀

绝对不要：
- 改 frontend/（除非是关键 bug）
- 在 frontend-muxcode 里手写已经存在于 frontend/src/lib/types.ts 的类型
- 引入新的设计 system（保持 MuxCode 的视觉语言：Tailwind v3 + 自己写的 shadcn 风格 primitive）

完成全部 parity 后通知用户走切换 SOP。
```

---

最后更新：2026-05-22 · 维护者：项目负责人
