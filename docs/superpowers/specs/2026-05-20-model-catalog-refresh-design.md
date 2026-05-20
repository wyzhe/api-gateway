# 模型目录整理 — 设计文档

- 日期：2026-05-20
- 状态：已批准，待实现
- 作者：wyz / Claude

## 1. 背景与目标

把 Relay LLM Gateway 的默认模型目录（`backend/app/seed.py`）整理成下面这套对外阵容：

- **Chat（text）7 个**：`deepseek-v4-flash`、`deepseek-v4-pro`、`gpt-5.5`、`claude-opus-4.7`、`claude-sonnet-4.6`、`gemini-3.1-pro`、`gemini-3.5-flash`
- **Image**：不改动（`gpt-image-2`、`nano-banana`、`nano-banana-pro`、`grok-imagine`）
- **Video 2 个**：上游 `veo3.1-fast`（页面显示 `veo3.1`）、上游 `grok-imagine-1.0-video-apimart`（页面显示 `grok-imagine`）

要求：模型的**调用名（`upstream_model`）与上游文档对齐**，**保证能调通**；价格一律用各家**官方 API 列表价**。

DeepSeek 两个模型已经接入（独立 `deepseek` provider，PR #1 已合并进 `main`），本次不改动它们——只是确认它们在目标阵容里。

### 非目标 / 明确不做（YAGNI）

- 不动 provider 代码、不动网关计费管线、不动前端（目录是 `GET /api/models` 数据驱动，provider chip 已齐）。
- 不写数据库 migration（`models` 表结构不变）。
- 不改 image 模型。
- 不引入按上下文长度分档的定价（仓库是平价模型，沿用标准档——见 §7）。
- 不物理删除任何 `models` 行（退役模型软禁用保留，保 `request_logs` 外键与价格快照完整）。
- 不给新模型加价（`price_markup` 取默认 1）。

## 2. 定价依据（官方 API 列表价，2026-05 核对）

USD / 每百万 token（chat）、USD / 每秒（video）。

| 模型 | 输入 $/1M | 输出 $/1M | 缓存读 $/1M | 缓存写 $/1M | 依据 |
|---|---|---|---|---|---|
| gpt-5.5 | 5.00 | 30.00 | 0.50 | —（OpenAI 无独立缓存写费） | OpenAI 官方 API 价 |
| claude-opus-4.7 | 5.00 | 25.00 | 0.50 | 6.25 | Anthropic 官方价；缓存写 = 1.25×输入、读 = 0.1×输入 |
| gemini-3.1-pro | 2.00 | 12.00 | 0.20 | —（Gemini 无独立缓存写费） | Google 官方 API 价（标准档 ≤200K） |
| gemini-3.5-flash | 1.50 | 9.00 | 0.15 | — | Google 官方 API 价 |
| veo3.1-fast | — | — | — | — | Google 官方价 $0.15/秒（含音频） |
| grok-imagine-1.0-video-apimart | — | — | — | — | xAI 官方价 $0.05/秒 |

`claude-sonnet-4.6`（3.00 / 15.00，缓存 3.75 / 0.30）、`deepseek-v4-flash`、`deepseek-v4-pro` 已在 seed 里，价格不动。

Anthropic 缓存价公式与已有 `claude-sonnet-4.6`（输入 3 → 写 3.75 = 1.25×、读 0.30 = 0.1×）一致，故 `claude-opus-4.7`（输入 5）→ 写 6.25、读 0.50。OpenAI / Gemini 不收独立的「缓存写」费——只设 `cache_read_price`，`cache_write_price=None`。

## 3. 方案

整件事是**一次 `backend/app/seed.py` 的目录改写**，不动其它代码。

仓库 seed 机制：`ensure_default_models()` 按 `public_name` 做**增量插入**（已存在的跳过），外加两张映射表 `RENAME_ON_BOOT`（改名）/ `DISABLE_ON_BOOT`（软禁用）。本设计：

- **新模型**用全新 `public_name` → 增量插入自动覆盖存量库与新库。
- **退役模型**进 `DISABLE_ON_BOOT` → 存量库里把这些行置 `disabled` + `visible=False`；同时从 `DEFAULT_MODELS` 移除 → 新库不再 seed。
- 全程不动已存在行的 `upstream_model`/价格——新 video 模型用全新 `public_name`（即调用名本身），绕开「seed 无法原地改存量行」的限制。

否决的方案：① 写一条 Alembic 数据迁移原地改存量行——只有要改已存在行的 `upstream_model`/价格才需要，本设计用全新 `public_name` 已绕开；② 纯靠 admin API 运行时配置——不可复现、新部署会错、无 source-of-truth。

## 4. seed 机制与数据流

```
启动 run_seed(db)
  → ensure_default_models(db, apimart_provider)
      ① RENAME_ON_BOOT：旧名 → 新名（本次不新增条目）
      ② DISABLE_ON_BOOT：把退役模型行置 disabled + visible=False（仅对当前 status≠disabled 的行生效）
      ③ 增量插入：DEFAULT_MODELS 里 public_name 不存在的行 → 新建（status 默认 active）
  → ensure_deepseek_models(db, deepseek_provider)   # 本次不改
```

`models` 表的 `public_name` 有全局唯一约束。因此 video 的 grok 模型**不能**用 `grok-imagine` 作 `public_name`（已被 image 的 `grok-imagine` 行占用）——`public_name` 取调用名 `grok-imagine-1.0-video-apimart`，`grok-imagine` 只作 `display_name`（`display_name` 无唯一约束）。

## 5. 目标模型目录

### 5.1 Chat（text）— 7 个

| public_name | upstream_model | display_name | display_provider | input_price | output_price | cache_read_price | cache_write_price | max_input_tokens / ctx | status | 处置 |
|---|---|---|---|---|---|---|---|---|---|---|
| deepseek-v4-flash | deepseek-v4-flash | DeepSeek V4 Flash | deepseek | 0.14 | 0.28 | 0.003 | None | 128000 | active | 已接入·不动 |
| deepseek-v4-pro | deepseek-v4-pro | DeepSeek V4 Pro | deepseek | 0.42 | 0.83 | 0.0035 | None | 128000 | active | 已接入·不动 |
| gpt-5.5 | gpt-5.5 | GPT-5.5 | openai | 5.0 | 30.0 | 0.50 | None | 400000 ⚠️ | active | 新增 |
| claude-opus-4.7 | claude-opus-4.7 | Claude Opus 4.7 | anthropic | 5.0 | 25.0 | 0.50 | 6.25 | 1000000 | active | 新增 |
| claude-sonnet-4.6 | claude-sonnet-4.6 | Claude Sonnet 4.6 | anthropic | 3.0 | 15.0 | 0.30 | 3.75 | 200000 | active | 已有·不动 |
| gemini-3.1-pro | gemini-3.1-pro | Gemini 3.1 Pro | gemini | 2.0 | 12.0 | 0.20 | None | 1000000 | active | 新增 |
| gemini-3.5-flash | gemini-3.5-flash | Gemini 3.5 Flash | gemini | 1.5 | 9.0 | 0.15 | None | 1000000 | active | 新增 |

新增 chat 模型其余字段：`type="text"`、`pricing_mode="per_token"`、`capabilities={"stream": true, "tools": true, "vision": true, "ctx": <max_input_tokens>}`、`price_markup` 取列默认 1（seed dict 不写该键）。

`upstream_model` 取与你给的相同的标识名（chat 模型 `public_name == upstream_model`，沿用现有 seed 约定，例如已跑通的 `claude-sonnet-4.6`）。

### 5.2 Image — 不改动

`gpt-image-2`、`nano-banana`、`nano-banana-pro` 保持 active；`grok-imagine`（image，`xai`）保持现状 `disabled`。这 4 行在 `DEFAULT_MODELS` 里**原样保留**。

### 5.3 Video — 2 个

| public_name | upstream_model | display_name | display_provider | pricing_mode | 价格字段 | capabilities | status | 处置 |
|---|---|---|---|---|---|---|---|---|
| veo3.1-fast | veo3.1-fast | veo3.1 | veo | per_second | `video_second_price=0.15` | `{"durations": [4, 8], "aspect_ratios": ["16:9", "9:16"]}` | active | 新增 |
| grok-imagine-1.0-video-apimart | grok-imagine-1.0-video-apimart | grok-imagine | xai | per_second | `video_second_price=0.05` | `{}` ⚠️ | active | 新增 |

两个 video 模型 `type="video"`、`price_markup` 默认 1。`upstream_model` 取与上游文档对齐的调用名；`display_name` 取页面显示名；`public_name` 等于调用名（避免与 image 的 `grok-imagine` 撞唯一约束）。

### 5.4 退役模型

| public_name | 当前状态 | 处置 |
|---|---|---|
| gpt-5 | active | 加入 `DISABLE_ON_BOOT`，从 `DEFAULT_MODELS` 移除 |
| gpt-4o | active | 加入 `DISABLE_ON_BOOT`，从 `DEFAULT_MODELS` 移除 |
| gemini-2.0-flash | active | 加入 `DISABLE_ON_BOOT`，从 `DEFAULT_MODELS` 移除 |
| veo3（上游 `veo-3`） | active | 加入 `DISABLE_ON_BOOT`，从 `DEFAULT_MODELS` 移除 |
| veo3.1（旧，上游 `veo-3.1`） | active | 加入 `DISABLE_ON_BOOT`，从 `DEFAULT_MODELS` 移除 |
| grok-imagine-video（旧，per_generation） | disabled | 仅从 `DEFAULT_MODELS` 移除（已是 disabled，存量行保留） |

退役后 `DISABLE_ON_BOOT` 内容为 `{"sora2", "gpt-5", "gpt-4o", "gemini-2.0-flash", "veo3", "veo3.1"}`（`sora2` 为现有条目）。

旧 `grok-imagine-video` 当前已是 `disabled`，`DISABLE_ON_BOOT` 的判断条件 `status != DISABLED` 对它是 no-op，不必加入；从 `DEFAULT_MODELS` 移除即可（存量库该行保持 disabled，新库不再 seed）。它在存量库里 `visible` 仍可能为 `True`——属既有的小瑕疵，与本次目标无关，不在本设计修复范围内。

## 6. `backend/app/seed.py` 改动

唯一的实质改动文件。

1. **`DEFAULT_MODELS`**：
   - 移除 `gpt-5`、`gpt-4o`、`gemini-2.0-flash`、`veo3`、`veo3.1`、`grok-imagine-video` 六个条目。
   - 保留 `claude-sonnet-4.6`、`gpt-image-2`、`nano-banana`、`nano-banana-pro`、`grok-imagine`(image)。
   - 新增 chat：`gpt-5.5`、`claude-opus-4.7`、`gemini-3.1-pro`、`gemini-3.5-flash`（字段见 §5.1）。
   - 新增 video：`veo3.1-fast`、`grok-imagine-1.0-video-apimart`（字段见 §5.3）。
2. **`DISABLE_ON_BOOT`**：由 `{"sora2"}` 改为 `{"sora2", "gpt-5", "gpt-4o", "gemini-2.0-flash", "veo3", "veo3.1"}`。
3. 顶部注释块按需更新（例如「grok-imagine — flagged disabled」一段已不准确，video grok 现为 active）。
4. `DEEPSEEK_MODELS`、`ensure_deepseek_*`、`run_seed`、`RENAME_ON_BOOT` 不变。

seed 幂等性保持：重复启动不会重复插入，`DISABLE_ON_BOOT` 对已 disabled 行 no-op。

## 7. 错误处理与边界

- **新模型「能调通」**：`upstream_model` 与上游文档对齐，由项目方确认（你已确认「保证能调通」）。若某个新模型 APIMart 实际不提供，调用会透传上游错误——届时 admin 可在后台把该模型置 disabled。
- **长上下文分档定价**：`claude-opus-4.7`（1M 上下文）、`gemini-3.1-pro`（>200K 更高档价）官方有按上下文长度分档的价目；本仓库 `models` 表是单一平价（`input_price`/`output_price`），沿用**标准档（≤200K）**价格。这与已有 `claude-sonnet-4.6`（平价 $3，未体现 Anthropic >200K 档）做法一致，属已知简化，不在本次解决。
- **退役模型的存量请求**：退役模型只软禁用、不删行，`request_log` 的 `model` 外键、`unit_price_snapshot_json` 价格快照（CLAUDE.md 不变量 #9）完全不受影响。已写入的历史日志按快照重算成本，与目录变化无关。
- **veo3.1 显示名 vs 旧 veo3.1 行**：新 video 模型 `public_name=veo3.1-fast`、`display_name=veo3.1`；旧 `veo3.1` 行（`public_name=veo3.1`）被软禁用。两者 `public_name` 不同、无唯一约束冲突；`display_name` 即便文字相近也无唯一约束。

## 8. 测试改动

`gpt-4o` / `gpt-5` 被禁用后，少量集成测试需改用仍 active 的模型（建议统一换 `claude-sonnet-4.6`）：

- `backend/tests/test_gateway_paths.py`：`assert "gpt-4o" in ids` 的 `/v1/models` 列表断言；以及两处 `json={"model": "gpt-4o", ...}` 的 `/v1/chat/completions` 请求。
- `backend/tests/test_messages.py`：`{"model": "gpt-4o", ...}` 的 `/v1/messages` 请求。

**不需要改**的：

- `backend/tests/test_price_snapshot.py`：用 `gpt-4o` 作纯函数 `SimpleNamespace` stub，与 seed 无关。
- `backend/tests/test_token_estimator.py`：`gpt-4o` / `gpt-5` 是传给 tiktoken 的编码选择名（`count_message_tokens` / `estimate_chat_usage`），与目录无关。

可选新增：一条 seed 目录测试，断言整理后 `DEFAULT_MODELS` 的 7 个 chat（含 deepseek）+ 2 个 video 模型存在且 active、退役模型 disabled——具体由实现计划决定。

## 9. 实现期需核对

1. **gpt-5.5 上下文窗口**：暂定 `max_input_tokens=400000`，实现时对 OpenAI 官方文档核实（仅影响 token 估算上限与 UI 展示，非计费正确性）。
2. **grok video 计费模式**：本设计取 `per_second`（xAI 官方按秒计价 $0.05/s）。`per_second` 计费依赖 APIMart 的视频任务结果（`GET /v1/tasks/{id}` 的 `result`）返回视频时长。实现期需核对 APIMart 的 grok 视频响应是否带时长字段：
   - 若带 → 维持 `per_second` `$0.05/s`。
   - 若不带（固定时长片段、无 duration）→ 改为 `pricing_mode="per_generation"`，按官方「每秒价 × 标准片长」折算一个 `generation_price`。
3. **新模型在 APIMart 的调用名**：chat 取 `public_name == upstream_model`（如 `gpt-5.5`、`claude-opus-4.7`、`gemini-3.1-pro`、`gemini-3.5-flash`），与已跑通的 `claude-sonnet-4.6` 同约定；实现/冒烟期对 docs.apimart.ai 核对，若上游用别名只需改对应行的 `upstream_model`。

## 10. 改动文件清单

- **后端**：`backend/app/seed.py`（唯一实质改动）。
- **测试**：`backend/tests/test_gateway_paths.py`、`backend/tests/test_messages.py`（`gpt-4o` → `claude-sonnet-4.6`）；可选新增 seed 目录测试。
- **无改动**：provider 代码、网关 / 计费管线、Alembic、前端（provider chip `openai/anthropic/gemini/xai/veo/deepseek` 已齐，目录数据驱动）、`DESIGN.md`。

## 11. 风险与说明

- **退役模型对前端的影响**：前端模型列表来自 `GET /api/models`（CLAUDE.md 不变量 #6，不硬编码），退役模型禁用后自动从用户侧消失，无需前端改动。
- **新模型 active 但上游未就绪**：本设计把两个 video 与四个 chat 新模型 seed 成 `active`（你已确认能调通）。若个别模型上游暂不可用，调用会失败并透传上游错误；admin 可随时在后台禁用，无需改代码。
- **价格准确性**：seed 价为各家官方列表价；上线后如需让利或加价，由 admin 在后台用 `price_markup` 调整（不改 seed）。
- **幂等性**：`seed.py` 改动后仍幂等——增量插入跳过已存在 `public_name`，`DISABLE_ON_BOOT` 对已 disabled 行 no-op。
