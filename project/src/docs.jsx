/* Docs */

function DocsPage({ onNavigate, publicMode }) {
  const [active, setActive] = useState("quickstart");

  const sections = [
    { id: "intro", label: "Introduction", group: "Getting started" },
    { id: "quickstart", label: "Quickstart", group: "Getting started" },
    { id: "auth", label: "Get an API key", group: "Getting started" },
    { id: "base-url", label: "Change base_url", group: "Getting started" },
    { id: "models-list", label: "Available models", group: "Reference" },
    { id: "chat", label: "Chat completions", group: "Reference" },
    { id: "streaming", label: "Streaming", group: "Reference" },
    { id: "tools", label: "Tool calling", group: "Reference" },
    { id: "images", label: "Image generation", group: "Generation APIs" },
    { id: "videos", label: "Video generation", group: "Generation APIs" },
    { id: "tasks", label: "Task status", group: "Generation APIs" },
    { id: "files", label: "Files & assets", group: "Generation APIs" },
    { id: "capabilities", label: "Model capabilities", group: "Reference" },
    { id: "errors", label: "Errors", group: "Reference" },
    { id: "pricing", label: "Pricing rules", group: "Billing" },
    { id: "limits", label: "Rate limits", group: "Billing" },
  ];

  return (
    <div className="page-body">
      <div className="docs-layout">
        <aside className="docs-toc">
          {[...new Set(sections.map(s => s.group))].map(g => (
            <div key={g} className="docs-toc-section">
              <div className="label">{g}</div>
              {sections.filter(s => s.group === g).map(s => (
                <a key={s.id} className={`docs-toc-link ${active === s.id ? "active" : ""}`} onClick={() => setActive(s.id)}>
                  {s.label}
                </a>
              ))}
            </div>
          ))}
          <div className="docs-toc-section">
            <div className="label">Help</div>
            <a className="docs-toc-link" onClick={() => onNavigate("status")}>System status →</a>
            <a className="docs-toc-link">Contact support →</a>
          </div>
        </aside>

        <div className="docs-content">
          {publicMode && (
            <div style={{ marginBottom: 18 }}>
              <Banner tone="info" title="Public documentation"
                action={<button className="btn sm primary">Request access</button>}>
                You can read everything below without a Relay account. To run any of these examples you need an API key, issued by your admin after access is granted.
              </Banner>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--fg-faint)", marginBottom: 10 }}>
            <span>Docs</span>
            <span style={{ color: "var(--fg-dim)" }}>/</span>
            <span>Getting started</span>
            <span style={{ color: "var(--fg-dim)" }}>/</span>
            <span style={{ color: "var(--fg-muted)" }}>Quickstart</span>
          </div>
          <h1>Quickstart</h1>
          <p className="docs-lede">
            Relay exposes a unified API for chat, image generation, and video generation. Chat and image endpoints follow the OpenAI request/response shape and work with the official <code>openai</code> SDKs as a drop-in. Video generation is asynchronous and uses Relay's task-based HTTP API — OpenAI SDKs don't cover this surface yet.
          </p>

          <div style={{ display: "flex", gap: 12, margin: "20px 0 28px", flexWrap: "wrap" }}>
            <Badge tone="info">~ 2 min</Badge>
            <Badge tone="muted">Chat: OpenAI SDK compatible</Badge>
            <Badge tone="muted">Image: OpenAI SDK compatible</Badge>
            <Badge tone="muted">Video: Relay HTTP API</Badge>
          </div>

          <h2>1. Get your API key</h2>
          <p>
            Go to <a onClick={() => onNavigate("keys")} style={{ color: "var(--accent)", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>workspace / API Keys</a> and click <strong>New key</strong>. Pick a name, an environment (<code>live</code> or <code>test</code>), and a monthly spend cap.
          </p>
          <p>
            Relay shows the full key <strong>once</strong>. Store it in your secret manager. Keys look like:
          </p>
          <Code lang="bash" code={`rl_live_4xK8aZpN3wQbR7vM2dL9aT2cF1gH6jK4mN8pQrSt
rl_test_2hL9q8R4xK7vM1cF6jK4mN8pQrStUv3wXyZbE5dG`} />

          <h2>2. Change <code>base_url</code></h2>
          <p>Set the base URL to <code>https://api.relay.gateway/v1</code> and pass the Relay key as your API key.</p>

          <Code
            tabs={[
              {
                lang: "python", label: "Python",
                code: `from openai import OpenAI
import os

client = OpenAI(
    base_url="https://api.relay.gateway/v1",
    api_key=os.environ["RELAY_API_KEY"],
)

resp = client.chat.completions.create(
    model="claude-sonnet-4.5",
    messages=[{"role":"user","content":"Hello"}],
)
print(resp.choices[0].message.content)`
              },
              {
                lang: "js", label: "Node.js",
                code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.relay.gateway/v1",
  apiKey: process.env.RELAY_API_KEY,
});

const resp = await client.chat.completions.create({
  model: "gpt-5-mini",
  messages: [{ role: "user", content: "Hello" }],
});

console.log(resp.choices[0].message.content);`
              },
              {
                lang: "curl", label: "cURL",
                code: `curl https://api.relay.gateway/v1/chat/completions \\
  -H "Authorization: Bearer $RELAY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gemini-2.5-pro",
    "messages": [{"role":"user","content":"Hello"}]
  }'`
              },
            ]}
          />

          <h2>3. Pick a model</h2>
          <p>
            The <code>model</code> field accepts any model name from the table below. Relay routes to the appropriate provider — you don't need to call the provider's SDK directly.
          </p>
          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table className="table" style={{ fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Type</th>
                  <th>Provider</th>
                  <th>Pricing</th>
                  <th>Capability / Limit</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...window.GW_DATA.TEXT_MODELS.slice(0, 3),
                  ...window.GW_DATA.IMAGE_MODELS.slice(0, 2),
                  ...window.GW_DATA.VIDEO_MODELS.slice(0, 2),
                ].map(m => (
                  <tr key={m.id}>
                    <td className="mono">{m.name}</td>
                    <td><TypeBadge type={m.type} /></td>
                    <td><ProviderTag provider={m.provider} /></td>
                    <td><PricingTag model={m} /></td>
                    <td className="dim">
                      {m.type === "text"  && <>{(m.ctx/1000).toLocaleString()}k ctx{m.vision ? " · vision" : ""}{m.tools ? " · tools" : ""}{m.stream ? " · stream" : ""}</>}
                      {m.type === "image" && <>≤ {m.maxSize} · {m.capabilities.join(", ")}</>}
                      {m.type === "video" && <>≤ {m.maxDuration}s {m.maxResolution} · {m.capabilities.join(", ")}</>}
                    </td>
                    <td>
                      {m.status === "ok"   && <Badge tone="success" dot>operational</Badge>}
                      {m.status === "warn" && <Badge tone="warn" dot>degraded</Badge>}
                      {m.status === "down" && <Badge tone="danger" dot>offline</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>4. Streaming</h2>
          <p>Pass <code>stream: true</code> for server-sent events. Relay forwards the upstream stream verbatim.</p>
          <Code lang="python" code={`stream = client.chat.completions.create(
    model="gpt-5-mini",
    messages=[{"role":"user","content":"Stream me a poem"}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="")`} />

          <h2 id="images">Image generation</h2>
          <p>Image generation is exposed at <code>POST /v1/images/generations</code>, mirroring the OpenAI shape. Both text-to-image and image-to-image work with the same endpoint — attach a reference image to switch to img2img.</p>
          <div style={{ display: "flex", gap: 8, margin: "12px 0 18px" }}>
            <Badge tone="info">Synchronous</Badge>
            <Badge tone="muted">gpt-image-2 · nano-banana · grok-imagine</Badge>
            <Badge tone="muted">priced per image</Badge>
          </div>
          <Code
            tabs={[
              { lang: "python", label: "Python", code: `client.images.generate(
    model="gpt-image-2",
    prompt="editorial portrait of a marathon runner mid-stride, golden hour",
    size="1024x1024",
    n=2,
)` },
              { lang: "curl", label: "cURL", code: `curl https://api.relay.gateway/v1/images/generations \\
  -H "Authorization: Bearer $RELAY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-image-2",
    "prompt": "editorial portrait…",
    "size": "1024x1024",
    "n": 2
  }'` },
              { lang: "js", label: "Node.js", code: `await client.images.generate({
  model: "nano-banana-pro",
  prompt: "top-down flat lay of vintage developer keyboards",
  size: "2048x2048",
  n: 1,
});` },
            ]}
          />
          <h3>Image-to-image</h3>
          <p>Provide an <code>image</code> URL (or base64-encoded data URL) and a <code>strength</code> between 0 and 1. Strength controls how much the source image is preserved — 0 keeps it intact, 1 ignores it.</p>
          <Code lang="curl" code={`curl https://api.relay.gateway/v1/images/generations \\
  -H "Authorization: Bearer $RELAY_API_KEY" \\
  -d '{
    "model": "nano-banana-pro",
    "prompt": "in the style of a 1980s Polaroid",
    "image": "https://your.host/reference.png",
    "strength": 0.65
  }'`} />
          <p style={{ marginTop: 14 }}>
            Responses include <code>data[].url</code> pointing to a Relay CDN object that's valid for 24 hours. Copy it into your own storage if you need it permanently.
          </p>

          <h2 id="videos">Video generation</h2>
          <p>Video calls are <strong>asynchronous</strong>. <code>POST /v1/videos/generations</code> returns a task object immediately; you then poll <code>GET /v1/videos/tasks/&#123;id&#125;</code> until the task reaches a terminal status.</p>
          <div style={{ display: "flex", gap: 8, margin: "12px 0 18px" }}>
            <Badge tone="info">Async</Badge>
            <Badge tone="muted">veo-3.1 · veo-3.1-fast · grok-imagine-video</Badge>
            <Badge tone="muted">priced per second</Badge>
          </div>
          <Banner tone="info" title="Video uses Relay's HTTP API, not the OpenAI SDK">
            The OpenAI SDKs don't model async tasks. Use plain HTTP (curl / requests / fetch) and poll the task endpoint until it terminates.
          </Banner>
          <Code
            tabs={[
              { lang: "curl", label: "cURL", code: `# create
curl https://api.relay.gateway/v1/videos/generations \\
  -H "Authorization: Bearer $RELAY_API_KEY" \\
  -d '{
    "model": "veo-3.1",
    "prompt": "drone flyover of a coastline at dawn…",
    "duration": 8,
    "resolution": "1920x1080"
  }'

# poll
curl https://api.relay.gateway/v1/videos/tasks/task_2x9pR4kL \\
  -H "Authorization: Bearer $RELAY_API_KEY"` },
              { lang: "python", label: "Python (requests)", code: `import os, time, requests

base = "https://api.relay.gateway/v1"
h = {"Authorization": f"Bearer {os.environ['RELAY_API_KEY']}"}

# 1) Create the task
task = requests.post(f"{base}/videos/generations", headers=h, json={
    "model": "veo-3.1",
    "prompt": "drone flyover of a coastline at dawn, cinematic teal-orange",
    "duration": 8,
    "resolution": "1920x1080",
    "aspect_ratio": "16:9",
}).json()

# 2) Poll until done
while task["status"] not in ("succeeded", "failed"):
    time.sleep(2)
    task = requests.get(f"{base}/videos/tasks/{task['id']}", headers=h).json()

print(task["result"]["url"])` },
              { lang: "js", label: "Node (fetch)", code: `const base = "https://api.relay.gateway/v1";
const h = { Authorization: \`Bearer \${process.env.RELAY_API_KEY}\`, "Content-Type": "application/json" };

let task = await fetch(\`\${base}/videos/generations\`, {
  method: "POST", headers: h,
  body: JSON.stringify({
    model: "veo-3.1",
    prompt: "drone flyover of a coastline at dawn…",
    duration: 8,
    resolution: "1920x1080",
  }),
}).then(r => r.json());

while (!["succeeded", "failed"].includes(task.status)) {
  await new Promise(r => setTimeout(r, 2000));
  task = await fetch(\`\${base}/videos/tasks/\${task.id}\`, { headers: h }).then(r => r.json());
}

console.log(task.result.url);` },
            ]}
          />
          <h3>Image-to-video</h3>
          <p>Pass an <code>image</code> URL or base64 to use the image as the first frame. Useful for stable B-roll generation from a still you've already approved.</p>
          <Code lang="curl" code={`curl https://api.relay.gateway/v1/videos/generations \\
  -H "Authorization: Bearer $RELAY_API_KEY" \\
  -d '{
    "model": "veo-3.1-fast",
    "prompt": "camera slowly pushes in, leaves drift through the frame",
    "image": "https://your.host/first_frame.png",
    "duration": 6
  }'`} />

          <h2 id="tasks">Task status</h2>
          <p>Asynchronous endpoints (currently only video) return a task object you poll with <code>GET /v1/videos/tasks/&#123;id&#125;</code>. Possible <code>status</code> values:</p>
          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table className="table">
              <thead><tr><th>Status</th><th>Meaning</th><th>What to do</th></tr></thead>
              <tbody>
                <tr><td><TaskState state="queued" /></td>    <td className="dim">Accepted, waiting for a worker.</td><td className="dim">Poll every 1–2 s. Typical wait under 15 s.</td></tr>
                <tr><td><TaskState state="running" /></td>   <td className="dim">Rendering frames. <code>progress</code> is a 0–100 integer.</td><td className="dim">Poll every 2–5 s. Render time scales with duration.</td></tr>
                <tr><td><TaskState state="succeeded" /></td> <td className="dim">Result available at <code>result.url</code>. Billed.</td><td className="dim">Download the asset. URL valid 24h.</td></tr>
                <tr><td><TaskState state="failed" /></td>    <td className="dim">Provider error in <code>error</code>. No tokens billed.</td><td className="dim">Inspect <code>error.type</code> and adjust prompt or model.</td></tr>
              </tbody>
            </table>
          </div>
          <h3>Complete response example</h3>
          <p>The response shape stays consistent across states. Fields that don't apply are <code>null</code>.</p>
          <Code lang="json" code={`{
  "id": "task_2x9pR4kL",
  "object": "video.task",
  "model": "veo-3.1",
  "created": 1747497032,
  "finished": 1747497074,
  "status": "succeeded",
  "progress": 100,
  "request": {
    "prompt": "drone flyover of a coastline at dawn, cinematic teal-orange",
    "duration": 8,
    "resolution": "1920x1080",
    "aspect_ratio": "16:9"
  },
  "result": {
    "url": "https://relay.gateway/cdn/vid/abc…1.mp4",
    "poster_url": "https://relay.gateway/cdn/img/abc…1.jpg",
    "duration": 8,
    "fps": 30,
    "resolution": "1920x1080",
    "size_bytes": 8621042,
    "expires_at": 1747583468
  },
  "error": null,
  "usage": { "seconds": 8 },
  "cost": 2.80,
  "provider": "veo",
  "provider_task_id": "projects/relay-prod/operations/12345"
}`} />
          <p style={{ marginTop: 14 }}>Set up a webhook (<em>coming soon</em>) to be notified instead of polling.</p>

          <h2 id="capabilities">Model capabilities</h2>
          <p>What each modality supports today. Use the matrix to pick the right endpoint and model.</p>
          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table className="table">
              <thead><tr><th>Modality</th><th>Endpoint</th><th>SDK</th><th>Streaming</th><th>Tools</th><th>Async</th><th>Notes</th></tr></thead>
              <tbody>
                <tr>
                  <td><TypeBadge type="text" /></td>
                  <td className="mono dim">POST /v1/chat/completions</td>
                  <td className="dim">OpenAI</td>
                  <td>yes</td>
                  <td>yes</td>
                  <td>no</td>
                  <td className="dim">JSON mode, vision input, function calling</td>
                </tr>
                <tr>
                  <td><TypeBadge type="image" /></td>
                  <td className="mono dim">POST /v1/images/generations</td>
                  <td className="dim">OpenAI</td>
                  <td>no</td>
                  <td>n/a</td>
                  <td>no</td>
                  <td className="dim">Text-to-image, image-to-image, inpaint (provider-dependent)</td>
                </tr>
                <tr>
                  <td><TypeBadge type="video" /></td>
                  <td className="mono dim">POST /v1/videos/generations</td>
                  <td className="dim">Relay HTTP</td>
                  <td>n/a</td>
                  <td>n/a</td>
                  <td>yes</td>
                  <td className="dim">Returns a task object; poll <code>GET /v1/videos/tasks/&#123;id&#125;</code></td>
                </tr>
                <tr>
                  <td><Badge tone="muted">FILE</Badge></td>
                  <td className="mono dim">POST /v1/files</td>
                  <td className="dim">Relay HTTP</td>
                  <td>no</td>
                  <td>n/a</td>
                  <td>no</td>
                  <td className="dim">Upload reference images for img2img / img2video</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h2 id="files">File upload &amp; assets</h2>
          <p>For image-to-image or image-to-video you can either pass an inline URL or upload a file to Relay first and reference its id. Direct upload is required for files &gt; 4 MB.</p>
          <Code lang="curl" code={`# 1) Upload
curl https://api.relay.gateway/v1/files \\
  -H "Authorization: Bearer $RELAY_API_KEY" \\
  -F purpose="reference" \\
  -F file=@./first_frame.png

# Response
# { "id": "file_2x9pR4kL", "size": 2104982, "expires_at": 1747583468 }

# 2) Reference it in a generation
curl https://api.relay.gateway/v1/videos/generations \\
  -H "Authorization: Bearer $RELAY_API_KEY" \\
  -d '{ "model": "veo-3.1-fast", "prompt": "…", "file_id": "file_2x9pR4kL" }'`} />
          <h3>Asset URLs</h3>
          <p>Generated images and videos are served from Relay's CDN under <code>https://relay.gateway/cdn/…</code>. These URLs are <strong>valid for 24 hours</strong> from the moment the asset was created. Copy assets to your own storage if you need them long-term.</p>
          <div className="dl" style={{ marginTop: 12 }}>
            <dt>Asset URL TTL</dt><dd>24 hours</dd>
            <dt>Uploaded file TTL</dt><dd>72 hours after last use</dd>
            <dt>Max upload size</dt><dd>8 MB per file</dd>
            <dt>Supported formats</dt><dd>PNG · JPG · WEBP · GIF · MP4 (input only)</dd>
          </div>
          <Banner tone="warn" title="Don't hot-link CDN URLs in production" >
            URLs expire after 24h. After that, requests return <code>404 asset_expired</code>. Persist what you need.
          </Banner>

          <h2 id="errors">Errors</h2>
          <p>
            Relay surfaces upstream errors as-is. We do <strong>not</strong> retry failed requests or fall back to a different model. If the provider returns a 429 or 5xx, your client sees it.
          </p>
          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table className="table error-table">
              <thead><tr><th>Code</th><th>Type</th><th>Meaning</th></tr></thead>
              <tbody>
                <tr><td className="ec">400</td><td>invalid_request</td><td>Request rejected before being sent to the provider. Check your message shape.</td></tr>
                <tr><td className="ec">401</td><td>invalid_api_key</td><td>API key is wrong, disabled, or revoked.</td></tr>
                <tr><td className="ec">402</td><td>insufficient_balance</td><td>Account balance is $0.00. Ask admin to top up.</td></tr>
                <tr><td className="ec">403</td><td>model_not_enabled</td><td>The requested model is disabled in your workspace.</td></tr>
                <tr><td className="ec">404</td><td>task_not_found</td><td>The video task id you polled doesn't exist or has expired.</td></tr>
                <tr><td className="ec">413</td><td>payload_too_large</td><td>Reference image exceeds 8 MB.</td></tr>
                <tr><td className="ec">422</td><td>content_policy_violation</td><td>Provider refused the prompt. No tokens billed.</td></tr>
                <tr><td className="ec">429</td><td>rate_limit_exceeded</td><td>Upstream provider rate-limited us. Try again after the Retry-After header.</td></tr>
                <tr><td className="ec">500</td><td>upstream_error</td><td>Provider returned an internal error. Original error body is in <code>error.message</code>.</td></tr>
                <tr><td className="ec">502</td><td>provider_timeout</td><td>Provider did not respond within 30s. No tokens billed.</td></tr>
                <tr><td className="ec">503</td><td>provider_offline</td><td>Provider has been disabled by your admin. See Status page.</td></tr>
              </tbody>
            </table>
          </div>

          <h2 id="pricing">Pricing rules</h2>
          <p>Cost is computed at request time from the provider's published price + a configurable margin (default <strong>0%</strong>). Different modalities use different units:</p>
          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table className="table">
              <thead><tr><th>Modality</th><th>Unit</th><th>How it's computed</th><th>Billed on</th></tr></thead>
              <tbody>
                <tr>
                  <td><TypeBadge type="text" /></td>
                  <td className="mono">per 1M tokens</td>
                  <td className="dim">(prompt_tokens × input_price + completion_tokens × output_price) ÷ 1,000,000</td>
                  <td className="dim">on 200 from upstream</td>
                </tr>
                <tr>
                  <td><TypeBadge type="image" /></td>
                  <td className="mono">per image</td>
                  <td className="dim">n × per_image_price (size doesn't affect price unless model specifies)</td>
                  <td className="dim">on 200 from upstream</td>
                </tr>
                <tr>
                  <td><TypeBadge type="video" /></td>
                  <td className="mono">per second</td>
                  <td className="dim">requested_duration × per_second_price</td>
                  <td className="dim">on task.status = "succeeded"</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: 14 }}>
            Token counts come directly from the upstream <code>usage</code> field. Image and video usage is computed from request parameters. Failed requests (any non-2xx, plus failed video tasks) are <strong>never billed</strong>.
          </p>
          <div style={{ marginTop: 16 }}>
            <Banner tone="info" title="Pricing is per-request, not per-month">
              Your balance is debited as each request completes. You can watch the balance drop in real time on the Dashboard.
            </Banner>
          </div>

          <h2 id="limits">Rate limits</h2>
          <p>Relay enforces two layers of limits: <strong>per-key</strong> caps you configure, and <strong>provider</strong> caps we can't control. Provider rate limits are surfaced verbatim as 429.</p>
          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table className="table">
              <thead><tr><th>Layer</th><th>Limit</th><th>Default</th><th>When hit</th></tr></thead>
              <tbody>
                <tr><td>Per key</td><td>Monthly spend cap</td><td className="mono dim">configurable (e.g. $100/mo)</td><td className="dim">402 spend_limit_exceeded</td></tr>
                <tr><td>Per key</td><td>Requests / minute</td><td className="mono dim">600 rpm</td><td className="dim">429 rate_limit_exceeded</td></tr>
                <tr><td>Per user</td><td>In-flight video tasks</td><td className="mono dim">3 concurrent</td><td className="dim">429 too_many_tasks</td></tr>
                <tr><td>Provider</td><td>Upstream RPM / TPM</td><td className="mono dim">whatever upstream allows</td><td className="dim">429 rate_limit_exceeded (forwarded)</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <aside className="docs-onthis">
          <div className="label">On this page</div>
          <a>1. Get your API key</a>
          <a>2. Change base_url</a>
          <a>3. Pick a model</a>
          <a>4. Streaming</a>
          <a>Image generation</a>
          <a>Video generation</a>
          <a>Task status</a>
          <a>Model capabilities</a>
          <a>File upload &amp; assets</a>
          <a>Errors</a>
          <a>Pricing rules</a>
          <a>Rate limits</a>
          <div style={{ marginTop: 18, padding: "12px 0", borderTop: "1px solid var(--border-soft)" }}>
            <div className="label">Was this helpful?</div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button className="btn sm">👍</button>
              <button className="btn sm">👎</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
window.DocsPage = DocsPage;
