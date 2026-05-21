# 文本日志瘦身 + 图片/视频资源过期提示设计

> 日期：2026-05-21
> 范围：后端 `gateway_service` 持久化路径、一个数据迁移；前端用量/仪表板/Playground/生成历史页及 i18n

## 1. 背景与目标

网关每次 `/v1/chat/completions`、`/v1/messages`（文本类请求）落库时，都会把**完整请求体**写进 `request_logs.request_payload_json`、把**完整响应体**写进 `response_payload_json`。问题在于：

- 多轮对话客户端（Claude Code、Cursra 等）每一轮都会重发整段对话历史，所以 `request_payload_json` 随对话轮次线性变大，且**每一条日志都存一份**——一个 50 轮的会话，第 50 条日志里塞着前 49 轮全文。
- 非流式文本请求还会把模型回答全文存进 `response_payload_json`。
- 这两个字段对文本日志而言**纯展示用**：后端没有任何逻辑读它们，只有前端「点开日志看详情」的抽屉会渲染。

结论：文本日志的这两个 payload 字段是 `request_logs` 表持续膨胀的主因，且不承载计费/审计价值。

目标：

- 文本类日志不再写入 `request_payload_json` / `response_payload_json`。
- 一次性回填，清空已有文本日志的这两个字段。
- 前端去掉「点开看详情」入口（用量页、仪表板「最近活动」）——payload 没了，入口也就没意义。
- 顺带：图片/视频生成处增加「资源 3 天后删除」提示文案，与 APIMart 的资源留存策略一致。

非目标：

- 不动图片/视频日志的 payload（`task_service` 要靠 `request_payload_json` 回填 `duration`/`n`，且体积很小）。
- 不动 `unit_price_snapshot_json`（计价审计用，体积小且关键）。
- 不动 `RequestLogDetail` schema、`GET /api/logs/{id}` 与 admin 日志接口的形态。
- 不删除 `LogDetailDrawer` 组件（生成历史页仍在用）。
- 不新增 UI primitive、不改 `DESIGN.md`。

## 2. 现状

### 2.1 落库路径

`backend/app/services/gateway_service.py`：

| 函数 | 行 | 用途 | payload 来源 |
|---|---|---|---|
| `persist_success` | 243-318 | 文本请求成功——4 个调用点全在 `gateway.py`（`/v1/chat/completions`、`/v1/messages` 的同步与流式分支），**实际只服务文本** | `request_payload_json=redact(request_payload)`（302）、`response_payload_json=response_payload`（303） |
| `persist_failure` | 321-363 | 任何阶段失败——文本失败在 `gateway.py`，图片/视频提交失败在 `submit_async_task`（475/488/501） | 同上（354-355） |
| `persist_queued_task` | 366-423 | 图片/视频异步提交 | 同上（403-404）——**图片/视频专用** |

两个相关函数签名里都已有 `request_type: str` 参数（`persist_success` 第 250 行、`persist_failure` 第 328 行），并据此写入 `RequestLog.request_type`。`RequestType` 枚举（`backend/app/enums.py`，`TEXT="text" / IMAGE="image" / VIDEO="video"`）已在 `gateway_service.py` 内导入。

### 2.2 流式响应

`/v1/chat/completions`、`/v1/messages` 的流式分支（`backend/app/api/gateway.py` 第 502、859 行）**本来就不存回答全文**，只把一个小标记 `{"_streamed": true, "usage": {...}, "usage_source": ...}` 作为 `response_payload` 传给 `persist_success`。因此流式文本日志的 `response_payload_json` 已经很小；本设计把它一并归 `None`。

### 2.3 文本日志保留下来的信息

把 payload 归 `None` 后，文本日志仍保留：`model_id`/`upstream_model`、`prompt_tokens`/`completion_tokens`/`total_tokens`/`prompt_cached_tokens`/`prompt_cache_creation_tokens`、`cost`、`status`、`latency_ms`、`http_status`、`request_id`/`upstream_request_id`、`created_at`、`usage_source`（独立列，第 306 行写入）、`error_code`/`error_message`、`unit_price_snapshot_json`。计费与审计所需信息**不依赖 payload**。

### 2.4 前端「点开看详情」

`LogDetailDrawer`（`frontend/src/components/log-detail-drawer.tsx`）+ `useLogDetail` hook，被三个页面使用：

| 页面 | 文件 | import | 渲染 | 行点击 |
|---|---|---|---|---|
| 用量 | `frontend/src/pages/usage-logs.tsx` | 13 | 136 | 102-107（`TableRow onClick` + `cursor-pointer`） |
| 生成历史 | `frontend/src/pages/generations.tsx` | 15 | 138 | 110-114 |
| 仪表板 | `frontend/src/pages/dashboard.tsx` | 7 | 134 | 94-99（`<li onClick>` + `cursor-pointer`） |

### 2.5 图片/视频资源过期

APIMart 的 `GET /v1/tasks/{id}` 不返回过期时间，后端也没有任何过期字段。「3 天」是 APIMart 文档化的固定留存策略，因此提示只能是**静态文案**，无后端改动。前端目前没有任何资源过期相关提示。

## 3. 设计

### 3.1 后端：文本日志停止写入 payload

`persist_success` 与 `persist_failure` 各加一处类型判断。当 `request_type` 为文本时，两个 payload 字段写 `None`，并跳过 `redact()`（不处理一份马上就丢的数据）。

`persist_success`（替换 302-303 行）：

```python
is_text = request_type == RequestType.TEXT
# ... 在 RequestLog(...) 内：
request_payload_json=None if is_text else redact(request_payload),
response_payload_json=(
    None
    if is_text
    else (response_payload if isinstance(response_payload, (dict, list)) else None)
),
```

`persist_failure`（替换 354-355 行）同样处理——**成功与失败的文本日志都不存 payload**。失败排错依赖已保留的 `error_code` / `error_message` / `http_status`。

要点：

- 判断只认 `RequestType.TEXT`。`persist_success` 实际只被文本请求调用（4 个调用点均为 chat/messages），`else` 分支为防御性保留；`persist_failure` 还会被图片/视频的提交失败路径调用（`submit_async_task` 内 3 处），`else` 分支保持图片/视频行为不变。
- 流式文本：标记对象经 `persist_success` 落库，被同一判断归 `None`——无信息损失（token 数在专用列、`usage_source` 在专用列、估算标记在 `error_message`）。
- `persist_queued_task`（图片/视频专用）不改。
- `redact` 仍被图片/视频分支使用，import 保留。

### 3.2 数据迁移：回填清空历史文本日志

新增一个**纯数据迁移**（无 schema 变更——这两列早已存在且 `nullable=True`）。用 `alembic revision -m "trim text log payloads"` 生成空迁移后手工填入数据操作，`down_revision` 指向当前 head。

```python
def upgrade() -> None:
    # 一次性回填：清空已有 text 日志的 request/response payload。
    # 这两列对文本日志已不再写入。用 autocommit_block 分批提交，
    # 避免大表在整个迁移期间被锁。
    with op.get_context().autocommit_block():
        conn = op.get_bind()
        while True:
            result = conn.execute(
                sa.text(
                    """
                    UPDATE request_logs
                    SET request_payload_json = NULL,
                        response_payload_json = NULL
                    WHERE id IN (
                        SELECT id FROM request_logs
                        WHERE request_type = 'text'
                          AND (request_payload_json IS NOT NULL
                               OR response_payload_json IS NOT NULL)
                        LIMIT 5000
                    )
                    """
                )
            )
            if result.rowcount == 0:
                break


def downgrade() -> None:
    # 不可逆：历史 payload 已被永久删除。
    pass
```

要点：

- `WHERE request_type = 'text'`——只清文本日志，图片/视频日志不受影响。
- 每批 5000 行，`autocommit_block` 内每条 `UPDATE` 独立提交，避免长事务/长锁/WAL 尖峰。
- `downgrade` 是 no-op，迁移注释写明不可恢复。
- 磁盘空间由 autovacuum 自动回收；要立即收缩文件可在迁移后手动跑 `VACUUM (ANALYZE) request_logs`（运维步骤，不放进迁移——`VACUUM` 不能在事务内执行）。
- 与 CLAUDE.md 第 9 条「定价快照不回填」无冲突：那条针对 `unit_price_snapshot_json`，本迁移不碰它。

### 3.3 前端：去掉用量页 / 仪表板的详情抽屉

- `usage-logs.tsx`：移除 `LogDetailDrawer` / `useLogDetail` 的 import 与使用；`TableRow` 去掉 `onClick` 和 `cursor-pointer`。用量页变为纯只读列表（摘要行已含模型/成本/token/状态/时间）。
- `dashboard.tsx`：「最近活动」列表项同样移除 `onClick` / `cursor-pointer` 与抽屉——否则点开一条文本记录会弹出空抽屉。
- `generations.tsx`：**保留**抽屉。图片/视频日志 payload 未动，抽屉仍能展示 prompt 参数与资源。
- `LogDetailDrawer` 组件、`useLogDetail` hook、`GET /api/logs/{id}` 接口、`RequestLogDetail` schema 均不改——继续服务生成历史页。

### 3.4 前端：图片/视频「3 天后删除」提示

静态提示文案，纯前端，走 i18n。

- 新增一个 i18n key（`dict-en.ts` / `dict-zh.ts` 各一份，命名以实现为准，下文用 `assetExpiryNotice` 指代），在两处复用。
- `playground.tsx`：`ImageTab` 结果区（454-462 行附近）与 `VideoTab` 结果区（630-635 行附近），在资源渲染出来后、其下方加一行 `text-xs text-muted-foreground` 文字。只在有结果时显示。
- `generations.tsx`：页面顶部加一行同样的 muted 说明文字（适用于整页列表）。
- 文案初稿（措辞可在评审时调整）：
  - 中文：`图片 / 视频资源由 APIMart 托管，生成 3 天后自动删除，请及时下载保存。`
  - 英文：`Generated images and videos are hosted by APIMart and are deleted 3 days after creation. Download and save them in time.`
- 用既有 `text-muted-foreground` 文字样式，不新增 UI primitive，不改 `DESIGN.md`。

## 4. 涉及文件

| 文件 | 改动 |
|---|---|
| `backend/app/services/gateway_service.py` | `persist_success` / `persist_failure`：`request_type` 为文本时 payload 写 `None` |
| `backend/alembic/versions/<新建>.py` | 新增数据迁移：分批回填清空历史 text 日志的两个 payload 列 |
| `frontend/src/pages/usage-logs.tsx` | 移除行点击 + `LogDetailDrawer` / `useLogDetail` |
| `frontend/src/pages/dashboard.tsx` | 移除「最近活动」点击 + `LogDetailDrawer` / `useLogDetail` |
| `frontend/src/pages/playground.tsx` | `ImageTab` / `VideoTab` 结果区增加过期提示 |
| `frontend/src/pages/generations.tsx` | 页面顶部增加过期提示 |
| `frontend/src/lib/i18n/dict-en.ts` | 新增过期提示 key（英文） |
| `frontend/src/lib/i18n/dict-zh.ts` | 新增过期提示 key（中文） |

不改动：`LogDetailDrawer` 组件、`useLogDetail` hook、日志查询接口、`RequestLogDetail` schema、图片/视频日志 payload、`unit_price_snapshot_json`、`persist_queued_task`、`DESIGN.md`。

## 5. 验收标准

- 新发起的 `/v1/chat/completions`、`/v1/messages` 请求（流式与非流式、成功与失败）落库后，对应 `request_logs` 行的 `request_payload_json` 与 `response_payload_json` 均为 `NULL`；`prompt_tokens` / `completion_tokens` / `cost` / `status` / `latency_ms` / `usage_source` / `unit_price_snapshot_json` 等字段照常有值。
- 图片/视频请求的日志 payload 仍正常写入；`task_service` 仍能从 `request_payload_json` 回填 `duration` / `n`。
- 执行迁移后，历史 `request_type='text'` 日志的两个 payload 列被清空；`image` / `video` 日志不受影响。
- `alembic upgrade head` 成功；`alembic downgrade -1` 为 no-op 且不报错。
- 用量页、仪表板「最近活动」的行/项不再可点击、不再弹出抽屉；生成历史页仍可点开抽屉查看图片/视频详情。
- Playground 成功生成图片/视频后，结果区下方显示「3 天后删除」提示；生成历史页顶部显示同样提示；中英文切换时文案随之切换。
- `cd backend && .venv/bin/pytest` 通过（相关：`tests/test_gateway_paths.py`）；`cd frontend && npm run build` 通过（`tsc -b` 无类型错误，不引入 `any`）。
