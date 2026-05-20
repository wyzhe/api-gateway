# 模型目录整理 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `backend/app/seed.py` 的默认模型目录整理成约定阵容——chat 收敛到 5 个 APIMart 文本模型（加已接入的 2 个 DeepSeek 共 7 个）、video 换成 `veo3.1-fast` 与 `grok-imagine-1.0-video-apimart`、退役模型软禁用保留。

**Architecture:** 唯一实质改动是 `seed.py` 的 `DEFAULT_MODELS`（增删条目）与 `DISABLE_ON_BOOT`（新增 5 个退役名）。seed 机制不变：按 `public_name` 增量插入 + `DISABLE_ON_BOOT` 软禁用。退役模型只置 `disabled`、不删行，保 `request_logs` 外键与价格快照完整。无 migration、无 provider 改动、无前端改动。

**Tech Stack:** Python、SQLAlchemy 2、pytest（后端）。

**说明：** 计划 2 个 Task。Task 1 先把集成测试里对即将退役的 `gpt-4o` 的依赖换成始终 active 的 `claude-sonnet-4.6`（改动前后都绿）；Task 2 再改 `seed.py`。按 Task 顺序执行可保证每次提交后测试套件都是绿的。

**通用约定：**
- 后端命令在 `backend/` 下执行；pytest 用 `.venv/bin/pytest`。
- 纯函数测试（`test_seed_catalog.py`）无需 DB，到处可跑；带 DB 的集成测试在 Postgres 不可达时自动 skip。
- 金额一律 `Decimal`，禁止 `float` 进入计费路径。

参考设计文档：`docs/superpowers/specs/2026-05-20-model-catalog-refresh-design.md`。

---

## Task 1: 集成测试解除对 `gpt-4o` 的依赖

`gpt-4o` 在 Task 2 会被软禁用。`resolve_model` 对 disabled 模型抛 403，会先于余额/月限判定触发，使 `test_v1_zero_balance_returns_402`、`test_monthly_limit_returns_429` 拿到错误的状态码；`/v1/models` 列表也不再含 `gpt-4o`。本 Task 把这些用例改用始终 active 的 `claude-sonnet-4.6`。`claude-sonnet-4.6` 在改动前后都是 active，故本 Task 单独提交后测试仍全绿。

**Files:**
- Modify: `backend/tests/test_gateway_paths.py:12,39,84`
- Modify: `backend/tests/test_messages.py:9`

- [ ] **Step 1: 改 `test_gateway_paths.py` 的 `/v1/models` 列表断言**

把 `backend/tests/test_gateway_paths.py` 第 12 行：

```python
    assert "gpt-4o" in ids
```

改为：

```python
    assert "claude-sonnet-4.6" in ids
```

- [ ] **Step 2: 改 `test_gateway_paths.py` 的两处 chat 请求体**

`backend/tests/test_gateway_paths.py` 里有两处完全相同的行（第 39 行在 `test_v1_zero_balance_returns_402`、第 84 行在 `test_monthly_limit_returns_429`）：

```python
        json={"model": "gpt-4o", "messages": [{"role": "user", "content": "hi"}]},
```

两处都改为：

```python
        json={"model": "claude-sonnet-4.6", "messages": [{"role": "user", "content": "hi"}]},
```

（用 Edit 工具的 `replace_all` 对上面这条字符串替换即可，两处一致。）

- [ ] **Step 3: 改 `test_messages.py` 的请求体**

把 `backend/tests/test_messages.py` 第 9 行：

```python
    r = client.post("/v1/messages", json={"model": "gpt-4o", "messages": []})
```

改为：

```python
    r = client.post("/v1/messages", json={"model": "claude-sonnet-4.6", "messages": []})
```

- [ ] **Step 4: 跑这两个测试文件确认仍通过**

Run: `cd backend && .venv/bin/pytest tests/test_gateway_paths.py tests/test_messages.py -v`
Expected: 全部 PASS；若本机无 Postgres / Redis，则相关集成用例自动 SKIP（不应出现 FAIL）。

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_gateway_paths.py backend/tests/test_messages.py
git commit -m "test(gateway): use claude-sonnet-4.6 instead of soon-retired gpt-4o"
```

---

## Task 2: 整理 `seed.py` 默认模型目录

**Files:**
- Create: `backend/tests/test_seed_catalog.py`
- Modify: `backend/app/seed.py` (`DEFAULT_MODELS` 列表、`DISABLE_ON_BOOT` 集合)

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_seed_catalog.py`（纯函数，断言 `seed.py` 常量的目录形状，无需 DB）：

```python
"""Default model catalogue — pure-function assertions on seed.py constants.
No DB needed; these check the catalogue shape directly."""
from decimal import Decimal

from app.seed import DEFAULT_MODELS, DISABLE_ON_BOOT


def _by_name(specs):
    return {s["public_name"]: s for s in specs}


def test_text_models_are_the_expected_set():
    text = {s["public_name"] for s in DEFAULT_MODELS if s["type"] == "text"}
    assert text == {
        "gpt-5.5",
        "claude-opus-4.7",
        "claude-sonnet-4.6",
        "gemini-3.1-pro",
        "gemini-3.5-flash",
    }


def test_retired_text_models_are_gone():
    names = {s["public_name"] for s in DEFAULT_MODELS}
    for retired in ("gpt-5", "gpt-4o", "gemini-2.0-flash"):
        assert retired not in names


def test_video_models_are_the_expected_set():
    video = {s["public_name"] for s in DEFAULT_MODELS if s["type"] == "video"}
    assert video == {"veo3.1-fast", "grok-imagine-1.0-video-apimart"}


def test_retired_video_models_are_gone():
    names = {s["public_name"] for s in DEFAULT_MODELS}
    for retired in ("veo3", "veo3.1", "grok-imagine-video"):
        assert retired not in names


def test_image_models_unchanged():
    image = {s["public_name"] for s in DEFAULT_MODELS if s["type"] == "image"}
    assert image == {"gpt-image-2", "nano-banana", "nano-banana-pro", "grok-imagine"}


def test_disable_on_boot_lists_retired_models():
    assert DISABLE_ON_BOOT == {
        "sora2",
        "gpt-5",
        "gpt-4o",
        "gemini-2.0-flash",
        "veo3",
        "veo3.1",
    }


def test_new_chat_models_use_official_prices():
    m = _by_name(DEFAULT_MODELS)
    assert (m["gpt-5.5"]["input_price"], m["gpt-5.5"]["output_price"]) == (
        Decimal("5.0"),
        Decimal("30.0"),
    )
    assert (m["claude-opus-4.7"]["input_price"], m["claude-opus-4.7"]["output_price"]) == (
        Decimal("5.0"),
        Decimal("25.0"),
    )
    assert (m["gemini-3.1-pro"]["input_price"], m["gemini-3.1-pro"]["output_price"]) == (
        Decimal("2.0"),
        Decimal("12.0"),
    )
    assert (m["gemini-3.5-flash"]["input_price"], m["gemini-3.5-flash"]["output_price"]) == (
        Decimal("1.5"),
        Decimal("9.0"),
    )


def test_new_chat_models_cache_prices():
    m = _by_name(DEFAULT_MODELS)
    # OpenAI / Gemini: no separate cache-write fee, only a cache-read price.
    assert m["gpt-5.5"]["cache_write_price"] is None
    assert m["gpt-5.5"]["cache_read_price"] == Decimal("0.50")
    assert m["gemini-3.1-pro"]["cache_read_price"] == Decimal("0.20")
    assert m["gemini-3.5-flash"]["cache_read_price"] == Decimal("0.15")
    # Anthropic: write = 1.25x input, read = 0.1x input.
    assert m["claude-opus-4.7"]["cache_write_price"] == Decimal("6.25")
    assert m["claude-opus-4.7"]["cache_read_price"] == Decimal("0.50")


def test_video_models_use_official_per_second_prices():
    m = _by_name(DEFAULT_MODELS)
    assert m["veo3.1-fast"]["pricing_mode"] == "per_second"
    assert m["veo3.1-fast"]["video_second_price"] == Decimal("0.15")
    assert m["grok-imagine-1.0-video-apimart"]["pricing_mode"] == "per_second"
    assert m["grok-imagine-1.0-video-apimart"]["video_second_price"] == Decimal("0.05")


def test_chat_public_name_equals_upstream_model():
    for s in DEFAULT_MODELS:
        if s["type"] == "text":
            assert s["public_name"] == s["upstream_model"]


def test_video_display_and_upstream_names_match_spec():
    m = _by_name(DEFAULT_MODELS)
    assert m["veo3.1-fast"]["display_name"] == "veo3.1"
    assert m["veo3.1-fast"]["upstream_model"] == "veo3.1-fast"
    assert m["grok-imagine-1.0-video-apimart"]["display_name"] == "grok-imagine"
    assert (
        m["grok-imagine-1.0-video-apimart"]["upstream_model"]
        == "grok-imagine-1.0-video-apimart"
    )
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/bin/pytest tests/test_seed_catalog.py -v`
Expected: FAIL — 当前 `DEFAULT_MODELS` 仍含 `gpt-5` / `gpt-4o` / `gemini-2.0-flash` / `veo3` / `veo3.1`、缺新模型；`DISABLE_ON_BOOT` 仍是 `{"sora2"}`。

- [ ] **Step 3: 替换 `DEFAULT_MODELS` 列表**

在 `backend/app/seed.py` 中，把整个 `DEFAULT_MODELS: list[dict] = [ ... ]` 列表（从 `DEFAULT_MODELS: list[dict] = [` 那一行到对应的闭合 `]`）整体替换为：

```python
DEFAULT_MODELS: list[dict] = [
    # ------------ Text ------------
    {
        "public_name": "gpt-5.5",
        "upstream_model": "gpt-5.5",
        "type": "text",
        "display_name": "GPT-5.5",
        "display_provider": "openai",
        "description": "OpenAI flagship general reasoning model.",
        "pricing_mode": "per_token",
        "input_price": Decimal("5.0"),
        "output_price": Decimal("30.0"),
        "capabilities": {"stream": True, "tools": True, "vision": True, "ctx": 400_000},
        "max_input_tokens": 400_000,
        # OpenAI bills cached input cheaply but has no separate cache-write fee.
        "cache_write_price": None,
        "cache_read_price": Decimal("0.50"),
    },
    {
        "public_name": "claude-opus-4.7",
        "upstream_model": "claude-opus-4.7",
        "type": "text",
        "display_name": "Claude Opus 4.7",
        "display_provider": "anthropic",
        "description": "Anthropic flagship reasoning model.",
        "pricing_mode": "per_token",
        "input_price": Decimal("5.0"),
        "output_price": Decimal("25.0"),
        "capabilities": {"stream": True, "tools": True, "vision": True, "ctx": 1_000_000},
        "max_input_tokens": 1_000_000,
        # Cache pricing per 1M input tokens: write = 1.25x input; read = 0.1x input.
        "cache_write_price": Decimal("6.25"),
        "cache_read_price": Decimal("0.50"),
    },
    {
        "public_name": "claude-sonnet-4.6",
        "upstream_model": "claude-sonnet-4.6",
        "type": "text",
        "display_name": "Claude Sonnet 4.6",
        "display_provider": "anthropic",
        "description": "Anthropic best price/quality balance (2026 refresh).",
        "pricing_mode": "per_token",
        "input_price": Decimal("3.0"),
        "output_price": Decimal("15.0"),
        "capabilities": {"stream": True, "tools": True, "vision": True, "ctx": 200_000},
        "max_input_tokens": 200_000,
        # Cache pricing per 1M input tokens: write = $3.75/1M; read = $0.30/1M.
        "cache_write_price": Decimal("3.75"),
        "cache_read_price": Decimal("0.30"),
    },
    {
        "public_name": "gemini-3.1-pro",
        "upstream_model": "gemini-3.1-pro",
        "type": "text",
        "display_name": "Gemini 3.1 Pro",
        "display_provider": "gemini",
        "description": "Google flagship multimodal reasoning model.",
        "pricing_mode": "per_token",
        "input_price": Decimal("2.0"),
        "output_price": Decimal("12.0"),
        "capabilities": {"stream": True, "tools": True, "vision": True, "ctx": 1_000_000},
        "max_input_tokens": 1_000_000,
        # Standard-context (<=200K) list price; cached input billed at cache_read_price.
        "cache_write_price": None,
        "cache_read_price": Decimal("0.20"),
    },
    {
        "public_name": "gemini-3.5-flash",
        "upstream_model": "gemini-3.5-flash",
        "type": "text",
        "display_name": "Gemini 3.5 Flash",
        "display_provider": "gemini",
        "description": "Google fast multimodal model.",
        "pricing_mode": "per_token",
        "input_price": Decimal("1.5"),
        "output_price": Decimal("9.0"),
        "capabilities": {"stream": True, "tools": True, "vision": True, "ctx": 1_000_000},
        "max_input_tokens": 1_000_000,
        "cache_write_price": None,
        "cache_read_price": Decimal("0.15"),
    },
    # Non-text models do not consume input tokens — max_input_tokens and cache prices are not applicable below.
    # ------------ Image ------------
    {
        "public_name": "gpt-image-2",
        "upstream_model": "gpt-image-2",
        "type": "image",
        "display_name": "GPT-Image-2",
        "display_provider": "openai",
        "description": "OpenAI flagship image model (async via APIMart).",
        "pricing_mode": "per_image",
        "image_price": Decimal("0.04"),
        "capabilities": {"sizes": ["1:1", "16:9", "9:16"], "resolutions": ["1k", "2k", "4k"]},
    },
    {
        "public_name": "nano-banana",
        "upstream_model": "nano-banana",
        "type": "image",
        "display_name": "Nano Banana",
        "display_provider": "gemini",
        "description": "Cheap and fast Google image model.",
        "pricing_mode": "per_image",
        "image_price": Decimal("0.03"),
        "capabilities": {"sizes": ["1:1", "16:9", "9:16"]},
    },
    {
        "public_name": "nano-banana-pro",
        "upstream_model": "nano-banana-pro",
        "type": "image",
        "display_name": "Nano Banana Pro",
        "display_provider": "gemini",
        "description": "Higher fidelity Nano Banana, supports inpainting.",
        "pricing_mode": "per_image",
        "image_price": Decimal("0.06"),
        "capabilities": {"sizes": ["1:1", "16:9", "9:16"]},
    },
    {
        # APIMart docs do not currently list grok image generation — seed disabled.
        "public_name": "grok-imagine",
        "upstream_model": "grok-imagine",
        "type": "image",
        "display_name": "Grok Imagine",
        "display_provider": "xai",
        "description": "xAI image model. Not yet confirmed on APIMart — admin must enable.",
        "pricing_mode": "per_image",
        "image_price": Decimal("0.05"),
        "capabilities": {},
        "status": "disabled",
    },
    # ------------ Video ------------
    # Note: sora2 is not seeded — observed upstream queue times >30 min, not
    # suitable for an interactive playground. It is kept disabled via
    # DISABLE_ON_BOOT for existing DBs; admins can re-add via POST /api/admin/models.
    {
        "public_name": "veo3.1-fast",
        "upstream_model": "veo3.1-fast",
        "type": "video",
        "display_name": "veo3.1",
        "display_provider": "veo",
        "description": "Google Veo 3.1 Fast video model (async).",
        "pricing_mode": "per_second",
        "video_second_price": Decimal("0.15"),
        "capabilities": {"durations": [4, 8], "aspect_ratios": ["16:9", "9:16"]},
    },
    {
        "public_name": "grok-imagine-1.0-video-apimart",
        "upstream_model": "grok-imagine-1.0-video-apimart",
        "type": "video",
        "display_name": "grok-imagine",
        "display_provider": "xai",
        "description": "xAI Grok Imagine video model (async).",
        "pricing_mode": "per_second",
        "video_second_price": Decimal("0.05"),
        "capabilities": {},
    },
]
```

> 实现期核对（来自 spec §9）：
> 1. `gpt-5.5` 的 `ctx` / `max_input_tokens` 暂定 400_000，对 OpenAI 官方文档核实。
> 2. `grok-imagine-1.0-video-apimart` 取 `per_second` $0.05/s。若 APIMart 的 grok 视频任务结果不返回时长，改 `pricing_mode="per_generation"` 并用 `generation_price`（按官方每秒价 × 标准片长折算）替换 `video_second_price`。

- [ ] **Step 4: 更新 `DISABLE_ON_BOOT`**

在 `backend/app/seed.py` 中，把：

```python
# Names we want to keep in the DB (for log FK integrity) but mark disabled.
DISABLE_ON_BOOT: set[str] = {"sora2"}
```

改为：

```python
# Names we want to keep in the DB (for log FK integrity) but mark disabled.
# Retired models: soft-disabled on existing DBs so request_logs FKs / price
# snapshots stay intact. New DBs simply never seed them (absent from DEFAULT_MODELS).
DISABLE_ON_BOOT: set[str] = {
    "sora2",
    "gpt-5",
    "gpt-4o",
    "gemini-2.0-flash",
    "veo3",
    "veo3.1",
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd backend && .venv/bin/pytest tests/test_seed_catalog.py -v`
Expected: 全部 PASS。

- [ ] **Step 6: 验证 app 可导入**

Run: `cd backend && .venv/bin/python -c "import app.main, app.seed"`
Expected: 无 import 错误。

- [ ] **Step 7: Commit**

```bash
git add backend/app/seed.py backend/tests/test_seed_catalog.py
git commit -m "feat(seed): refresh default model catalogue (chat/video lineup + retire old models)"
```

---

## 最终验证

- [ ] **后端全量测试**

Run: `cd backend && .venv/bin/pytest -q`
Expected: 全绿——`test_seed_catalog.py` 等纯函数测试必过；无 DB / Redis 的环境里集成测试自动 skip（不应有 FAIL）。

- [ ] **后端 lint**

Run: `ruff check backend/app/seed.py backend/tests/test_seed_catalog.py`
Expected: 无报错。

- [ ] **seed 冒烟（有 Postgres 时）**

Run: `cd backend && .venv/bin/python -c "from app.database import SessionLocal; from app.seed import run_seed; from app.models import ModelRow; db=SessionLocal(); run_seed(db); rows={m.public_name: (m.status, m.visible) for m in db.query(ModelRow).all()}; print('new chat ok:', all(rows.get(n, (None,))[0]=='active' for n in ['gpt-5.5','claude-opus-4.7','claude-sonnet-4.6','gemini-3.1-pro','gemini-3.5-flash'])); print('new video ok:', all(rows.get(n, (None,))[0]=='active' for n in ['veo3.1-fast','grok-imagine-1.0-video-apimart'])); print('retired disabled:', all(rows.get(n, ('active',))[0]=='disabled' for n in ['gpt-5','gpt-4o','gemini-2.0-flash','veo3','veo3.1'] if n in rows)); db.close()"`
Expected: 三行均打印 `True`。Postgres 不可达则在有 DB 的环境补跑。

- [ ] **手动冒烟（有 DB + Redis + 真实 APIMART_API_KEY 时）**

启动后端，给测试用户充值，用 `sk-` key 调一个新 chat 模型（如 `POST /v1/chat/completions`，`model=gpt-5.5`）确认能调通、`request_logs` 落一条 `cost>0`；调一个新 video 模型（`model=veo3.1-fast`）确认返回 `task_id`。若某新模型上游不可用，admin 可在后台置 disabled。

---

## 风险与说明

- **每次提交都绿**：Task 1 把测试改用 `claude-sonnet-4.6`（改动前后都 active），Task 2 才禁用 `gpt-4o`——两次提交后测试套件都不会 FAIL。
- **退役模型向后兼容**：退役模型只软禁用、不删行。`request_log` 的 `model` 外键与 `unit_price_snapshot_json` 价格快照（CLAUDE.md 不变量 #9）完全不受影响。
- **幂等性**：`seed.py` 改动后仍幂等——增量插入跳过已存在 `public_name`，`DISABLE_ON_BOOT` 对已 disabled 行 no-op。
- **DeepSeek 不动**：`DEEPSEEK_MODELS`、`ensure_deepseek_*`、`run_seed` 保持原样。
- **前端无改动**：模型目录是 `GET /api/models` 数据驱动（CLAUDE.md 不变量 #6），provider chip（openai/anthropic/gemini/xai/veo/deepseek）已齐，退役模型禁用后自动从用户侧消失。
