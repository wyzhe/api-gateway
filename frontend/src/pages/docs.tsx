import { CodeBlock } from "@/components/ui/code-block";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shell";

export function DocsPage() {
  const base = location.origin;
  const curlChat = `curl ${base}/v1/chat/completions \\
  -H "Authorization: Bearer lgw_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello"}]
  }'`;
  const curlImg = `curl ${base}/v1/images/generations \\
  -H "Authorization: Bearer lgw_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-image-2","prompt":"a small red apple","resolution":"1k"}'

# returns { "task_id": "task_42", ... }

curl ${base}/v1/tasks/task_42 \\
  -H "Authorization: Bearer lgw_YOUR_KEY"`;
  const curlVid = `curl ${base}/v1/videos/generations \\
  -H "Authorization: Bearer lgw_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model":"sora2",
    "prompt":"a calm ocean wave at sunset",
    "duration":4,
    "resolution":"720p",
    "aspect_ratio":"16:9"
  }'`;
  const pySdk = `from openai import OpenAI

client = OpenAI(
    api_key="lgw_YOUR_KEY",
    base_url="${base}/v1",
)

resp = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello"}],
)
print(resp.choices[0].message.content)`;

  return (
    <div className="max-w-4xl">
      <PageHeader title="Docs" subtitle="OpenAI-compatible — drop-in replacement for most SDKs." />

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader><CardTitle>Authentication</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground flex flex-col gap-3">
            <p>
              All <span className="mono text-foreground">/v1/*</span> calls require an{" "}
              <span className="mono text-foreground">Authorization: Bearer lgw_…</span> header. Create a key
              on the <span className="text-foreground">API Keys</span> page.
            </p>
            <p>Dashboard APIs under <span className="mono text-foreground">/api/*</span> use a JWT obtained at <span className="mono text-foreground">/api/auth/login</span>.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Chat completions</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <CodeBlock lang="bash" code={curlChat} />
            <p className="text-xs text-muted-foreground">
              Supports <span className="mono">stream=true</span> via SSE. The gateway forces{" "}
              <span className="mono">stream_options.include_usage=true</span> so the final chunk carries{" "}
              <span className="mono">usage</span> for billing.
            </p>
            <CodeBlock lang="python" code={pySdk} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Image generation (async)</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              APIMart processes images asynchronously. The gateway returns a{" "}
              <span className="mono text-foreground">task_id</span>; poll{" "}
              <span className="mono text-foreground">/v1/tasks/{`{task_id}`}</span> until status is{" "}
              <span className="mono text-foreground">succeeded</span>.
            </p>
            <CodeBlock lang="bash" code={curlImg} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Video generation (async)</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <CodeBlock lang="bash" code={curlVid} />
            <p className="text-xs text-muted-foreground">
              Video tasks typically take 1–3 minutes. Use the same{" "}
              <span className="mono text-foreground">/v1/tasks/{`{task_id}`}</span> endpoint to poll.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
