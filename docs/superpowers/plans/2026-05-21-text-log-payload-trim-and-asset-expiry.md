# 文本日志瘦身 + 资源过期提示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 文本类请求日志（chat/messages）不再持久化请求体/响应体 JSON，并回填清空已有文本日志；前端用量页与仪表板去掉「点开看详情」抽屉；Playground 与生成历史页加一行「资源 3 天后删除」提示。

**Architecture:** 后端在 `gateway_service` 加一个纯函数 `_payloads_for_log`，按 `request_type` 决定是否落 payload，被 `persist_success` / `persist_failure` 共用；一个纯数据 Alembic 迁移回填历史；两个前端页面移除详情抽屉的接线；Playground / Generations 渲染一段静态 i18n 提示。

**Tech Stack:** 后端 FastAPI + SQLAlchemy 2 + Alembic + pytest；前端 React 19 + TypeScript + Vite + Tailwind v4。

参考设计文档：[`docs/superpowers/specs/2026-05-21-text-log-payload-trim-and-asset-expiry-design.md`](../specs/2026-05-21-text-log-payload-trim-and-asset-expiry-design.md)

---

## Task 1: 后端 — 文本日志停止写入 payload

`gateway_service.persist_success` 与 `persist_failure` 当前各自内联 `request_payload_json=redact(...)` / `response_payload_json=...`。抽出一个纯函数 `_payloads_for_log` 决定落库内容，文本类型返回 `(None, None)`，图片/视频保持原逻辑。纯函数可无 DB 单测（对齐 `test_task_service.py` 的写法）。

**Files:**
- Modify: `backend/app/services/gateway_service.py`（`persist_success` 行 243-318、`persist_failure` 行 321-363）
- Test: `backend/tests/test_gateway_service.py`（新建）

- [ ] **Step 1: 写失败测试**

新建 `backend/tests/test_gateway_service.py`：

```python
"""Pure-function tests for gateway_service log-payload helpers. No DB needed."""
from app.services.gateway_service import _payloads_for_log


def test_text_logs_persist_no_payloads():
    """Text request logs drop both payloads: prompt/answer text is the
    dominant request_logs bloat source and has no billing/audit value."""
    req, resp = _payloads_for_log(
        "text",
        {"model": "claude-sonnet-4.6", "messages": [{"role": "user", "content": "hi"}]},
        {"choices": [{"message": {"content": "hello"}}]},
    )
    assert req is None
    assert resp is None


def test_text_failure_payloads_also_dropped():
    """persist_failure can pass request_payload=None on early failures; the
    text branch must handle that without raising."""
    req, resp = _payloads_for_log("text", None, None)
    assert req is None
    assert resp is None


def test_image_logs_keep_payloads():
    """Image/video logs keep payloads — task_service backfills cost params
    (n, duration) from the stored request payload."""
    req, resp = _payloads_for_log(
        "image",
        {"model": "gpt-image-2", "prompt": "a cat", "n": 2},
        {"task_id": "task_1"},
    )
    assert req == {"model": "gpt-image-2", "prompt": "a cat", "n": 2}
    assert resp == {"task_id": "task_1"}


def test_video_logs_keep_payloads():
    req, resp = _payloads_for_log(
        "video",
        {"model": "veo3", "prompt": "a wave", "duration": 4},
        {"task_id": "task_2"},
    )
    assert req == {"model": "veo3", "prompt": "a wave", "duration": 4}
    assert resp == {"task_id": "task_2"}


def test_non_dict_response_is_not_persisted():
    """A non-dict/list response body (e.g. a raw string) is stored as None."""
    _req, resp = _payloads_for_log("image", {"prompt": "x"}, "raw string body")
    assert resp is None
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd backend && .venv/bin/pytest tests/test_gateway_service.py -v`
Expected: 收集阶段报错 —— `ImportError: cannot import name '_payloads_for_log' from 'app.services.gateway_service'`。

- [ ] **Step 3: 实现 `_payloads_for_log`**

在 `backend/app/services/gateway_service.py` 中，把 `# ---------------- Persist helpers ----------------` 注释块（行 240）与 `def persist_success(`（行 243）之间插入新函数。

替换：
```python
# ---------------- Persist helpers ----------------


def persist_success(
```
为：
```python
# ---------------- Persist helpers ----------------


def _payloads_for_log(
    request_type: str,
    request_payload: dict[str, Any] | list | None,
    response_payload: dict[str, Any] | list | None,
) -> tuple[Any, Any]:
    """Decide the (request, response) JSON to store on a request_log row.

    Text logs persist neither: the prompt/answer is the dominant request_logs
    bloat source and carries no billing/audit value. Image/video logs keep
    both — task_service backfills cost params (n, duration) from the request.
    """
    if request_type == RequestType.TEXT:
        return None, None
    return (
        redact(request_payload),
        response_payload if isinstance(response_payload, (dict, list)) else None,
    )


def persist_success(
```

`RequestType`、`redact`、`Any` 均已在该文件中导入，无需新增 import。

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd backend && .venv/bin/pytest tests/test_gateway_service.py -v`
Expected: 5 个测试全部 PASS。

- [ ] **Step 5: 在 `persist_success` 接入 `_payloads_for_log`**

改动 1 —— 插入调用。替换：
```python
        note_parts.append("pricing_estimated=true")
    log_row = RequestLog(
```
为：
```python
        note_parts.append("pricing_estimated=true")
    req_json, resp_json = _payloads_for_log(request_type, request_payload, response_payload)
    log_row = RequestLog(
```

改动 2 —— 用结果赋值。替换：
```python
        request_payload_json=redact(request_payload),
        response_payload_json=response_payload if isinstance(response_payload, (dict, list)) else None,
        asset_url=asset_url,
```
为：
```python
        request_payload_json=req_json,
        response_payload_json=resp_json,
        asset_url=asset_url,
```

- [ ] **Step 6: 在 `persist_failure` 接入 `_payloads_for_log`**

改动 1 —— 插入调用。替换：
```python
    """No debit on failure. Just write the log."""
    log_row = RequestLog(
```
为：
```python
    """No debit on failure. Just write the log."""
    req_json, resp_json = _payloads_for_log(request_type, request_payload, response_payload)
    log_row = RequestLog(
```

改动 2 —— 用结果赋值。替换：
```python
        error_code=error_code,
        error_message=error_message,
        request_payload_json=redact(request_payload),
        response_payload_json=response_payload if isinstance(response_payload, (dict, list)) else None,
        unit_price_snapshot_json=cost_service.price_snapshot(model) if model else None,
```
为：
```python
        error_code=error_code,
        error_message=error_message,
        request_payload_json=req_json,
        response_payload_json=resp_json,
        unit_price_snapshot_json=cost_service.price_snapshot(model) if model else None,
```

注意：`persist_queued_task`（图片/视频提交专用，行 366-423）**不改**，其 `redact(request_payload)` 保持原样 —— `redact` 仍被引用，不会变成未使用 import。

- [ ] **Step 7: 运行完整后端测试套件，确认无回归**

Run: `cd backend && .venv/bin/pytest`
Expected: 全部通过（无 Postgres/Redis 的环境里集成测试自动 skip，纯函数测试包括新增的 5 个全部 PASS）。

- [ ] **Step 8: 提交**

```bash
cd backend
git add app/services/gateway_service.py tests/test_gateway_service.py
git commit -m "Stop persisting payloads on text request logs"
```

---

## Task 2: 后端 — 回填清空历史文本日志的数据迁移

新增一个纯数据 Alembic 迁移（无 schema 变更，两列早已存在且 nullable）。当前 head 是 `d4e5f6a7b8c9`，沿用代码库手工命名惯例，新 revision 取 `e5f6a7b8c9d0`。

**Files:**
- Create: `backend/alembic/versions/e5f6a7b8c9d0_trim_text_log_payloads.py`
- Test: `backend/tests/test_log_payload_backfill.py`（新建）

- [ ] **Step 1: 写回填谓词的守护测试**

新建 `backend/tests/test_log_payload_backfill.py`。该测试验证「`request_type='text'` 谓词只清文本日志、不动图片/视频日志」——这是迁移里最危险（不可逆删除）的部分。需 Postgres，无 Postgres 时自动 skip。

```python
"""Guards the text-log payload backfill predicate used by migration
e5f6a7b8c9d0: it must clear text logs only, never image/video. Needs Postgres."""
from decimal import Decimal

from sqlalchemy import text as sql_text


def test_backfill_clears_text_log_payloads_only(db_session, test_user):
    from app.models import RequestLog

    text_log = RequestLog(
        user_id=test_user.id,
        request_type="text",
        status="success",
        cost=Decimal("0"),
        request_payload_json={"messages": [{"role": "user", "content": "hi"}]},
        response_payload_json={"choices": [{"message": {"content": "yo"}}]},
    )
    image_log = RequestLog(
        user_id=test_user.id,
        request_type="image",
        status="success",
        cost=Decimal("0"),
        request_payload_json={"prompt": "a cat", "n": 2},
        response_payload_json={"task_id": "task_1"},
    )
    db_session.add_all([text_log, image_log])
    db_session.commit()

    # Same predicate as migration e5f6a7b8c9d0, scoped to this test user so it
    # does not disturb other rows in the shared test database.
    db_session.execute(
        sql_text(
            """
            UPDATE request_logs
            SET request_payload_json = NULL, response_payload_json = NULL
            WHERE user_id = :uid
              AND request_type = 'text'
              AND (request_payload_json IS NOT NULL
                   OR response_payload_json IS NOT NULL)
            """
        ),
        {"uid": test_user.id},
    )
    db_session.commit()
    db_session.refresh(text_log)
    db_session.refresh(image_log)

    assert text_log.request_payload_json is None
    assert text_log.response_payload_json is None
    assert image_log.request_payload_json == {"prompt": "a cat", "n": 2}
    assert image_log.response_payload_json == {"task_id": "task_1"}
```

- [ ] **Step 2: 运行测试**

Run: `cd backend && .venv/bin/pytest tests/test_log_payload_backfill.py -v`
Expected: PASS（有 Postgres 时），或 SKIP（无 Postgres 时）。

说明：这条 SQL 谓词本身合法，测试立即通过——它不是红绿 TDD，而是把「只清文本」的意图锁成回归守护，再由迁移复用同一谓词。

- [ ] **Step 3: 创建迁移文件**

新建 `backend/alembic/versions/e5f6a7b8c9d0_trim_text_log_payloads.py`：

```python
"""trim text log payloads

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-05-21 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # One-time backfill: text request logs no longer store request/response
    # payloads. Clear them from existing rows so the table stops carrying
    # historical prompt/answer text. Batched via autocommit_block so a large
    # request_logs table is not locked for the whole migration.
    batch = sa.text(
        """
        UPDATE request_logs
        SET request_payload_json = NULL, response_payload_json = NULL
        WHERE id IN (
            SELECT id FROM request_logs
            WHERE request_type = 'text'
              AND (request_payload_json IS NOT NULL
                   OR response_payload_json IS NOT NULL)
            LIMIT 5000
        )
        """
    )
    with op.get_context().autocommit_block():
        conn = op.get_bind()
        while conn.execute(batch).rowcount:
            pass


def downgrade() -> None:
    # Irreversible: the historical payloads have been permanently deleted.
    pass
```

- [ ] **Step 4: 应用迁移**

Run: `cd backend && .venv/bin/alembic upgrade head`
Expected: 输出包含 `Running upgrade d4e5f6a7b8c9 -> e5f6a7b8c9d0, trim text log payloads`，无报错。

- [ ] **Step 5: 验证历史文本日志已无 payload**

Run:
```bash
cd backend && .venv/bin/python - <<'PY'
from app.database import engine
from sqlalchemy import text
with engine.connect() as c:
    n = c.execute(text(
        "SELECT count(*) FROM request_logs "
        "WHERE request_type='text' "
        "AND (request_payload_json IS NOT NULL OR response_payload_json IS NOT NULL)"
    )).scalar()
print("text logs still carrying payloads:", n)
PY
```
Expected: `text logs still carrying payloads: 0`

- [ ] **Step 6: 验证 downgrade 不报错**

Run: `cd backend && .venv/bin/alembic downgrade -1 && .venv/bin/alembic upgrade head`
Expected: downgrade 执行 no-op 后 head 回到 `d4e5f6a7b8c9`，再 upgrade 重新到 `e5f6a7b8c9d0`，全程无报错。

- [ ] **Step 7: 提交**

```bash
cd backend
git add alembic/versions/e5f6a7b8c9d0_trim_text_log_payloads.py tests/test_log_payload_backfill.py
git commit -m "Backfill: clear payloads from existing text logs"
```

---

## Task 3: 前端 — 移除用量页与仪表板的详情抽屉

用量页（`usage-logs.tsx`）与仪表板「最近活动」（`dashboard.tsx`）去掉点击行打开 `LogDetailDrawer` 的接线。生成历史页（`generations.tsx`）**不改** —— 它仍 import `LogDetailDrawer` / `useLogDetail`，组件文件保留。

**Files:**
- Modify: `frontend/src/pages/usage-logs.tsx`
- Modify: `frontend/src/pages/dashboard.tsx`
- Test: 无（前端无测试运行器；用 `npm run build` + `npm run lint` 验证）

- [ ] **Step 1: usage-logs.tsx 移除 import**

替换：
```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LogDetailDrawer, useLogDetail } from "@/components/log-detail-drawer";
import { DotStatus } from "@/components/dot-status";
```
为：
```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DotStatus } from "@/components/dot-status";
```

- [ ] **Step 2: usage-logs.tsx 移除 `useLogDetail()` 调用**

替换：
```tsx
  const apiKeyId = params.get("api_key_id");
  const detail = useLogDetail();
```
为：
```tsx
  const apiKeyId = params.get("api_key_id");
```

- [ ] **Step 3: usage-logs.tsx 去掉表格行点击**

替换：
```tsx
            {rows.map((r) => (
              <TableRow
                key={r.id}
                onClick={() => detail.open(r.id)}
                className="cursor-pointer"
              >
```
为：
```tsx
            {rows.map((r) => (
              <TableRow key={r.id}>
```

- [ ] **Step 4: usage-logs.tsx 移除抽屉渲染**

替换：
```tsx
      </div>

      <LogDetailDrawer log={detail.selected} onClose={detail.close} />
    </div>
```
为：
```tsx
      </div>
    </div>
```

- [ ] **Step 5: dashboard.tsx 移除 import**

替换：
```tsx
import { DotStatus } from "@/components/dot-status";
import { LogDetailDrawer, useLogDetail } from "@/components/log-detail-drawer";
import { TypeBadge } from "@/components/type-badge";
```
为：
```tsx
import { DotStatus } from "@/components/dot-status";
import { TypeBadge } from "@/components/type-badge";
```

- [ ] **Step 6: dashboard.tsx 移除 `useLogDetail()` 调用**

替换：
```tsx
  const [data, setData] = useState<DashboardOut | null>(null);
  const detail = useLogDetail();
  const nav = useNavigate();
```
为：
```tsx
  const [data, setData] = useState<DashboardOut | null>(null);
  const nav = useNavigate();
```

- [ ] **Step 7: dashboard.tsx 去掉「最近活动」列表项点击**

替换：
```tsx
                <li
                  key={r.id}
                  onClick={() => detail.open(r.id)}
                  className="px-2 py-2 flex items-center gap-3 text-xs cursor-pointer hover:bg-surface-2"
                >
```
为：
```tsx
                <li
                  key={r.id}
                  className="px-2 py-2 flex items-center gap-3 text-xs"
                >
```

（同时去掉 `cursor-pointer hover:bg-surface-2` —— 行不再可点击，悬停高亮会误导。）

- [ ] **Step 8: dashboard.tsx 移除抽屉渲染**

替换：
```tsx
      </div>

      <LogDetailDrawer log={detail.selected} onClose={detail.close} />
    </div>
  );
}
```
为：
```tsx
      </div>
    </div>
  );
}
```

- [ ] **Step 9: 构建 + lint 验证**

Run: `cd frontend && npm run build && npm run lint`
Expected: `tsc -b` 无类型错误（若漏删任何 `detail` 引用，`tsc` 会因找不到 `detail` 报错）、`vite build` 成功、eslint 无报错。

- [ ] **Step 10: 提交**

```bash
cd frontend
git add src/pages/usage-logs.tsx src/pages/dashboard.tsx
git commit -m "Remove log detail drawer from usage and dashboard pages"
```

---

## Task 4: 前端 — 图片/视频「3 天后删除」提示

新增 `playground.assetExpiryNotice` 与 `generations.assetExpiryNotice` 两个 i18n key（中英各一份），在 Playground 的 Image / Video 结果区与生成历史页渲染。i18n 字典是强类型的（`zh: EnDict`），en 加了 key 不补 zh 会导致 `tsc` 失败 —— 因此必须中英都加。

**Files:**
- Modify: `frontend/src/lib/i18n/dict-en.ts`
- Modify: `frontend/src/lib/i18n/dict-zh.ts`
- Modify: `frontend/src/pages/playground.tsx`
- Modify: `frontend/src/pages/generations.tsx`
- Test: 无（同 Task 3）

- [ ] **Step 1: dict-en.ts 加 `playground.assetExpiryNotice`**

替换：
```ts
    videoPollingHint:
      "Video tasks typically take 1–3 minutes. The page polls automatically.",
    toastNeedApiKey: "Paste an API key above first.",
```
为：
```ts
    videoPollingHint:
      "Video tasks typically take 1–3 minutes. The page polls automatically.",
    assetExpiryNotice:
      "Generated images and videos are hosted by APIMart and are deleted 3 days after creation. Download and save anything you want to keep.",
    toastNeedApiKey: "Paste an API key above first.",
```

- [ ] **Step 2: dict-en.ts 加 `generations.assetExpiryNotice`**

替换：
```ts
  generations: {
    title: "Generations",
    subtitle: "Image and video outputs from your gateway calls.",
    refreshBtn: "Refresh",
```
为：
```ts
  generations: {
    title: "Generations",
    subtitle: "Image and video outputs from your gateway calls.",
    assetExpiryNotice:
      "Generated images and videos are hosted by APIMart and are deleted 3 days after creation. Download and save anything you want to keep.",
    refreshBtn: "Refresh",
```

- [ ] **Step 3: dict-zh.ts 加 `playground.assetExpiryNotice`**

替换：
```ts
    videoPollingHint: "视频任务通常需要 1–3 分钟，页面会自动轮询结果。",
    toastNeedApiKey: "请先在上方粘贴 API Key。",
```
为：
```ts
    videoPollingHint: "视频任务通常需要 1–3 分钟，页面会自动轮询结果。",
    assetExpiryNotice:
      "图像与视频资源由 APIMart 托管，生成 3 天后会被自动删除，请及时下载保存。",
    toastNeedApiKey: "请先在上方粘贴 API Key。",
```

- [ ] **Step 4: dict-zh.ts 加 `generations.assetExpiryNotice`**

替换：
```ts
  generations: {
    title: "生成记录",
    subtitle: "经网关生成的图像与视频结果。",
    refreshBtn: "刷新",
```
为：
```ts
  generations: {
    title: "生成记录",
    subtitle: "经网关生成的图像与视频结果。",
    assetExpiryNotice:
      "图像与视频资源由 APIMart 托管，生成 3 天后会被自动删除，请及时下载保存。",
    refreshBtn: "刷新",
```

- [ ] **Step 5: playground.tsx — ImageTab 结果区加提示**

替换：
```tsx
            ) : (
              <span className="text-muted-foreground text-sm">{busy ? t("playground.waitingUpstream") : t("playground.imageEmpty")}</span>
            )}
          </div>
          <div>
            <Label>{t("playground.rawRequest")}</Label>
```
为：
```tsx
            ) : (
              <span className="text-muted-foreground text-sm">{busy ? t("playground.waitingUpstream") : t("playground.imageEmpty")}</span>
            )}
          </div>
          {assetUrl && (
            <p className="text-xs text-muted-foreground">{t("playground.assetExpiryNotice")}</p>
          )}
          <div>
            <Label>{t("playground.rawRequest")}</Label>
```

- [ ] **Step 6: playground.tsx — VideoTab 结果区加提示**

替换：
```tsx
            ) : (
              <span className="text-muted-foreground text-sm">{busy ? t("playground.generating") : t("playground.videoEmpty")}</span>
            )}
          </div>
          <div>
            <Label>{t("playground.rawRequest")}</Label>
```
为：
```tsx
            ) : (
              <span className="text-muted-foreground text-sm">{busy ? t("playground.generating") : t("playground.videoEmpty")}</span>
            )}
          </div>
          {assetUrl && (
            <p className="text-xs text-muted-foreground">{t("playground.assetExpiryNotice")}</p>
          )}
          <div>
            <Label>{t("playground.rawRequest")}</Label>
```

- [ ] **Step 7: generations.tsx — 页面顶部加提示**

替换：
```tsx
      <PageHeader
        title={t("generations.title")}
        actions={<Button variant="outline" onClick={refresh}>{t("generations.refreshBtn")}</Button>}
      />

      <div className="rounded-md border border-border">
```
为：
```tsx
      <PageHeader
        title={t("generations.title")}
        actions={<Button variant="outline" onClick={refresh}>{t("generations.refreshBtn")}</Button>}
      />

      <p className="mb-3 text-xs text-muted-foreground">{t("generations.assetExpiryNotice")}</p>

      <div className="rounded-md border border-border">
```

提示用既有 `text-xs text-muted-foreground` 文字样式，不引入新 UI primitive，无需改 `DESIGN.md`。

- [ ] **Step 8: 构建 + lint 验证**

Run: `cd frontend && npm run build && npm run lint`
Expected: `tsc -b` 无类型错误（i18n 是强类型的，能验证 en/zh 两份 key 齐全且 `t()` 路径有效）、`vite build` 成功、eslint 无报错。

- [ ] **Step 9: 提交**

```bash
cd frontend
git add src/lib/i18n/dict-en.ts src/lib/i18n/dict-zh.ts src/pages/playground.tsx src/pages/generations.tsx
git commit -m "Show 3-day asset-expiry notice for image/video"
```

---

## 手动验收（全部 Task 完成后）

前端无自动化 UI 测试，以下用 `cd frontend && npm run dev` 起开发服务器后在浏览器手动确认：

- 用量页（`/logs`）：日志行不再可点击、无悬停指针、点击无反应；表格摘要照常显示。
- 仪表板（`/`）「最近调用」列表项同样不可点击。
- 生成历史页（`/generations`）：行仍可点击，抽屉正常打开并显示图片/视频资源；页面标题下方有一行「3 天后删除」提示。
- Playground：生成一张图片成功后，结果区下方出现「3 天后删除」提示；视频 tab 同理；未生成时不显示。
- 右上角切换中/英文，所有上述提示文案随之切换。
- 后端：发起一次真实 `/v1/chat/completions` 后，查 `request_logs` 最新一行，`request_payload_json` 与 `response_payload_json` 均为 `NULL`；发起一次 `/v1/images/generations`，对应行的 `request_payload_json` 仍有值。

## 范围边界（不动的东西）

- 图片/视频日志的 payload、`unit_price_snapshot_json`、`persist_queued_task`、`LogDetailDrawer` 组件、`useLogDetail` hook、`GET /api/logs/{id}` 接口与 `RequestLogDetail` schema、admin 日志接口 —— 全部不变。
- 已知遗留：`usageLogs.subtitle`（dict-en/zh）文案含「full payloads / 完整调用详情」字样，但该 subtitle 当前并未被 `usage-logs.tsx` 渲染（页面只传 `title`），属本次范围外，保持原样。
