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
      <PageHeader title={t("docs.title")} />

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
