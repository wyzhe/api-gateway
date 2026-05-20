# DeepSeek 接入 + 每模型价格倍率 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 DeepSeek 接为第二个上游 provider（`deepseek-v4-flash` / `deepseek-v4-pro`，同时支持 `/v1/chat/completions` 与 `/v1/messages`），并新增每模型 `price_markup` 价格倍率。

**Architecture:** 独立 `DeepSeekProvider(BaseProvider)`，SSE 行解析抽到共享 `_sse.py`；`build_provider()` 按 `provider.name` 分发。价格倍率是 `models` 表新列，在 `cost_service` 的实际计费 / 预授权估算 / 快照重算三处一致叠加。

**Tech Stack:** FastAPI、SQLAlchemy 2、Alembic、httpx、pytest（后端）；Vite + React 19 + TS（前端）。

**说明：** 计划分四部分。Part A（价格倍率后端）+ Part B（价格倍率前端）与 Part C（DeepSeek 后端）+ Part D（DeepSeek 前端/文档）相互独立，可分别交付。建议按 Task 顺序执行（Task 10 的 seed 依赖 Task 1 的新列）。

**通用约定：**
- 后端命令在 `backend/` 下执行；pytest 用 `.venv/bin/pytest`。纯函数测试无需 DB；带 DB 的测试在 Postgres 不可达时自动 skip。
- 前端命令在 `frontend/` 下执行；验证用 `npm run build`（内含 `tsc -b`，类型错误会 fail）。
- 金额一律 `Decimal`，禁止 `float` 进入计费路径。

---

## Part A — 价格倍率（后端）

### Task 1: `models` 表新增 `price_markup` 列 + Alembic migration

**Files:**
- Modify: `backend/app/models/model.py`
- Create: `backend/alembic/versions/d4e5f6a7b8c9_model_price_markup.py`

- [ ] **Step 1: 给 `ModelRow` 加列**

在 `backend/app/models/model.py` 中，`generation_price` 那一行之后、`cache_write_price` 之前的合适位置（与其它定价列放一起即可）加入：

```python
    # Per-model price multiplier. Charged cost = base cost × price_markup.
    # Always positive; 1 = no markup. NOT NULL with DB default 1.
    price_markup: Mapped[Decimal] = mapped_column(
        Numeric(18, 8), nullable=False, default=Decimal("1"), server_default="1"
    )
```

`Decimal` 与 `Numeric` 已在该文件 import，无需新增 import。

- [ ] **Step 2: 写 migration**

创建 `backend/alembic/versions/d4e5f6a7b8c9_model_price_markup.py`：

```python
"""model price_markup

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-05-20 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'models',
        sa.Column('price_markup', sa.Numeric(18, 8), nullable=False, server_default='1'),
    )


def downgrade() -> None:
    op.drop_column('models', 'price_markup')
```

- [ ] **Step 3: 应用 migration（需 Postgres）**

Run: `cd backend && alembic upgrade head`
Expected: 无报错；`alembic current` 显示 `d4e5f6a7b8c9`。若 Postgres 不可达，跳过本步，在有 DB 的环境补跑。

- [ ] **Step 4: 验证 app 可导入**

Run: `cd backend && .venv/bin/python -c "import app.main"`
Expected: 无 import 错误。

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/model.py backend/alembic/versions/d4e5f6a7b8c9_model_price_markup.py
git commit -m "feat(models): add price_markup column to models table"
```

---

### Task 2: `cost_service` 叠加价格倍率

**Files:**
- Modify: `backend/app/services/cost_service.py`
- Create: `backend/tests/test_price_markup.py`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_price_markup.py`：

```python
"""Per-model price_markup multiplier — pure-function tests. No DB needed."""
from decimal import Decimal
from types import SimpleNamespace

from app.services import cost_service


def _model(markup, **kw):
    base = dict(
        input_price=None, output_price=None, image_price=None,
        video_second_price=None, generation_price=None,
        cache_write_price=None, cache_read_price=None,
        price_markup=Decimal(markup),
    )
    base.update(kw)
    return SimpleNamespace(**base)


def test_text_cost_applies_markup():
    m = _model("2", input_price=Decimal("3"), output_price=Decimal("15"))
    cost, missing = cost_service.calc_text_cost(m, prompt_tokens=1000, completion_tokens=2000)
    # base = 1000/1M*3 + 2000/1M*15 = 0.033 ; ×2 = 0.066
    assert cost == Decimal("0.066")
    assert missing is False


def test_markup_one_is_identity():
    m = _model("1", input_price=Decimal("3"), output_price=Decimal("15"))
    cost, _ = cost_service.calc_text_cost(m, 1000, 2000)
    assert cost == Decimal("0.033")


def test_estimate_applies_markup():
    m = _model("1.5", input_price=Decimal("1"), output_price=Decimal("2"))
    cost = cost_service.estimate_text_cost_upper_bound(m, 1000, 5000)
    # base = 1000/1M*1 + 5000/1M*2 = 0.011 ; ×1.5 = 0.0165
    assert cost == Decimal("0.0165")


def test_cache_cost_applies_markup():
    m = _model("2", input_price=Decimal("3"), output_price=Decimal("15"),
               cache_read_price=Decimal("0.3"))
    cost, _ = cost_service.calc_text_cost_with_cache(
        m, prompt_tokens=1000, completion_tokens=500,
        cached_tokens=200, cache_creation_tokens=0,
    )
    base = (
        Decimal("800") / Decimal("1000000") * Decimal("3")
        + Decimal("200") / Decimal("1000000") * Decimal("0.3")
        + Decimal("500") / Decimal("1000000") * Decimal("15")
    )
    assert cost == base * Decimal("2")


def test_image_cost_applies_markup():
    m = _model("3", image_price=Decimal("0.04"))
    cost, _ = cost_service.calc_image_cost(m, image_count=2)
    assert cost == Decimal("0.24")  # 0.04*2*3


def test_video_cost_applies_markup():
    m = _model("2", video_second_price=Decimal("0.40"))
    cost, _ = cost_service.calc_video_cost(m, duration_seconds=8)
    assert cost == Decimal("6.4")  # 0.40*8*2


def test_snapshot_includes_markup():
    m = SimpleNamespace(
        id=1, public_name="x", upstream_model="x", type="text",
        pricing_mode="per_token", input_price=Decimal("3"), output_price=Decimal("15"),
        cache_write_price=None, cache_read_price=None, image_price=None,
        video_second_price=None, generation_price=None, price_markup=Decimal("2.5"),
    )
    snap = cost_service.price_snapshot(m)
    assert snap["price_markup"] == "2.5"


def test_recompute_from_snapshot_applies_markup():
    snap = {"input_price": "3.0", "output_price": "15.0", "price_markup": "2"}
    cost = cost_service.recompute_text_cost_from_snapshot(snap, 1000, 2000)
    assert cost == Decimal("0.066")


def test_recompute_from_snapshot_missing_markup_is_identity():
    """Old request_log snapshots predate the column → treated as 1.0."""
    snap = {"input_price": "3.0", "output_price": "15.0"}
    cost = cost_service.recompute_text_cost_from_snapshot(snap, 1000, 2000)
    assert cost == Decimal("0.033")
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/bin/pytest tests/test_price_markup.py -v`
Expected: FAIL — `snap["price_markup"]` KeyError、markup 未生效导致断言不等。

- [ ] **Step 3: 实现倍率逻辑**

在 `backend/app/services/cost_service.py` 中：

(a) 在 `MILLION` 常量之后加入 helper：

```python
def _markup(model: Any) -> Decimal:
    """Per-model price multiplier. Returns 1 for stubs/None so non-ModelRow
    callers (tests) and pre-column rows never crash or zero out a price."""
    mk = getattr(model, "price_markup", None)
    return mk if isinstance(mk, Decimal) else Decimal("1")
```

(b) `calc_text_cost`：把结尾 `return cost, False` 改为：

```python
    return cost * _markup(model), False
```

(c) `calc_text_cost_with_cache`：把结尾 `return cost, False` 改为：

```python
    return cost * _markup(model), False
```

(d) `calc_image_cost`：把 `return Decimal(per) * Decimal(image_count or 1), False` 改为：

```python
    return Decimal(per) * Decimal(image_count or 1) * _markup(model), False
```

(e) `calc_video_cost`：两个含成本的 return 都乘倍率：

```python
    if model.video_second_price is not None and duration_seconds is not None:
        d = duration_seconds if isinstance(duration_seconds, Decimal) else Decimal(str(duration_seconds))
        return Decimal(model.video_second_price) * d * _markup(model), False
    if model.generation_price is not None:
        return Decimal(model.generation_price) * _markup(model), False
    return Decimal("0"), True
```

(f) `estimate_text_cost_upper_bound`：把结尾 `return cost` 改为 `return cost * _markup(model)`。

(g) `estimate_image_cost_upper_bound`：把 `return Decimal(per) * Decimal(max(image_count, 1))` 改为 `return Decimal(per) * Decimal(max(image_count, 1)) * _markup(model)`。

(h) `estimate_video_cost_upper_bound`：两个含成本的 return 都乘 `_markup(model)`：

```python
    if model.video_second_price is not None:
        d = Decimal(requested_duration_seconds or 60)
        return Decimal(model.video_second_price) * d * _markup(model)
    if model.generation_price is not None:
        return Decimal(model.generation_price) * _markup(model)
    return Decimal("0")
```

(i) `price_snapshot`：在返回的 dict 里加一项（放在 `generation_price` 之后）：

```python
        "price_markup": s(_markup(model)),
```

(j) `recompute_text_cost_from_snapshot`：在 `return _compute_cache_cost(...)` 之前读出倍率并在结果上叠加：

```python
    markup_raw = snapshot.get("price_markup")
    markup = Decimal(markup_raw) if markup_raw is not None else Decimal("1")
    base = _compute_cache_cost(
        input_p=ip,
        output_p=op,
        cw=Decimal(cw) if cw is not None else None,
        cr=Decimal(cr) if cr is not None else None,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        cached_tokens=cached_tokens,
        cache_creation_tokens=cache_creation_tokens,
    )
    return base * markup
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/bin/pytest tests/test_price_markup.py tests/test_cost.py tests/test_cost_service_cache.py tests/test_price_snapshot.py -v`
Expected: 全部 PASS。`test_cost.py` / `test_cost_service_cache.py` / `test_price_snapshot.py` 的旧用例不受影响（其 model stub 无 `price_markup` → `_markup` 返回 1.0；旧快照 dict 无该键 → recompute 按 1.0）。

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/cost_service.py backend/tests/test_price_markup.py
git commit -m "feat(billing): apply per-model price_markup in cost/estimate/snapshot"
```

---

### Task 3: model schema 与 API 暴露 `price_markup`

**Files:**
- Modify: `backend/app/schemas/model.py`
- Modify: `backend/app/api/models.py:11-38` (`_to_out`)

- [ ] **Step 1: schema 加字段**

在 `backend/app/schemas/model.py`：

`ModelOut`（在 `generation_price` 之后、`created_at` 之前）加：

```python
    price_markup: Decimal
```

`ModelCreate`（在 `generation_price` 之后）加：

```python
    price_markup: Decimal = Field(default=Decimal("1"), gt=0)
```

`ModelUpdate`（在 `generation_price` 之后）加：

```python
    price_markup: Decimal | None = Field(default=None, gt=0)
```

- [ ] **Step 2: `_to_out` 带上字段**

在 `backend/app/api/models.py` 的 `_to_out()` 里，`generation_price=row.generation_price,` 之后加：

```python
        price_markup=row.price_markup,
```

`admin_create_model`（`ModelRow(**payload.model_dump())`）与 `admin_update_model`（`payload.model_dump(exclude_unset=True)` 通用 setattr）会自动贯通新字段，无需改 `admin.py`；PATCH 的审计 before/after 也自动覆盖。

- [ ] **Step 3: 验证 app 可导入并跑回归**

Run: `cd backend && .venv/bin/pytest tests/test_cost.py tests/test_price_markup.py -q && .venv/bin/python -c "import app.main"`
Expected: 测试 PASS，import 无错误。

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/model.py backend/app/api/models.py
git commit -m "feat(models): expose price_markup in model schemas and API"
```

---

## Part B — 价格倍率（前端）

### Task 4: 前端 `Model` 类型、有效价展示、后台倍率输入框

**Files:**
- Modify: `frontend/src/lib/types.ts:3-25` (`Model`)
- Modify: `frontend/src/lib/utils.ts:62-92` (`PricedModel` + `priceLabel`)
- Modify: `frontend/src/pages/admin/models.tsx`
- Modify: `frontend/src/lib/i18n/dict-zh.ts`, `frontend/src/lib/i18n/dict-en.ts`

- [ ] **Step 1: `Model` 类型加字段**

在 `frontend/src/lib/types.ts` 的 `Model` 类型里，`generation_price: string | null;` 之后加：

```ts
  price_markup: string;
```

- [ ] **Step 2: `PricedModel` 加字段 + `priceLabel` 显示有效价**

在 `frontend/src/lib/utils.ts`：

`PricedModel` 类型里 `generation_price?: string | null;` 之后加：

```ts
  price_markup?: string | null;
```

在 `priceLabel` 函数之前加 helper：

```ts
/** Multiply a base price string by the model's markup; returns a display string. */
function applyMarkup(price: string | null | undefined, markup: string | null | undefined): string {
  if (price == null) return "0";
  const m = markup == null ? 1 : Number(markup);
  const factor = Number.isFinite(m) && m > 0 ? m : 1;
  const v = Number(price) * factor;
  return Number.isFinite(v) ? parseFloat(v.toFixed(8)).toString() : "0";
}
```

把整个 `priceLabel` 函数体替换为（用有效价 = 基础价 × 倍率）：

```ts
export function priceLabel(m: PricedModel): string {
  const p = (v: string | null | undefined) => applyMarkup(v, m.price_markup);
  switch (m.pricing_mode) {
    case "per_token": {
      const base = `$${p(m.input_price)} in · $${p(m.output_price)} out / 1M`;
      if (m.cache_write_price || m.cache_read_price) {
        const cw = p(m.cache_write_price ?? m.input_price);
        const cr = p(m.cache_read_price ?? m.input_price);
        return `${base} (cache: $${cw} w · $${cr} r)`;
      }
      return `${base} tokens`;
    }
    case "per_image":
      return `$${p(m.image_price ?? m.generation_price)} / image`;
    case "per_second":
      return `$${p(m.video_second_price)} / second`;
    case "per_generation":
      return `$${p(m.generation_price)} / generation`;
    default:
      return "—";
  }
}
```

- [ ] **Step 3: i18n 加倍率字段标签**

在 `frontend/src/lib/i18n/dict-zh.ts` 的 `cacheReadPriceLabel` 那一行之后加：

```ts
        markupLabel: "价格倍率（实际计费 = 单价 × 倍率，1 = 不加价）",
```

在 `frontend/src/lib/i18n/dict-en.ts` 的 `cacheReadPriceLabel` 那一行之后加：

```ts
        markupLabel: "Price markup (charged = price × markup, 1 = none)",
```

- [ ] **Step 4: 后台模型编辑表单加倍率输入框**

在 `frontend/src/pages/admin/models.tsx`：

(a) `ModelFormState` 类型里 `generation_price: string;` 之后加 `price_markup: string;`。

(b) `emptyForm()` 返回对象里 `generation_price: "",` 之后加 `price_markup: "1",`。

(c) `startEdit` 的回填块（`generation_price: m.generation_price ?? "",` 那一行）之后加：

```ts
    price_markup: m.price_markup ?? "1",
```

(d) 提交 value 构造块（`generation_price: f.generation_price.trim() || null,` 那一行）之后加：

```ts
      price_markup: f.price_markup.trim() || "1",
```

(e) 在 `pricingFields()` 内，加一个对所有 `pricing_mode` 都显示的倍率输入框（放在该函数返回的字段片段最前面，使其在每种计价模式下都可见）：

```tsx
          <FormField label={t("admin.models.dialog.markupLabel")}>
            <Input value={form.price_markup} onChange={(e) => set("price_markup", e.target.value)} />
          </FormField>
```

- [ ] **Step 5: 构建验证**

Run: `cd frontend && npm run build`
Expected: `tsc -b` 无类型错误，构建成功。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/utils.ts frontend/src/pages/admin/models.tsx frontend/src/lib/i18n/dict-zh.ts frontend/src/lib/i18n/dict-en.ts
git commit -m "feat(ui): show markup-effective price and add markup field to admin model form"
```

---

## Part C — DeepSeek provider（后端）

### Task 5: DeepSeek 配置项

**Files:**
- Modify: `backend/app/config.py:40-44`

- [ ] **Step 1: 加 Settings 字段**

在 `backend/app/config.py` 的 `apimart_timeout_write` 那一行之后加：

```python
    deepseek_api_key: str = Field(default="")
    deepseek_base_url: str = Field(default="https://api.deepseek.com")
    deepseek_timeout_connect: float = Field(default=10.0)
    deepseek_timeout_read: float = Field(default=120.0)
    deepseek_timeout_write: float = Field(default=30.0)
```

环境变量 `DEEPSEEK_API_KEY` 已存在于 `.env`；其余取默认值即可。

- [ ] **Step 2: 验证**

Run: `cd backend && .venv/bin/python -c "from app.config import get_settings; s=get_settings(); print(bool(s.deepseek_base_url))"`
Expected: 打印 `True`，无错误。

- [ ] **Step 3: Commit**

```bash
git add backend/app/config.py
git commit -m "feat(config): add DeepSeek upstream settings"
```

---

### Task 6: 共享 SSE 行解析 `_sse.py` + APIMart 改用

**Files:**
- Create: `backend/app/providers/_sse.py`
- Modify: `backend/app/providers/apimart.py`
- Create: `backend/tests/test_sse.py`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_sse.py`：

```python
"""Shared SSE line parser — pure-function tests."""
from app.providers._sse import parse_sse_line


def test_empty_line_is_chunk_boundary():
    c = parse_sse_line("")
    assert c.raw_line == b"\n"
    assert c.parsed is None


def test_comment_line_forwarded_unparsed():
    c = parse_sse_line(": keep-alive")
    assert c.raw_line == b": keep-alive\n"
    assert c.parsed is None


def test_data_line_parsed():
    c = parse_sse_line('data: {"a": 1}')
    assert c.raw_line == b'data: {"a": 1}\n'
    assert c.parsed == {"a": 1}


def test_done_sentinel_forwarded_unparsed():
    c = parse_sse_line("data: [DONE]")
    assert c.raw_line == b"data: [DONE]\n"
    assert c.parsed is None


def test_malformed_json_forwarded_unparsed():
    c = parse_sse_line("data: {not json}")
    assert c.raw_line == b"data: {not json}\n"
    assert c.parsed is None
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/bin/pytest tests/test_sse.py -v`
Expected: FAIL — `ModuleNotFoundError: app.providers._sse`。

- [ ] **Step 3: 实现 `_sse.py`**

创建 `backend/app/providers/_sse.py`：

```python
"""Shared SSE line parsing for OpenAI / Anthropic-style streaming responses.

Both APIMart and DeepSeek forward upstream SSE byte-faithfully and only parse
`data:` lines for usage extraction. This module is the single home for that
line-level parsing.
"""
from __future__ import annotations

import json

from .base import ProviderStreamChunk


def parse_sse_line(raw_line: str) -> ProviderStreamChunk:
    """Turn one decoded SSE line into a ProviderStreamChunk.

    - empty line       -> chunk boundary (b"\\n")
    - comment (`:`) line -> forwarded verbatim, not parsed
    - `data: {...}` line -> forwarded verbatim, parsed when valid JSON
      (the `[DONE]` sentinel is forwarded but not parsed)
    """
    if raw_line == "":
        return ProviderStreamChunk(raw_line=b"\n", parsed=None)
    if raw_line.startswith(":"):
        return ProviderStreamChunk(raw_line=(raw_line + "\n").encode(), parsed=None)
    parsed = None
    if raw_line.startswith("data: "):
        data_str = raw_line[6:]
        if data_str != "[DONE]":
            try:
                parsed = json.loads(data_str)
            except Exception:
                parsed = None
    return ProviderStreamChunk(raw_line=(raw_line + "\n").encode(), parsed=parsed)
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/bin/pytest tests/test_sse.py -v`
Expected: 全部 PASS。

- [ ] **Step 5: APIMart 改用共享解析**

在 `backend/app/providers/apimart.py`：

(a) 在 `from .base import ...` 那一行之后加 import：

```python
from ._sse import parse_sse_line
```

(b) `chat_completions_stream` 里，把 `async for raw_line in resp.aiter_lines():` 之后那段逐行处理（从 `if raw_line == "":` 到方法末尾的 `yield ProviderStreamChunk(raw_line=(raw_line + "\n").encode(), parsed=parsed,)`）整体替换为：

```python
            async for raw_line in resp.aiter_lines():
                yield parse_sse_line(raw_line)
```

(c) `messages_stream` 里做同样替换：把 `async for raw_line in resp.aiter_lines():` 之后的逐行处理块（含 `# Anthropic SSE events ...` 注释那段）替换为：

```python
            async for raw_line in resp.aiter_lines():
                yield parse_sse_line(raw_line)
```

两个方法开头的 `if resp.status_code != 200:` 错误分支（`yield ProviderStreamChunk(raw_line=b"data: " + err ...)`）保持不变；`ProviderStreamChunk` 的 import 仍需保留。

- [ ] **Step 6: 跑相关测试**

Run: `cd backend && .venv/bin/pytest tests/test_apimart.py tests/test_sse.py -v`
Expected: 全部 PASS（行为等价的纯提取）。

- [ ] **Step 7: Commit**

```bash
git add backend/app/providers/_sse.py backend/app/providers/apimart.py backend/tests/test_sse.py
git commit -m "refactor(providers): extract shared SSE line parser"
```

---

### Task 7: `DeepSeekProvider`

**Files:**
- Create: `backend/app/providers/deepseek.py`
- Create: `backend/tests/test_deepseek_provider.py`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_deepseek_provider.py`：

```python
"""DeepSeek provider adapter — no network, URL/header/parsing checks only."""
from app.providers.deepseek import DeepSeekProvider, PATH_CHAT, PATH_MESSAGES


def _p() -> DeepSeekProvider:
    return DeepSeekProvider(base_url="https://api.deepseek.com", api_key="fake")


def test_name_is_deepseek():
    assert DeepSeekProvider.name == "deepseek"


def test_chat_url():
    assert _p()._url(PATH_CHAT) == "https://api.deepseek.com/chat/completions"


def test_messages_url_uses_anthropic_path():
    assert _p()._url(PATH_MESSAGES) == "https://api.deepseek.com/anthropic/v1/messages"


def test_base_url_trailing_slash_stripped():
    p = DeepSeekProvider(base_url="https://api.deepseek.com/", api_key="k")
    assert p._url(PATH_CHAT) == "https://api.deepseek.com/chat/completions"


def test_chat_headers_use_bearer():
    h = _p()._chat_headers()
    assert h["Authorization"] == "Bearer fake"


def test_messages_headers_use_x_api_key():
    h = _p()._messages_headers()
    assert h["x-api-key"] == "fake"
    assert "anthropic-version" in h
    assert "Authorization" not in h


def test_image_generation_not_implemented():
    import asyncio

    try:
        asyncio.run(_p().image_generation({}))
        raise AssertionError("expected NotImplementedError")
    except NotImplementedError:
        pass
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/bin/pytest tests/test_deepseek_provider.py -v`
Expected: FAIL — `ModuleNotFoundError: app.providers.deepseek`。

- [ ] **Step 3: 实现 `deepseek.py`**

创建 `backend/app/providers/deepseek.py`：

```python
"""DeepSeek provider adapter.

ALL DeepSeek-specific knowledge lives in this file. DeepSeek exposes an
OpenAI-compatible Chat Completions API and an Anthropic-compatible Messages
API on separate base paths:
  - Chat:     POST {base}/chat/completions       (OpenAI format, sync + SSE)
  - Messages: POST {base}/anthropic/v1/messages  (Anthropic format, sync + SSE)
DeepSeek has no image/video generation — those BaseProvider methods are left
unimplemented (they raise NotImplementedError).

Docs (verified 2026-05): https://api-docs.deepseek.com/
"""
from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import httpx

from ..config import get_settings
from ..metrics import upstream_latency_ms
from ._sse import parse_sse_line
from .base import BaseProvider, ProviderResponse, ProviderStreamChunk

PATH_CHAT = "/chat/completions"
PATH_MESSAGES = "/anthropic/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"

_HTTPX_CLIENT: httpx.AsyncClient | None = None


def _client() -> httpx.AsyncClient:
    global _HTTPX_CLIENT
    if _HTTPX_CLIENT is None:
        settings = get_settings()
        timeout = httpx.Timeout(
            connect=settings.deepseek_timeout_connect,
            read=settings.deepseek_timeout_read,
            write=settings.deepseek_timeout_write,
            pool=10.0,
        )
        limits = httpx.Limits(max_keepalive_connections=20, max_connections=100, keepalive_expiry=30.0)
        transport = httpx.AsyncHTTPTransport(retries=2)
        _HTTPX_CLIENT = httpx.AsyncClient(timeout=timeout, limits=limits, transport=transport)
    return _HTTPX_CLIENT


async def close_client() -> None:
    global _HTTPX_CLIENT
    if _HTTPX_CLIENT is not None:
        try:
            await _HTTPX_CLIENT.aclose()
        except Exception:
            pass
        _HTTPX_CLIENT = None


class DeepSeekProvider(BaseProvider):
    name = "deepseek"

    def __init__(self, base_url: str, api_key: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    def _chat_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def _messages_headers(self) -> dict[str, str]:
        return {
            "x-api-key": self.api_key,
            "anthropic-version": ANTHROPIC_VERSION,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    @staticmethod
    def _request_id(resp: httpx.Response) -> str | None:
        for h in ("x-request-id", "x-ds-request-id"):
            if h in resp.headers:
                return resp.headers[h]
        return None

    # ---------------- Chat (OpenAI format) ----------------

    async def chat_completions(
        self,
        payload: dict[str, Any],
        *,
        stream: bool = False,
    ) -> ProviderResponse:
        with upstream_latency_ms.labels(provider=self.name, operation="chat").time():
            resp = await _client().post(
                self._url(PATH_CHAT),
                headers=self._chat_headers(),
                json={**payload, "stream": False},
            )
        body = resp.json() if resp.content else {}
        return ProviderResponse(
            http_status=resp.status_code,
            body=body,
            upstream_request_id=self._request_id(resp),
        )

    async def chat_completions_stream(
        self,
        payload: dict[str, Any],
    ) -> AsyncIterator[ProviderStreamChunk]:
        body = {**payload, "stream": True}
        opts = dict(body.get("stream_options") or {})
        opts.setdefault("include_usage", True)
        body["stream_options"] = opts

        async with _client().stream(
            "POST",
            self._url(PATH_CHAT),
            headers={**self._chat_headers(), "Accept": "text/event-stream"},
            json=body,
        ) as resp:
            if resp.status_code != 200:
                err = await resp.aread()
                yield ProviderStreamChunk(
                    raw_line=b"data: " + err + b"\n\n",
                    parsed={"_error": True, "_http": resp.status_code, "body": err.decode(errors="replace")},
                )
                return
            async for raw_line in resp.aiter_lines():
                yield parse_sse_line(raw_line)

    # ---------------- Anthropic Messages API ----------------

    async def messages(self, payload: dict[str, Any]) -> ProviderResponse:
        with upstream_latency_ms.labels(provider=self.name, operation="messages").time():
            resp = await _client().post(
                self._url(PATH_MESSAGES),
                headers=self._messages_headers(),
                json={**payload, "stream": False},
            )
        body = resp.json() if resp.content else {}
        return ProviderResponse(
            http_status=resp.status_code,
            body=body,
            upstream_request_id=self._request_id(resp),
        )

    async def messages_stream(
        self,
        payload: dict[str, Any],
    ) -> AsyncIterator[ProviderStreamChunk]:
        body = {**payload, "stream": True}
        async with _client().stream(
            "POST",
            self._url(PATH_MESSAGES),
            headers={**self._messages_headers(), "Accept": "text/event-stream"},
            json=body,
        ) as resp:
            if resp.status_code != 200:
                err = await resp.aread()
                yield ProviderStreamChunk(
                    raw_line=b"data: " + err + b"\n\n",
                    parsed={"_error": True, "_http": resp.status_code, "body": err.decode(errors="replace")},
                )
                return
            async for raw_line in resp.aiter_lines():
                yield parse_sse_line(raw_line)
```

> 实现期核对：DeepSeek anthropic 端点的鉴权头（当前用 `x-api-key` + `anthropic-version`，对照 https://api-docs.deepseek.com/ 的 Anthropic API 章节）。若文档要求 `Authorization: Bearer`，改 `_messages_headers()` 即可——其它代码不变。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/bin/pytest tests/test_deepseek_provider.py -v`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/app/providers/deepseek.py backend/tests/test_deepseek_provider.py
git commit -m "feat(providers): add DeepSeekProvider (chat + anthropic messages)"
```

---

### Task 8: provider 注册 + `build_provider` 分发 + 关闭 client

**Files:**
- Modify: `backend/app/providers/__init__.py`
- Modify: `backend/app/services/gateway_service.py:85-91` (`build_provider`)
- Modify: `backend/app/main.py:28,69` 和 `backend/app/worker.py:26,38-39`
- Modify: `backend/tests/test_deepseek_provider.py` (追加 dispatch 测试)

- [ ] **Step 1: 追加失败测试**

在 `backend/tests/test_deepseek_provider.py` 末尾追加：

```python
def test_build_provider_dispatches_deepseek(monkeypatch):
    from types import SimpleNamespace

    from app.providers import DeepSeekProvider
    from app.services import gateway_service

    monkeypatch.setattr(gateway_service.settings, "deepseek_api_key", "fake-key")
    prov = SimpleNamespace(name="deepseek", base_url="https://api.deepseek.com")
    built = gateway_service.build_provider(prov)
    assert isinstance(built, DeepSeekProvider)


def test_build_provider_deepseek_missing_key_raises_500(monkeypatch):
    from types import SimpleNamespace

    from fastapi import HTTPException

    from app.services import gateway_service

    monkeypatch.setattr(gateway_service.settings, "deepseek_api_key", "")
    prov = SimpleNamespace(name="deepseek", base_url="https://api.deepseek.com")
    try:
        gateway_service.build_provider(prov)
        raise AssertionError("expected HTTPException")
    except HTTPException as e:
        assert e.status_code == 500


def test_build_provider_unknown_raises_501():
    from types import SimpleNamespace

    from fastapi import HTTPException

    from app.services import gateway_service

    prov = SimpleNamespace(name="nope", base_url="x")
    try:
        gateway_service.build_provider(prov)
        raise AssertionError("expected HTTPException")
    except HTTPException as e:
        assert e.status_code == 501
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/bin/pytest tests/test_deepseek_provider.py -k build_provider -v`
Expected: FAIL — `build_provider` 对 `deepseek` 仍抛 501（`isinstance` 断言失败）。

- [ ] **Step 3: 重写 `providers/__init__.py`**

把 `backend/app/providers/__init__.py` 全文替换为：

```python
from .apimart import APIMartProvider
from .apimart import close_client as _close_apimart
from .base import BaseProvider, ProviderResponse, ProviderStreamChunk
from .deepseek import DeepSeekProvider
from .deepseek import close_client as _close_deepseek


async def close_all_clients() -> None:
    """Close every provider's module-global httpx client. Called on app/worker shutdown."""
    await _close_apimart()
    await _close_deepseek()


__all__ = [
    "APIMartProvider",
    "DeepSeekProvider",
    "BaseProvider",
    "ProviderResponse",
    "ProviderStreamChunk",
    "close_all_clients",
]
```

- [ ] **Step 4: `build_provider` 分发**

在 `backend/app/services/gateway_service.py`：

(a) 把 `from ..providers import APIMartProvider` 改为：

```python
from ..providers import APIMartProvider, BaseProvider, DeepSeekProvider
```

(b) 把整个 `build_provider` 函数替换为：

```python
def build_provider(provider: Provider) -> BaseProvider:
    if provider.name == "apimart":
        if not settings.apimart_api_key:
            raise HTTPException(status_code=500, detail="APIMART_API_KEY is not configured")
        return APIMartProvider(base_url=provider.base_url, api_key=settings.apimart_api_key)
    if provider.name == "deepseek":
        if not settings.deepseek_api_key:
            raise HTTPException(status_code=500, detail="DEEPSEEK_API_KEY is not configured")
        return DeepSeekProvider(base_url=provider.base_url, api_key=settings.deepseek_api_key)
    raise HTTPException(status_code=501, detail=f"Provider '{provider.name}' not implemented")
```

- [ ] **Step 5: 更新 shutdown 钩子**

在 `backend/app/main.py`：把 `from .providers import close_client as close_httpx_client` 改为 `from .providers import close_all_clients`；把 lifespan 里的 `await close_httpx_client()` 改为 `await close_all_clients()`。

在 `backend/app/worker.py`：把 `from .providers import close_client as close_httpx_client` 改为 `from .providers import close_all_clients`；把 `shutdown` 里的 `await close_httpx_client()` 改为 `await close_all_clients()`。

- [ ] **Step 6: 跑测试确认通过**

Run: `cd backend && .venv/bin/pytest tests/test_deepseek_provider.py tests/test_apimart.py -v && .venv/bin/python -c "import app.main, app.worker"`
Expected: 测试全 PASS，import 无错误。

- [ ] **Step 7: Commit**

```bash
git add backend/app/providers/__init__.py backend/app/services/gateway_service.py backend/app/main.py backend/app/worker.py backend/tests/test_deepseek_provider.py
git commit -m "feat(gateway): dispatch build_provider to DeepSeek; close all provider clients on shutdown"
```

---

### Task 9: `_extract_cache_tokens` 识别 DeepSeek 缓存字段

**Files:**
- Modify: `backend/app/api/gateway.py:165-181` (`_extract_cache_tokens`)
- Modify: `backend/tests/test_deepseek_provider.py` (追加测试)

- [ ] **Step 1: 追加失败测试**

在 `backend/tests/test_deepseek_provider.py` 末尾追加：

```python
def test_extract_cache_tokens_reads_deepseek_field():
    from app.api.gateway import _extract_cache_tokens

    cached, creation = _extract_cache_tokens({"prompt_cache_hit_tokens": 320})
    assert cached == 320
    assert creation == 0


def test_extract_cache_tokens_openai_shape_still_works():
    from app.api.gateway import _extract_cache_tokens

    cached, creation = _extract_cache_tokens({"prompt_tokens_details": {"cached_tokens": 11}})
    assert cached == 11
    assert creation == 0
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/bin/pytest tests/test_deepseek_provider.py -k extract_cache -v`
Expected: `test_extract_cache_tokens_reads_deepseek_field` FAIL（返回 0）。

- [ ] **Step 3: 加 DeepSeek 字段**

在 `backend/app/api/gateway.py` 的 `_extract_cache_tokens` 里，把 `cached` 赋值改为：

```python
    cached = (
        (usage.get("prompt_tokens_details") or {}).get("cached_tokens")
        or usage.get("cache_read_input_tokens")
        or usage.get("prompt_cache_hit_tokens")
        or 0
    )
```

并把 docstring 里的形状说明补一行（在 `Anthropic shape: ...` 之后）：

```python
    DeepSeek shape: usage.prompt_cache_hit_tokens (top-level, no cache_creation)
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/bin/pytest tests/test_deepseek_provider.py -k extract_cache -v`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/gateway.py backend/tests/test_deepseek_provider.py
git commit -m "feat(gateway): bill DeepSeek prompt_cache_hit_tokens at cache-read price"
```

---

### Task 10: seed DeepSeek provider + 两个模型

**Files:**
- Modify: `backend/app/seed.py`

- [ ] **Step 1: 加 DeepSeek 模型目录**

在 `backend/app/seed.py` 的 `DEFAULT_MODELS` 列表定义结束（`]`）之后加：

```python
# DeepSeek 模型走独立的 deepseek provider。定价为官方列表价按 ¥7.2/$ 换算的
# USD 值（不含临时折扣，不加价）；DeepSeek 缓存无写入费 → cache_write_price=None。
DEEPSEEK_MODELS: list[dict] = [
    {
        "public_name": "deepseek-v4-flash",
        "upstream_model": "deepseek-v4-flash",
        "type": "text",
        "display_name": "DeepSeek V4 Flash",
        "display_provider": "deepseek",
        "description": "DeepSeek V4 fast-inference model.",
        "pricing_mode": "per_token",
        "input_price": Decimal("0.14"),
        "output_price": Decimal("0.28"),
        "capabilities": {"stream": True, "tools": True, "vision": False, "ctx": 128_000},
        "max_input_tokens": 128_000,
        "cache_write_price": None,
        "cache_read_price": Decimal("0.003"),
    },
    {
        "public_name": "deepseek-v4-pro",
        "upstream_model": "deepseek-v4-pro",
        "type": "text",
        "display_name": "DeepSeek V4 Pro",
        "display_provider": "deepseek",
        "description": "DeepSeek V4 advanced-reasoning model.",
        "pricing_mode": "per_token",
        "input_price": Decimal("0.42"),
        "output_price": Decimal("0.83"),
        "capabilities": {"stream": True, "tools": True, "vision": False, "ctx": 128_000},
        "max_input_tokens": 128_000,
        "cache_write_price": None,
        "cache_read_price": Decimal("0.0035"),
    },
]
```

> 实现期核对：`ctx` / `max_input_tokens`（暂定 128000）对照 DeepSeek 文档。

- [ ] **Step 2: 加 ensure 函数**

在 `ensure_apimart_provider` 函数之后加：

```python
def ensure_deepseek_provider(db: Session) -> Provider:
    p = db.query(Provider).filter(Provider.name == "deepseek").one_or_none()
    if p:
        return p
    p = Provider(
        name="deepseek",
        display_name="DeepSeek",
        base_url=settings.deepseek_base_url,
        status="active",
    )
    db.add(p)
    db.flush()
    return p


def ensure_deepseek_models(db: Session, provider: Provider) -> None:
    # If no API key is configured at boot, seed the models disabled so they
    # don't surface as broken — an admin can enable them later (same posture
    # as the grok placeholder rows).
    default_status = "active" if settings.deepseek_api_key else "disabled"
    existing = {m.public_name for m in db.query(ModelRow.public_name).all()}
    for spec in DEEPSEEK_MODELS:
        if spec["public_name"] in existing:
            continue
        db.add(
            ModelRow(
                provider_id=provider.id,
                visible=True,
                status=default_status,
                **spec,
            )
        )
```

- [ ] **Step 3: 接入 `run_seed`**

把 `run_seed` 函数替换为：

```python
def run_seed(db: Session) -> None:
    ensure_admin(db)
    provider = ensure_apimart_provider(db)
    ensure_default_models(db, provider)
    deepseek = ensure_deepseek_provider(db)
    ensure_deepseek_models(db, deepseek)
    db.commit()
```

- [ ] **Step 4: 验证 seed（需 Postgres）**

Run: `cd backend && .venv/bin/python -c "from app.database import SessionLocal; from app.seed import run_seed; from app.models import ModelRow, Provider; db=SessionLocal(); run_seed(db); print('deepseek provider:', db.query(Provider).filter(Provider.name=='deepseek').one_or_none() is not None); print('models:', sorted(m.public_name for m in db.query(ModelRow).filter(ModelRow.public_name.like('deepseek-%')).all())); db.close()"`
Expected: 打印 `deepseek provider: True` 与 `models: ['deepseek-v4-flash', 'deepseek-v4-pro']`。Postgres 不可达则在有 DB 环境补跑。

- [ ] **Step 5: Commit**

```bash
git add backend/app/seed.py
git commit -m "feat(seed): seed DeepSeek provider and v4-flash/v4-pro models"
```

---

## Part D — DeepSeek 前端 + 文档

### Task 11: DeepSeek provider 配色 chip

**Files:**
- Modify: `frontend/src/components/provider-tag.tsx`
- Modify: `frontend/src/index.css:30-35,81-86`
- Modify: `frontend/src/pages/admin/models.tsx:31` (`DISPLAY_PROVIDERS`)

- [ ] **Step 1: provider-tag 加 DeepSeek**

在 `frontend/src/components/provider-tag.tsx`：

`PROVIDER_LABELS` 里 `apimart: "APIMart",` 之后加：

```ts
  deepseek: "DeepSeek",
```

`PROVIDER_COLOR_VAR` 里 `apimart: "var(--apimart)",` 之后加：

```ts
  deepseek: "var(--deepseek)",
```

- [ ] **Step 2: index.css 加色值**

在 `frontend/src/index.css`：`:root` 里 `--apimart: #7be38b;` 之后加：

```css
  --deepseek: #4d6bfe;
```

`@theme inline` 里 `--color-apimart: var(--apimart);` 之后加：

```css
  --color-deepseek: var(--deepseek);
```

- [ ] **Step 3: `DISPLAY_PROVIDERS` 加 deepseek**

在 `frontend/src/pages/admin/models.tsx`，把：

```ts
const DISPLAY_PROVIDERS = ["apimart", "openai", "anthropic", "gemini", "xai", "veo"] as const;
```

改为：

```ts
const DISPLAY_PROVIDERS = ["apimart", "deepseek", "openai", "anthropic", "gemini", "xai", "veo"] as const;
```

- [ ] **Step 4: 同步 DESIGN.md（条件性）**

Run: `grep -n "apimart\|provider" DESIGN.md`
若 `DESIGN.md` 存在 provider 配色 / chip 清单，按其格式补一条 `deepseek` / `#4d6bfe`；若无相关清单则跳过。

- [ ] **Step 5: 构建验证**

Run: `cd frontend && npm run build`
Expected: 构建成功，无类型错误。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/provider-tag.tsx frontend/src/index.css frontend/src/pages/admin/models.tsx DESIGN.md
git commit -m "feat(ui): add DeepSeek provider chip color and label"
```

---

### Task 12: DeepSeek 网关路由测试 + CLAUDE.md 文档更新

**Files:**
- Modify: `backend/tests/test_gateway_paths.py`
- Modify: `CLAUDE.md`

- [ ] **Step 1: 写网关路由测试**

在 `backend/tests/test_gateway_paths.py` 末尾追加（不打真实上游；通过 DB 改写确保模型 active，避免依赖测试环境是否配了 `DEEPSEEK_API_KEY`）：

```python
def test_v1_models_lists_deepseek_when_active(client, db_session, user_api_key):
    """deepseek-v4-flash is seeded; force it active and confirm it shows in /v1/models."""
    from app.models import ModelRow

    row = db_session.query(ModelRow).filter(ModelRow.public_name == "deepseek-v4-flash").one()
    row.status = "active"
    row.visible = True
    db_session.commit()

    r = client.get("/v1/models", headers={"Authorization": f"Bearer {user_api_key}"})
    assert r.status_code == 200
    ids = {m["id"] for m in r.json()["data"]}
    assert "deepseek-v4-flash" in ids


def test_deepseek_models_seeded_under_deepseek_provider(db_session):
    from app.models import ModelRow, Provider

    deepseek = db_session.query(Provider).filter(Provider.name == "deepseek").one()
    for name in ("deepseek-v4-flash", "deepseek-v4-pro"):
        row = db_session.query(ModelRow).filter(ModelRow.public_name == name).one()
        assert row.provider_id == deepseek.id
        assert row.type == "text"
```

- [ ] **Step 2: 跑测试**

Run: `cd backend && .venv/bin/pytest tests/test_gateway_paths.py -k deepseek -v`
Expected: PASS（Postgres 不可达则自动 skip）。

- [ ] **Step 3: 更新 CLAUDE.md**

在 `CLAUDE.md` 做以下更正：

(a) 「What this is」一段里 `in front of upstream LLM providers (currently APIMart)` 改为 `in front of upstream LLM providers (APIMart and DeepSeek)`。

(b) Stack 表里 `Upstream` 行 `APIMart only (docs.apimart.ai); pluggable via BaseProvider` 改为 `APIMart + DeepSeek; pluggable via BaseProvider`，并补一句入口 `backend/app/providers/`。

(c) 「Multi-provider session stickiness」一段开头 `Today there's only one upstream (APIMart)` 改为 `Today there are two upstreams (APIMart, DeepSeek)`。

(d) 「Configuration & startup safety」一段补一条：`DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL 可选；缺 key 时 DeepSeek 模型 seed 为 disabled。`

(e) seams 表「Add a second upstream provider」行后补一句现状：`DeepSeek 已按此接入（backend/app/providers/deepseek.py，build_provider 按 provider.name 分发）。`

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_gateway_paths.py CLAUDE.md
git commit -m "test(gateway): cover DeepSeek model routing; update CLAUDE.md for second provider"
```

---

## 最终验证

- [ ] **后端全量测试**

Run: `cd backend && .venv/bin/pytest -q`
Expected: 全绿（无 DB/Redis 的环境里集成测试自动 skip，纯函数测试必须全过）。

- [ ] **前端构建**

Run: `cd frontend && npm run build`
Expected: `tsc -b` 通过，构建成功。

- [ ] **手动冒烟（有 DB + Redis + 真实 DEEPSEEK_API_KEY 时）**

启动后端与 worker，给测试用户充值，用 `sk-` key 调：
- `POST /v1/chat/completions`，`model=deepseek-v4-flash` → 正常返回，`request_logs` 有一条 `cost>0`、`provider=deepseek`。
- `POST /v1/messages`，`model=deepseek-v4-flash` → 正常返回。
- 后台把该模型 `price_markup` 改为 `2`，再调一次 → 新日志 `cost` 约为原来的 2 倍，`unit_price_snapshot_json.price_markup == "2"`。

---

## 风险与说明

- **APIMart 流式路径**：Task 6 把 SSE 解析抽成共享函数并让 APIMart 改用，是行为等价的纯提取，`test_apimart.py` + `test_sse.py` 覆盖；若担心，可在 Task 6 后额外手动冒烟一次 APIMart 流式 chat。
- **DeepSeek anthropic 鉴权头**：`x-api-key` + `anthropic-version` 为依据 Anthropic 协议惯例的默认值，Task 7 标注了实现期需对照 DeepSeek 文档核对，改动只局限在 `_messages_headers()`。
- **价格倍率向后兼容**：`_markup()` 用 `isinstance(_, Decimal)` 判定，旧 model stub / 旧快照（无该字段）一律按 1.0，存量 `request_log` 重算不受影响。
- **临时折扣**：`deepseek-v4-pro` 当前 2.5 折优惠（至 2026-05-31）不写入 seed 定价；如需让利可由 admin 用 `price_markup`（如 0.25）临时下调，到期后改回 1.0。
