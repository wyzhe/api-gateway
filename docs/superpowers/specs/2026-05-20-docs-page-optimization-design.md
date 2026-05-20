# Docs 页面优化设计

> 日期：2026-05-20
> 范围：前端 `frontend/src/pages/docs.tsx` 及配套 i18n / `PageHeader`

## 1. 背景与目标

当前 `/docs` 页面（`frontend/src/pages/docs.tsx`）存在三个问题：

1. **Image / Video section 只有 curl 示例**，没有 Python 调用方式。Chat section 有 Python（OpenAI SDK），图像/视频没有。
2. **代码块纯堆叠**：Chat section 把 curl 和 Python 上下堆叠，section 多了会变成代码长墙。
3. **正文是硬编码英文**：只有 section 标题走了 `t()`，正文描述性文字硬编码英文，与 app 其它页面（admin 等）的中英双语不一致。`docs.subtitle` 这个 i18n key 已存在但页面从未渲染。

目标：

- 给 Image / Video section 增加 Python 调用示例（`requests` + 轮询）。
- 用 curl / Python 切换标签替代代码堆叠。
- 正文全部双语化，渲染页面副标题。

非目标：

- 不重写文案（仅小幅润色）。
- 不增加目录导航 / 响应结构参考表 / 错误处理章节（属于更大重构，本次不做）。
- 不改动后端任何接口。

## 2. 现状

`docs.tsx` 渲染 4 个 Card：

| Section | 现有代码示例 |
|---|---|
| Authentication | 无（纯正文） |
| Chat completions | curl + Python（OpenAI SDK），上下堆叠 |
| Image generation (async) | 仅 curl |
| Video generation (async) | 仅 curl |

相关基础设施：

- `frontend/src/components/ui/tabs.tsx` — 标准 Radix Tabs（`Tabs` / `TabsList` / `TabsTrigger` / `TabsContent`）。DESIGN.md 把 `Tabs` 定义为 modality switcher。
- `frontend/src/components/ui/code-block.tsx` — `CodeBlock`，带 lang chip + 复制按钮。
- `frontend/src/components/shell.tsx` 的 `PageHeader` 当前只接受 `title` 和 `actions`，不支持 subtitle。
- i18n 字典：`frontend/src/lib/i18n/dict-en.ts`、`dict-zh.ts`，`docs.*` 节点已有 `title` / `subtitle` / 4 个 `section*` key。

### 接口响应形状（实现示例需对齐）

`POST /v1/images/generations` 与 `POST /v1/videos/generations` 是异步接口，返回：

```json
{ "task_id": "task_42", "status": "queued", "type": "image", "_gateway": { ... }, "raw": { ... } }
```

`GET /v1/tasks/{task_id}` 返回：

```json
{ "task_id": "task_42", "status": "succeeded", "asset_url": "https://...", "error_message": null, "updated_at": "...", "_gateway": { ... } }
```

`status` 取值：`queued | running | succeeded | failed`。终态为 `succeeded` / `failed`。

**注意**：图像/视频接口的响应体不是 OpenAI 的 `ImagesResponse` 形状，因此 OpenAI Python SDK 的 `client.images.generate()` 无法直接用 —— Python 示例必须用原始 HTTP（`requests`）。

## 3. 设计

### 3.1 `PageHeader` 增加 `subtitle`

给 `PageHeader` 增加可选 prop：

```tsx
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) { ... }
```

- `subtitle` 渲染在 `title` 下方、分隔线（`border-b`）之上，样式 `text-xs text-muted-foreground`。
- 不传 `subtitle` 时行为与现在完全一致，其它调用方不受影响。
- docs 页面传入 `subtitle={t("docs.subtitle")}`。

### 3.2 curl / Python 切换标签

Chat / Image / Video 三个 section 的代码区改为 `Tabs`：

```tsx
<Tabs defaultValue="curl">
  <TabsList>
    <TabsTrigger value="curl">cURL</TabsTrigger>
    <TabsTrigger value="python">Python</TabsTrigger>
  </TabsList>
  <TabsContent value="curl"><CodeBlock lang="bash" code={...} /></TabsContent>
  <TabsContent value="python"><CodeBlock lang="python" code={...} /></TabsContent>
</Tabs>
```

- 标签文字 `cURL` / `Python` 为专有名词，保留字面量，不进 i18n。
- 各 section 的说明性正文（如 Chat 的流式说明、Image 的异步说明）放在 `Tabs` 之外，仍在 Card 内。
- Authentication section 无代码，保持纯正文，不加 Tabs。

### 3.3 新增 Python 示例（`requests` + 轮询）

**Image** —— 提交任务、轮询至终态：

```python
import time
import requests

BASE_URL = "{base}/v1"
API_KEY = "sk-YOUR_KEY"
headers = {"Authorization": f"Bearer {API_KEY}"}

# 1. Submit the async image task
resp = requests.post(
    f"{BASE_URL}/images/generations",
    headers=headers,
    json={"model": "gpt-image-2", "prompt": "a small red apple", "resolution": "1k"},
)
resp.raise_for_status()
task_id = resp.json()["task_id"]

# 2. Poll until the task reaches a terminal state
while True:
    task = requests.get(f"{BASE_URL}/tasks/{task_id}", headers=headers).json()
    if task["status"] in ("succeeded", "failed"):
        break
    time.sleep(2)

if task["status"] == "succeeded":
    print(task["asset_url"])
else:
    print("failed:", task["error_message"])
```

**Video** —— 同模式，payload 与轮询间隔不同：

```python
import time
import requests

BASE_URL = "{base}/v1"
API_KEY = "sk-YOUR_KEY"
headers = {"Authorization": f"Bearer {API_KEY}"}

resp = requests.post(
    f"{BASE_URL}/videos/generations",
    headers=headers,
    json={
        "model": "sora2",
        "prompt": "a calm ocean wave at sunset",
        "duration": 4,
        "resolution": "720p",
        "aspect_ratio": "16:9",
    },
)
resp.raise_for_status()
task_id = resp.json()["task_id"]

# Video tasks usually take 1-3 minutes
while True:
    task = requests.get(f"{BASE_URL}/tasks/{task_id}", headers=headers).json()
    if task["status"] in ("succeeded", "failed"):
        break
    time.sleep(5)

if task["status"] == "succeeded":
    print(task["asset_url"])
else:
    print("failed:", task["error_message"])
```

- `{base}` 用 `location.origin` 注入，与现有 curl / Python 示例一致。
- 字段严格对齐 §2 的响应形状。

### 3.4 正文双语化

把 docs 页面所有正文描述性文字迁入 `dict-en.ts` / `dict-zh.ts` 的 `docs.*` 节点。新增 key（最终命名以实现为准，下列为预期集合）：

| key | 用途 | 英文（沿用现有文案，小幅润色） |
|---|---|---|
| `authBody1` | Authentication 第 1 段 | `/v1/*` 调用需要 `Authorization: Bearer sk-…` 请求头，密钥在 API Keys 页创建 |
| `authBody2` | Authentication 第 2 段 | `/api/*` 仪表盘接口用 `/api/auth/login` 拿到的 JWT |
| `chatStreamNote` | Chat section 流式说明 | 支持 `stream=true`（SSE），网关强制 `include_usage` |
| `imageIntro` | Image section 异步说明 | 图像生成是异步的，返回 `task_id`，轮询 `/v1/tasks/{task_id}` |
| `videoNote` | Video section 耗时说明 | 视频任务通常 1–3 分钟，用同一个 tasks 接口轮询 |

**取舍（已与项目方确认）**：正文改为纯文本 i18n 字符串，内联代码 token（`/v1/*`、`task_id` 等）作为普通文本写在句子里，**不再逐 token 包 `<span className="mono">`**。理由：i18n 字符串承载 JSX 不易维护；真正需要等宽高亮的代码都在 `CodeBlock` 内。代价是正文里几个短 token 失去背景色块，可接受。

代码块内容（curl / Python 示例字符串）不翻译。

## 4. 涉及文件

| 文件 | 改动 |
|---|---|
| `frontend/src/components/shell.tsx` | `PageHeader` 增加可选 `subtitle` prop |
| `frontend/src/pages/docs.tsx` | 重构：Tabs 包裹代码、新增 image/video Python 示例、正文改用 `t()`、渲染副标题 |
| `frontend/src/lib/i18n/dict-en.ts` | `docs.*` 新增正文 key |
| `frontend/src/lib/i18n/dict-zh.ts` | `docs.*` 新增对应中文 key |

不改动后端、不新增 UI primitive、不改 DESIGN.md（Tabs 在 Card 内的放置属于既有组件的常规用法）。

## 5. 验收标准

- `/docs` 页面标题下显示副标题。
- Chat / Image / Video 三个 section 均有 cURL / Python 两个标签，可切换。
- Image / Video 的 Python 标签展示 `requests` 提交 + 轮询示例，字段与真实响应形状一致。
- 切换语言（中/英）时，docs 页面正文随之切换；代码块内容保持英文。
- `cd frontend && npm run build` 通过（`tsc -b` 无类型错误，不引入 `any`）。
- 视觉符合 DESIGN.md：`CodeBlock` 承载所有代码，`Tabs` 列为 `h-7 bg-surface-2`。
