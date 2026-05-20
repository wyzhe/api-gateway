# DeepSeek 接入 + 每模型价格倍率 — 设计文档

- 日期：2026-05-20
- 状态：已批准，待实现
- 作者：wyz / Claude

## 1. 背景与目标

在 Relay LLM Gateway 现有的单一上游（APIMart）之外接入 DeepSeek 作为**第二个上游 provider**，暴露两个文本模型：

- `deepseek-v4-flash`
- `deepseek-v4-pro`

并新增一个独立特性：**每模型价格倍率（`price_markup`）**，让管理员在后台为任意模型在基础列表价之上叠加一个倍率，实际计费 = 基础价 × 倍率。

DeepSeek API 兼容 OpenAI Chat Completions 与 Anthropic Messages 两种协议，本设计两个网关端点（`/v1/chat/completions`、`/v1/messages`）都接。

### 非目标 / 明确不做（YAGNI）

- 跨 provider fallback / 智能路由（CLAUDE.md 硬规则）。
- DeepSeek 图像 / 视频（DeepSeek 无此能力，两个模型均为 `text` 类型）。
- session stickiness 改动（一个 `public_name` 对应一个 provider，`provider_selector` 仍返回 `model.provider_id`）。
- 把 `deepseek-v4-pro` 当前的 2.5 折临时优惠（至 2026-05-31）写进定价；一律用官方列表价。
- 全局 / 按 provider 的倍率（已选定每模型粒度）。

## 2. DeepSeek API 事实（依据 https://api-docs.deepseek.com/zh-cn/ ，2026-05 核对）

| 项 | 值 |
|---|---|
| OpenAI 兼容 base URL | `https://api.deepseek.com` |
| Anthropic 兼容 base URL | `https://api.deepseek.com/anthropic` |
| 模型 | `deepseek-v4-pro`（强推理）、`deepseek-v4-flash`（快速）；旧名 `deepseek-chat` / `deepseek-reasoner` 将于 2026-07-24 弃用 |
| 协议 | OpenAI Chat Completions、Anthropic Messages，均支持流式 |
| 缓存用量字段 | OpenAI 格式响应在 `usage` 顶层带 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`（`prompt_tokens` 已含两者之和）；DeepSeek 缓存无写入费 |
| 官方定价（人民币/百万 token） | flash：输入未命中 ¥1、命中 ¥0.02、输出 ¥2；pro：输入未命中 ¥3、命中 ¥0.025、输出 ¥6 |

实现期需对照 DeepSeek 文档最终核对：anthropic 端点的鉴权头（`x-api-key` + `anthropic-version`）、v4 上下文窗口长度。

## 3. 架构方案

采用**方案 1：独立 `DeepSeekProvider(BaseProvider)`**。

- 新建 `backend/app/providers/deepseek.py`，自包含一个全新 provider 类，只实现 chat + messages；image / video / task 走 `BaseProvider` 基类的 `NotImplementedError`。
- 把 chat / messages 流式里「SSE 行 → `ProviderStreamChunk`」的解析（两个 provider 文件唯一真正重复的部分）抽到新文件 `backend/app/providers/_sse.py` 共享；`APIMartProvider` 同步改用它（纯提取，行为不变，已被现有流式测试覆盖）。

理由：符合本仓库「每个 provider 的上游细节收在自己文件里」的约定，对已跑通的 APIMart 路径影响最小，单元可独立测试。已否决方案 2（抽 `OpenAICompatibleProvider` 基类——重构面 / httpx-client 全局上提风险大）与方案 3（继承 `APIMartProvider`——语义错误、耦合泄漏）。

## 4. 数据流

```
/v1/chat/completions 或 /v1/messages  (model = deepseek-v4-flash | deepseek-v4-pro)
  → resolve_for_request()  → ModelRow(provider = deepseek)
  → build_provider()       → 按 provider.name 分发到 DeepSeekProvider
  → 上游：chat    → https://api.deepseek.com/chat/completions
          messages → https://api.deepseek.com/anthropic/v1/messages
  → 用量提取（含 prompt_cache_hit_tokens）
  → cost_service 计费（× price_markup）
  → persist_success() + debit
```

预授权 / 月度上限预留 / 价格快照 / 审计 等公共管线**不改结构**，仅 `cost_service` 内部叠加倍率。

## 5. 后端改动

### 5.1 `backend/app/config.py`

新增 Settings 字段：

- `deepseek_api_key: str = ""`
- `deepseek_base_url: str = "https://api.deepseek.com"`（OpenAI 兼容 base，不含 `/v1`；anthropic 路径由 `deepseek.py` 内部拼 `/anthropic/v1/messages`）
- `deepseek_timeout_connect / read / write: float`，默认与 apimart 同值（10 / 120 / 30）

### 5.2 `backend/app/providers/_sse.py`（新）

导出共享函数，把单行 SSE 文本解析成 `ProviderStreamChunk`（处理空行、注释行 `:`、`data:` 行的 JSON 解析、`[DONE]`）。`APIMartProvider` 的 `chat_completions_stream` / `messages_stream` 改用它。

### 5.3 `backend/app/providers/deepseek.py`（新）

`DeepSeekProvider(BaseProvider)`，`name = "deepseek"`：

- `__init__(base_url, api_key)`。
- `chat_completions` / `chat_completions_stream` → `{base}/chat/completions`，鉴权 `Authorization: Bearer`；流式强制 `stream_options.include_usage=true`。
- `messages` / `messages_stream` → `{base}/anthropic/v1/messages`，鉴权用 DeepSeek anthropic 端点要求的 `x-api-key` + `anthropic-version` 头（实现期对照文档核对）。
- `image_generation` / `video_generation` / `get_task_status` / `extract_task_id`：不实现，沿用基类 `NotImplementedError`（兜底，正常不可达——见 §7）。
- 自己的模块级 httpx `AsyncClient` 全局 + `close_client()`，超时取 `deepseek_timeout_*`。

`upstream_model` 与 `public_name` 同名，按原样转发，无需重写模型名。

### 5.4 `backend/app/providers/__init__.py` / `main.py` / `worker.py`

- `__init__.py` 导出 `DeepSeekProvider`，并提供统一的 `close_all_clients()`（依次关闭 apimart 与 deepseek 的 httpx client）。
- `main.py` 的 lifespan、`worker.py` 的 shutdown 调用 `close_all_clients()`（替换原先只关 apimart 的调用）。

### 5.5 `backend/app/services/gateway_service.py`

`build_provider()` 按 `provider.name` 分发：

- `"apimart"` → `APIMartProvider(base_url, settings.apimart_api_key)`
- `"deepseek"` → `DeepSeekProvider(base_url, settings.deepseek_api_key)`；key 缺失抛 500
- 其它 → 501

返回类型由 `APIMartProvider` 放宽到 `BaseProvider`。

### 5.6 `backend/app/api/gateway.py`

`_extract_cache_tokens()` 的缓存命中查找加入 DeepSeek 字段：在现有 `prompt_tokens_details.cached_tokens` / `cache_read_input_tokens` 之外补 `usage.get("prompt_cache_hit_tokens")`。该字段其它 provider 不返回，安全。无新增路由——DeepSeek 文本模型走现有 chat / messages handler。

### 5.7 `backend/app/seed.py`

- 新增 `ensure_deepseek_provider(db)`：`name="deepseek"`、`display_name="DeepSeek"`、`base_url=settings.deepseek_base_url`、`status="active"`。
- 新增 `DEEPSEEK_MODELS` 列表（2 条，见 §6）。
- `run_seed()` 中 ensure deepseek provider 并 seed 这两个模型；启动时若 `deepseek_api_key` 为空 → 两个模型 seed 成 `status="disabled"`（参照现有 grok 模型 disabled 的做法），有 key → `active`。
- seed 逻辑保持幂等。

### 5.8 价格倍率 — `models` 表

新增列 `price_markup: Mapped[Decimal]`，`Numeric(18, 8)`，`nullable=False`，`default=Decimal("1")`，`server_default="1"`。配套一个 Alembic migration（`alembic revision --autogenerate`，存量行由 server_default 回填 1.0，提交前读 diff）。

### 5.9 价格倍率 — `backend/app/services/cost_service.py`

新增私有 `_with_markup(cost: Decimal, markup: Decimal | None) -> Decimal`，`markup` 为 None 视作 1。

在返回前叠加倍率：

- 实际计费：`calc_text_cost`、`calc_text_cost_with_cache`、`calc_image_cost`、`calc_video_cost` —— 用 `model.price_markup`。
- 预授权估算：`estimate_text_cost_upper_bound`、`estimate_image_cost_upper_bound`、`estimate_video_cost_upper_bound` —— 用 `model.price_markup`（不叠加会导致月度上限少预留，违反「估算绝不低估」）。
- 快照重算：`recompute_text_cost_from_snapshot` —— 倍率从快照里读，缺失则 1.0。

`price_snapshot()` 写入 `"price_markup": str(model.price_markup)`。

定价缺失分支（input/output 价均 None → 成本 0）不受影响：`0 × markup == 0`。

### 5.10 价格倍率 — schema / admin API

- `backend/app/schemas/model.py`：
  - `ModelOut` 加 `price_markup: Decimal`（返回值；`input_price` 等仍为基础列表价）。
  - `ModelCreate` 加 `price_markup: Decimal = Field(default=Decimal("1"), gt=0)`。
  - `ModelUpdate` 加 `price_markup: Decimal | None = Field(default=None, gt=0)`。
- `backend/app/api/models.py` 的 `_to_out()` 补 `price_markup=row.price_markup`。
- admin 的 create / update 走 `ModelRow(**payload.model_dump())` 与字段逐项更新，新字段自动贯通；PATCH 的审计日志（CLAUDE.md #10）自动覆盖 `price_markup` 的 before/after。

倍率恒为正：`0` 会让计费归零、负数无意义，故 schema 强制 `gt=0`；不设上限（admin 可信，与 `input_price` 本身无上限一致）。

## 6. 两个 DeepSeek 模型的 seed 定价

USD 计价，按 ¥7.2/$ 换算官方列表价，不含临时折扣，不加价（`price_markup=1.0`，倍率由 admin 后续在后台调）。

| public_name / upstream_model | type | input_price | output_price | cache_read_price | cache_write_price | price_markup | max_input_tokens |
|---|---|---|---|---|---|---|---|
| `deepseek-v4-flash` | text | 0.14 | 0.28 | 0.003 | None | 1.0 | 128000 |
| `deepseek-v4-pro` | text | 0.42 | 0.83 | 0.0035 | None | 1.0 | 128000 |

其余字段：`pricing_mode="per_token"`、`display_provider="deepseek"`、`capabilities={"stream": true, "tools": true, "vision": false, "ctx": 128000}`、`display_name` 为 `DeepSeek V4 Flash` / `DeepSeek V4 Pro`。

计费衔接：DeepSeek 缓存无写入费 → `cache_write_price=None`；命中 token（`prompt_cache_hit_tokens`）走 `cache_read_price`，未命中走 `input_price`。`cost_service._compute_cache_cost` 的三段式内核（`regular = prompt_tokens − cache_read − cache_write`）天然吻合，无需改内核。

实现期对照文档最终核对 `ctx`（暂定 128000）。

## 7. 错误处理与边界

- DeepSeek 上游故障 → 直接透传上游错误，**不做跨 provider fallback**（CLAUDE.md 硬规则）。
- 请求时 `deepseek_api_key` 缺失 → `build_provider()` 抛 500（与 APIMart 一致）；启动无 key 时模型已 seed 成 disabled，正常不会触发。
- DeepSeek 不支持图像 / 视频：两个模型为 `text` 类型，gateway 的 image / video 路由有 `expected_type` 类型门会先 400 拒掉，`DeepSeekProvider` 未实现的方法仅作防御兜底。
- 旧 `request_log` 快照（本次 migration 之前生成）不含 `price_markup` 键 → `recompute_text_cost_from_snapshot` 按 1.0 处理，worker 的流式用量回扣路径保持正确。

## 8. 前端改动

- `frontend/src/components/provider-tag.tsx`：`PROVIDER_LABELS` 加 `deepseek: "DeepSeek"`，`PROVIDER_COLOR_VAR` 加 `deepseek: "var(--deepseek)"`。
- `frontend/src/index.css`：`:root` 下加 `--deepseek` 色值（DeepSeek 品牌蓝 `#4D6BFE`）；若经 `@theme inline` 导出则一并补。
- `frontend/src/lib/types.ts`：`Model` 类型加 `price_markup`。
- admin 模型编辑页 `frontend/src/pages/admin/models.tsx`：表单加「价格倍率 / Price markup」数字输入框（`> 0`，默认 1）。
- 用户侧价格展示：审计 `frontend/src/pages/models.tsx` 等向终端用户展示价格的位置，显示**有效价 = 基础价 × price_markup**，避免「展示价 ≠ 实际计费价」。
- 若 `DESIGN.md` 有 provider 配色 / 组件清单，同步补 `deepseek` 条目。

## 9. 测试

- `backend/tests/`：`DeepSeekProvider` 单测——chat vs messages 的 URL 构造、鉴权头、`_sse.py` 行解析。
- `backend/tests/test_gateway_paths.py`：DeepSeek 模型经 `/v1/chat/completions` 与 `/v1/messages` 的路由。
- `cost_service` 测试：
  - `prompt_cache_hit_tokens` 缓存命中计费正确。
  - `price_markup` 在 `calc_*`、`estimate_*`、`recompute_*_from_snapshot` 三处一致生效；快照缺 `price_markup` 键时按 1.0。

## 10. 文档

- `CLAUDE.md`：把「currently APIMart」「单一上游」等措辞更新为 APIMart + DeepSeek；补 `build_provider()` 按 `provider.name` 分发的说明；`config.py` 配置项一节补 `DEEPSEEK_*`。
- `.env`：已有 `DEEPSEEK_API_KEY`；可选补 `DEEPSEEK_BASE_URL` 注释。

## 11. 改动文件清单

后端：`config.py`、`providers/_sse.py`（新）、`providers/deepseek.py`（新）、`providers/apimart.py`、`providers/__init__.py`、`main.py`、`worker.py`、`services/gateway_service.py`、`services/cost_service.py`、`api/gateway.py`、`api/models.py`、`schemas/model.py`、`models/model.py`、`seed.py`、新 Alembic migration、`tests/`。

前端：`components/provider-tag.tsx`、`index.css`、`lib/types.ts`、`pages/admin/models.tsx`、`pages/models.tsx`。

文档：`CLAUDE.md`、`DESIGN.md`（按需）、`.env`。
