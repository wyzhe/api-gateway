# Docs 页面优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化 `/docs` 页面：curl/Python 切换标签、为图像/视频生成补 Python（requests + 轮询）示例、正文双语化并渲染副标题。

**Architecture:** 纯前端改动。给 `PageHeader` 加可选 `subtitle` prop；docs 页面三个有代码的 section 改用既有 `Tabs` 组件做 curl/Python 切换；所有正文描述文字迁入 i18n 字典。不改后端、不新增 UI primitive。

**Tech Stack:** Vite + React 19 + TypeScript（`strict`）+ Tailwind v4，自研 i18n（`useT`）。

> **关于测试**：前端无单元测试框架。每个任务的验证手段是 `cd frontend && npm run build`（内含 `tsc -b`，类型错误会让构建失败）。Task 3 额外做浏览器目视验证。

---

### Task 1: 给 `PageHeader` 增加 `subtitle` prop

**Files:**
- Modify: `frontend/src/components/shell.tsx:198-211`

- [ ] **Step 1: 修改 `PageHeader`**

把 `frontend/src/components/shell.tsx` 中现有的 `PageHeader`（约 198–211 行）：

```tsx
export function PageHeader({
  title,
  actions,
}: {
  title: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between pb-3 mb-4 border-b border-border">
      <h1 className="text-base font-semibold">{title}</h1>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
```

替换为：

```tsx
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between pb-3 mb-4 border-b border-border">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-base font-semibold">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
```

`ReactNode` 已在该文件导入（`PageHeader` 原本就用到），无需新增 import。不传 `subtitle` 的现有调用方行为不变。

- [ ] **Step 2: 构建验证**

Run: `cd frontend && npm run build`
Expected: 构建成功，无类型错误。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/shell.tsx
git commit -m "feat(ui): add optional subtitle prop to PageHeader"
```

---

### Task 2: 新增 docs 正文 i18n key（en + zh）

**Files:**
- Modify: `frontend/src/lib/i18n/dict-en.ts`（`docs` 节点，约 408–415 行）
- Modify: `frontend/src/lib/i18n/dict-zh.ts`（`docs` 节点，约 402–409 行）

> `zh` 的类型是 `EnDict`，两个字典的 key 结构必须完全一致 —— 必须同时改，否则构建失败。

- [ ] **Step 1: 修改 `dict-en.ts` 的 `docs` 节点**

把 `frontend/src/lib/i18n/dict-en.ts` 中现有的 `docs` 节点：

```ts
  docs: {
    title: "Docs",
    subtitle: "OpenAI-compatible — drop-in replacement for most SDKs.",
    sectionAuthentication: "Authentication",
    sectionChatCompletions: "Chat completions",
    sectionImageGeneration: "Image generation (async)",
    sectionVideoGeneration: "Video generation (async)",
  },
```

替换为：

```ts
  docs: {
    title: "Docs",
    subtitle: "OpenAI-compatible — drop-in replacement for most SDKs.",
    sectionAuthentication: "Authentication",
    sectionChatCompletions: "Chat completions",
    sectionImageGeneration: "Image generation (async)",
    sectionVideoGeneration: "Video generation (async)",
    authBody1:
      "All /v1/* calls require an Authorization: Bearer sk-… header. Create a key on the API Keys page.",
    authBody2:
      "Dashboard APIs under /api/* use a JWT obtained at /api/auth/login.",
    chatStreamNote:
      "Supports stream=true via SSE. The gateway forces stream_options.include_usage=true so the final chunk carries usage for billing.",
    imageIntro:
      "Image generation is asynchronous. The gateway returns a task_id; poll /v1/tasks/{task_id} until status is succeeded or failed.",
    videoNote:
      "Video tasks typically take 1–3 minutes. Poll the same /v1/tasks/{task_id} endpoint until the task reaches a terminal state.",
  },
```

- [ ] **Step 2: 修改 `dict-zh.ts` 的 `docs` 节点**

把 `frontend/src/lib/i18n/dict-zh.ts` 中现有的 `docs` 节点：

```ts
  docs: {
    title: "文档",
    subtitle: "OpenAI 兼容协议 — 多数 SDK 可直接切换接入。",
    sectionAuthentication: "认证",
    sectionChatCompletions: "Chat Completions",
    sectionImageGeneration: "图像生成（异步）",
    sectionVideoGeneration: "视频生成（异步）",
  },
```

替换为：

```ts
  docs: {
    title: "文档",
    subtitle: "OpenAI 兼容协议 — 多数 SDK 可直接切换接入。",
    sectionAuthentication: "认证",
    sectionChatCompletions: "Chat Completions",
    sectionImageGeneration: "图像生成（异步）",
    sectionVideoGeneration: "视频生成（异步）",
    authBody1:
      "所有 /v1/* 调用都需要 Authorization: Bearer sk-… 请求头。请在 API Keys 页面创建密钥。",
    authBody2:
      "/api/* 下的仪表盘接口使用通过 /api/auth/login 获取的 JWT。",
    chatStreamNote:
      "支持通过 SSE 使用 stream=true。网关会强制 stream_options.include_usage=true，使最后一个数据块携带用于计费的 usage。",
    imageIntro:
      "图像生成是异步的。网关返回 task_id；轮询 /v1/tasks/{task_id} 直到状态变为 succeeded 或 failed。",
    videoNote:
      "视频任务通常需要 1–3 分钟。轮询同一个 /v1/tasks/{task_id} 接口，直到任务进入终态。",
  },
```

> 说明：字符串里的 `{task_id}` 不会被 i18n 误解析 —— `interpolate` 只在传了 `vars` 时运行，而 docs 页面调用 `t()` 不传 vars。

- [ ] **Step 3: 构建验证**

Run: `cd frontend && npm run build`
Expected: 构建成功。en/zh 两个字典 key 一致，`EnDict` 类型检查通过。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/lib/i18n/dict-en.ts frontend/src/lib/i18n/dict-zh.ts
git commit -m "i18n(docs): add bilingual keys for docs page body copy"
```

---

### Task 3: 重写 `docs.tsx`（Tabs + Python 示例 + 双语正文 + 副标题）

**Files:**
- Modify: `frontend/src/pages/docs.tsx`（整体替换）

- [ ] **Step 1: 整体替换 `docs.tsx`**

把 `frontend/src/pages/docs.tsx` 整个文件替换为：

```tsx
import { CodeBlock } from "@/components/ui/code-block";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shell";
import { useT } from "@/lib/i18n";

export function DocsPage() {
  const t = useT();
  const base = location.origin;

  const curlChat = `curl ${base}/v1/chat/completions \\
  -H "Authorization: Bearer sk-YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello"}]
  }'`;

  const pyChat = `from openai import OpenAI

client = OpenAI(
    api_key="sk-YOUR_KEY",
    base_url="${base}/v1",
)

resp = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello"}],
)
print(resp.choices[0].message.content)`;

  const curlImg = `curl ${base}/v1/images/generations \\
  -H "Authorization: Bearer sk-YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-image-2","prompt":"a small red apple","resolution":"1k"}'

# returns { "task_id": "task_42", "status": "queued", ... }

curl ${base}/v1/tasks/task_42 \\
  -H "Authorization: Bearer sk-YOUR_KEY"`;

  const pyImg = `import time
import requests

BASE_URL = "${base}/v1"
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
    print("failed:", task["error_message"])`;

  const curlVid = `curl ${base}/v1/videos/generations \\
  -H "Authorization: Bearer sk-YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model":"sora2",
    "prompt":"a calm ocean wave at sunset",
    "duration":4,
    "resolution":"720p",
    "aspect_ratio":"16:9"
  }'`;

  const pyVid = `import time
import requests

BASE_URL = "${base}/v1"
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
    print("failed:", task["error_message"])`;

  return (
    <div className="max-w-4xl">
      <PageHeader title={t("docs.title")} subtitle={t("docs.subtitle")} />

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader><CardTitle>{t("docs.sectionAuthentication")}</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground flex flex-col gap-3">
            <p>{t("docs.authBody1")}</p>
            <p>{t("docs.authBody2")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("docs.sectionChatCompletions")}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Tabs defaultValue="curl">
              <TabsList>
                <TabsTrigger value="curl">cURL</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
              </TabsList>
              <TabsContent value="curl">
                <CodeBlock lang="bash" code={curlChat} />
              </TabsContent>
              <TabsContent value="python">
                <CodeBlock lang="python" code={pyChat} />
              </TabsContent>
            </Tabs>
            <p className="text-xs text-muted-foreground">{t("docs.chatStreamNote")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("docs.sectionImageGeneration")}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{t("docs.imageIntro")}</p>
            <Tabs defaultValue="curl">
              <TabsList>
                <TabsTrigger value="curl">cURL</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
              </TabsList>
              <TabsContent value="curl">
                <CodeBlock lang="bash" code={curlImg} />
              </TabsContent>
              <TabsContent value="python">
                <CodeBlock lang="python" code={pyImg} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("docs.sectionVideoGeneration")}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Tabs defaultValue="curl">
              <TabsList>
                <TabsTrigger value="curl">cURL</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
              </TabsList>
              <TabsContent value="curl">
                <CodeBlock lang="bash" code={curlVid} />
              </TabsContent>
              <TabsContent value="python">
                <CodeBlock lang="python" code={pyVid} />
              </TabsContent>
            </Tabs>
            <p className="text-xs text-muted-foreground">{t("docs.videoNote")}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 构建验证**

Run: `cd frontend && npm run build`
Expected: 构建成功，无类型错误（`docs.authBody1` 等 key 已在 Task 2 加入，`TKey` 类型可解析）。

- [ ] **Step 3: 浏览器目视验证**

启动前端 dev server（`cd frontend && npm run dev`），登录后访问 `/docs`，确认：
- 页面标题下显示副标题。
- Chat / Image / Video 三个 section 都有 `cURL` / `Python` 两个标签，点击可切换且代码块内容随之变化。
- Image 标签下 Python 代码是 `requests` 提交 + `while` 轮询；Video 同理。
- 切换语言（中/英）后，正文（认证说明、流式说明等）随之切换；代码块内容保持英文。

Expected: 以上全部符合。若发现样式或行为问题，回到 Step 1 修正后重新验证。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/pages/docs.tsx
git commit -m "feat(docs): add curl/python tabs, image/video python examples, bilingual copy"
```

---

## Self-Review

**Spec coverage：**
- §3.1 `PageHeader` subtitle → Task 1 ✓
- §3.2 curl/Python 切换标签 → Task 3 ✓
- §3.3 图像/视频 Python（requests + 轮询）示例 → Task 3（`pyImg` / `pyVid`）✓
- §3.4 正文双语化 → Task 2（新增 key）+ Task 3（页面用 `t()` 消费）✓
- §5 验收：每个任务含 `npm run build` 验证；语言切换在 Task 3 Step 3 目视验证 ✓

**Placeholder scan：** 无 TBD/TODO；所有代码步骤含完整代码。

**Type consistency：** `subtitle` prop 名在 Task 1 与 Task 3 一致；i18n key（`authBody1` / `authBody2` / `chatStreamNote` / `imageIntro` / `videoNote`）在 Task 2 定义、Task 3 消费，命名一致；`Tabs` / `TabsList` / `TabsTrigger` / `TabsContent` 与 `frontend/src/components/ui/tabs.tsx` 导出一致。
