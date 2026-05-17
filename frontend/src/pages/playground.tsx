import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeBlock } from "@/components/ui/code-block";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { TypeBadge } from "@/components/type-badge";
import { PageHeader } from "@/components/shell";
import { api, gateway, gatewayStream } from "@/lib/api";
import { fmtCompactMoney } from "@/lib/utils";

type Model = {
  id: number;
  public_name: string;
  type: string;
  display_provider: string | null;
};

type ApiKey = { id: number; name: string; key_prefix: string; status: string };

export function PlaygroundPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [keyValue, setKeyValue] = useState<string>(
    () => localStorage.getItem("lgw_pg_key") || "",
  );

  useEffect(() => {
    api<Model[]>("/api/models").then(setModels).catch(() => {});
    api<ApiKey[]>("/api/keys").then((ks) => setKeys(ks.filter((k) => k.status === "active"))).catch(() => {});
  }, []);

  const onKeyChange = (v: string) => {
    setKeyValue(v);
    localStorage.setItem("lgw_pg_key", v);
  };

  const byType = useMemo(
    () => ({
      text: models.filter((m) => m.type === "text"),
      image: models.filter((m) => m.type === "image"),
      video: models.filter((m) => m.type === "video"),
    }),
    [models],
  );

  return (
    <div>
      <PageHeader
        title="Playground"
        subtitle="API debugger — hits /v1/* with one of your real API keys."
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5 grow min-w-72">
            <Label>API Key (Bearer)</Label>
            <Input
              type="password"
              placeholder="Paste your lgw_... key here"
              className="mono"
              value={keyValue}
              onChange={(e) => onKeyChange(e.target.value)}
            />
            <span className="text-[10px] text-muted-foreground">
              Stored locally in your browser. Keys are write-once on creation — paste here to use.
              {keys.length > 0 && (
                <> {keys.length} active key{keys.length > 1 ? "s" : ""} on your account (prefixes: {keys.map((k) => k.key_prefix).join(", ")}).</>
              )}
            </span>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="chat">
        <TabsList>
          <TabsTrigger value="chat"><TypeBadge type="text" />&nbsp;Chat</TabsTrigger>
          <TabsTrigger value="image"><TypeBadge type="image" />&nbsp;Image</TabsTrigger>
          <TabsTrigger value="video"><TypeBadge type="video" />&nbsp;Video</TabsTrigger>
        </TabsList>

        <TabsContent value="chat">
          <ChatTab models={byType.text} apiKey={keyValue} />
        </TabsContent>
        <TabsContent value="image">
          <ImageTab models={byType.image} apiKey={keyValue} />
        </TabsContent>
        <TabsContent value="video">
          <VideoTab models={byType.video} apiKey={keyValue} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function useUnmountCleanup(cleanup: () => void) {
  // Stable cleanup ref so leaving the page aborts streams / polling.
  const ref = useRef(cleanup);
  ref.current = cleanup;
  useEffect(() => () => ref.current(), []);
}

/* ---------------- Chat ---------------- */
function ChatTab({ models, apiKey }: { models: Model[]; apiKey: string }) {
  const [model, setModel] = useState("");
  const [system, setSystem] = useState("You are a helpful assistant.");
  const [userMsg, setUserMsg] = useState("Reply with the single word PONG.");
  const [temperature, setTemperature] = useState(1);
  const [maxTokens, setMaxTokens] = useState(256);
  const [stream, setStream] = useState(true);
  const [output, setOutput] = useState("");
  const [rawReq, setRawReq] = useState<any>(null);
  const [rawResp, setRawResp] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  useUnmountCleanup(() => abortRef.current?.abort());

  useEffect(() => {
    if (!model && models.length) setModel(models[0].public_name);
  }, [models, model]);

  const buildPayload = () => ({
    model,
    messages: [
      ...(system.trim() ? [{ role: "system", content: system }] : []),
      { role: "user", content: userMsg },
    ],
    temperature,
    max_tokens: maxTokens,
    stream,
  });

  const run = async () => {
    if (!apiKey) return toast.error("Paste an API key above first.");
    if (!model) return toast.error("Pick a model.");
    setOutput("");
    setRawResp(null);
    const payload = buildPayload();
    setRawReq(payload);
    setBusy(true);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    try {
      if (stream) {
        let acc = "";
        let finalUsage: any = null;
        for await (const ev of gatewayStream("/v1/chat/completions", apiKey, payload, abortRef.current.signal)) {
          if (!ev.parsed) continue;
          if (ev.parsed.error) {
            toast.error(ev.parsed.error.message || "Stream error");
            setRawResp(ev.parsed);
            return;
          }
          const delta = ev.parsed.choices?.[0]?.delta?.content;
          if (delta) {
            acc += delta;
            setOutput(acc);
          }
          if (ev.parsed.usage) finalUsage = ev.parsed.usage;
        }
        setRawResp({ _streamed: true, usage: finalUsage, text: acc });
      } else {
        const res = await gateway("/v1/chat/completions", apiKey, { method: "POST", body: payload });
        setRawResp(res.body);
        if (res.status >= 400) {
          toast.error(JSON.stringify(res.body?.detail || res.body).slice(0, 200));
          return;
        }
        const text = res.body?.choices?.[0]?.message?.content ?? "";
        setOutput(text);
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") toast.error(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const curl = `curl ${location.origin}/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(buildPayload())}'`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle>Request</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label>Model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger><SelectValue placeholder="Choose a model" /></SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.public_name}>{m.public_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-1.5 grow">
                <Label>Stream</Label>
                <Switch checked={stream} onCheckedChange={setStream} />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>System prompt</Label>
            <Textarea value={system} onChange={(e) => setSystem(e.target.value)} rows={2} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>User message</Label>
            <Textarea value={userMsg} onChange={(e) => setUserMsg(e.target.value)} rows={5} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Temperature</Label>
              <Input
                type="number"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Max tokens</Label>
              <Input
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={run} disabled={busy}><Play className="h-3.5 w-3.5" /> Run</Button>
            {busy && (
              <Button variant="outline" onClick={() => abortRef.current?.abort()}>
                <Square className="h-3.5 w-3.5" /> Stop
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Response</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="rounded-md border border-border bg-surface-2 min-h-32 p-3 text-sm whitespace-pre-wrap mono">
            {output || <span className="text-muted-foreground">— output appears here —</span>}
          </div>
          {rawResp?.usage && (
            <div className="text-xs text-muted-foreground flex gap-3">
              <span>Tokens: {rawResp.usage.total_tokens}</span>
              {rawResp._gateway?.cost && <span>Cost: {fmtCompactMoney(rawResp._gateway.cost)}</span>}
              {rawResp._gateway?.latency_ms && <span>Latency: {rawResp._gateway.latency_ms}ms</span>}
            </div>
          )}
          <div>
            <Label>Raw request</Label>
            <CodeBlock lang="json" code={JSON.stringify(rawReq, null, 2)} maxHeight="10rem" />
          </div>
          <div>
            <Label>Raw response</Label>
            <CodeBlock lang="json" code={JSON.stringify(rawResp, null, 2)} maxHeight="14rem" />
          </div>
          <div>
            <Label>curl</Label>
            <CodeBlock lang="bash" code={curl} maxHeight="10rem" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- Image ---------------- */
function ImageTab({ models, apiKey }: { models: Model[]; apiKey: string }) {
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("a small red apple on a white background, studio lighting");
  const [size, setSize] = useState("1:1");
  const [n, setN] = useState(1);
  const [busy, setBusy] = useState(false);
  const [submitResp, setSubmitResp] = useState<any>(null);
  const [pollResp, setPollResp] = useState<any>(null);
  const [taskStatus, setTaskStatus] = useState<string>("");
  const [assetUrl, setAssetUrl] = useState<string | null>(null);
  const [rawReq, setRawReq] = useState<any>(null);
  const cancelRef = useRef({ cancelled: false });
  useUnmountCleanup(() => (cancelRef.current.cancelled = true));

  useEffect(() => {
    if (!model && models.length) setModel(models[0].public_name);
  }, [models, model]);

  const buildPayload = () => ({ model, prompt, size, n, resolution: "1k" });

  const run = async () => {
    if (!apiKey) return toast.error("Paste an API key above first.");
    cancelRef.current = { cancelled: false };
    const cancel = cancelRef.current;
    setBusy(true);
    setSubmitResp(null);
    setPollResp(null);
    setAssetUrl(null);
    setTaskStatus("submitting");
    const payload = buildPayload();
    setRawReq(payload);
    try {
      const res = await gateway("/v1/images/generations", apiKey, { method: "POST", body: payload });
      if (cancel.cancelled) return;
      setSubmitResp(res.body);
      if (res.status >= 400) {
        toast.error(JSON.stringify(res.body?.detail || res.body).slice(0, 200));
        setTaskStatus("failed");
        return;
      }
      const taskId: string | undefined = res.body?.task_id;
      if (!taskId) {
        toast.error("Upstream did not return a task_id");
        setTaskStatus("failed");
        return;
      }
      setTaskStatus("queued");
      let lastStatus = "queued";
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, i === 0 ? 6000 : 4000));
        if (cancel.cancelled) return;
        const p = await gateway(`/v1/tasks/${taskId}`, apiKey);
        const s = p.body?.status as string;
        if (s !== lastStatus) {
          setPollResp(p.body);
          setTaskStatus(s);
          lastStatus = s;
        }
        if (s === "succeeded") {
          setAssetUrl(p.body?.asset_url);
          setPollResp(p.body);
          toast.success("Image ready");
          break;
        }
        if (s === "failed") {
          setPollResp(p.body);
          toast.error(p.body?.error_message || "Generation failed");
          break;
        }
      }
    } catch (e: any) {
      if (!cancel.cancelled) toast.error(String(e?.message || e));
    } finally {
      if (!cancel.cancelled) setBusy(false);
    }
  };

  const curl = `curl ${location.origin}/v1/images/generations \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(buildPayload())}'`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle>Request</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Model</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger><SelectValue placeholder="Choose a model" /></SelectTrigger>
              <SelectContent>
                {models.map((m) => <SelectItem key={m.id} value={m.public_name}>{m.public_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Prompt</Label>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Size</Label>
              <Select value={size} onValueChange={setSize}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1:1">1:1</SelectItem>
                  <SelectItem value="16:9">16:9</SelectItem>
                  <SelectItem value="9:16">9:16</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>N</Label>
              <Input type="number" min={1} max={4} value={n} onChange={(e) => setN(Number(e.target.value))} />
            </div>
          </div>
          <Button onClick={run} disabled={busy}><Play className="h-3.5 w-3.5" /> Generate</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Result</CardTitle>
          {taskStatus && (
            <Badge variant={taskStatus === "succeeded" ? "success" : taskStatus === "failed" ? "danger" : "info"}>
              {taskStatus}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="rounded-md border border-border bg-surface-2 min-h-40 flex items-center justify-center overflow-hidden">
            {assetUrl ? (
              <a href={assetUrl} target="_blank" rel="noreferrer">
                <img src={assetUrl} className="max-w-full max-h-96 object-contain" />
              </a>
            ) : (
              <span className="text-muted-foreground text-sm">{busy ? "Waiting for upstream…" : "— image appears here —"}</span>
            )}
          </div>
          <div>
            <Label>Raw request</Label>
            <CodeBlock lang="json" code={JSON.stringify(rawReq, null, 2)} maxHeight="8rem" />
          </div>
          <div>
            <Label>Submission response</Label>
            <CodeBlock lang="json" code={JSON.stringify(submitResp, null, 2)} maxHeight="10rem" />
          </div>
          {pollResp && (
            <div>
              <Label>Last poll</Label>
              <CodeBlock lang="json" code={JSON.stringify(pollResp, null, 2)} maxHeight="10rem" />
            </div>
          )}
          <div>
            <Label>curl</Label>
            <CodeBlock lang="bash" code={curl} maxHeight="8rem" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- Video ---------------- */
function VideoTab({ models, apiKey }: { models: Model[]; apiKey: string }) {
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("a calm ocean wave at sunset, cinematic");
  const [duration, setDuration] = useState(4);
  const [aspect, setAspect] = useState("16:9");
  const [resolution, setResolution] = useState("720p");
  const [busy, setBusy] = useState(false);
  const [submitResp, setSubmitResp] = useState<any>(null);
  const [pollResp, setPollResp] = useState<any>(null);
  const [taskStatus, setTaskStatus] = useState("");
  const [assetUrl, setAssetUrl] = useState<string | null>(null);
  const [rawReq, setRawReq] = useState<any>(null);
  const cancelRef = useRef({ cancelled: false });
  useUnmountCleanup(() => (cancelRef.current.cancelled = true));

  useEffect(() => {
    if (!model && models.length) setModel(models[0].public_name);
  }, [models, model]);

  const buildPayload = () => ({ model, prompt, duration, aspect_ratio: aspect, resolution });

  const run = async () => {
    if (!apiKey) return toast.error("Paste an API key above first.");
    cancelRef.current = { cancelled: false };
    const cancel = cancelRef.current;
    setBusy(true);
    setSubmitResp(null);
    setPollResp(null);
    setAssetUrl(null);
    setTaskStatus("submitting");
    const payload = buildPayload();
    setRawReq(payload);
    try {
      const res = await gateway("/v1/videos/generations", apiKey, { method: "POST", body: payload });
      if (cancel.cancelled) return;
      setSubmitResp(res.body);
      if (res.status >= 400) {
        toast.error(JSON.stringify(res.body?.detail || res.body).slice(0, 200));
        setTaskStatus("failed");
        return;
      }
      const taskId: string | undefined = res.body?.task_id;
      if (!taskId) {
        toast.error("Upstream did not return a task_id");
        setTaskStatus("failed");
        return;
      }
      setTaskStatus("queued");
      let lastStatus = "queued";
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, i === 0 ? 8000 : 6000));
        if (cancel.cancelled) return;
        const p = await gateway(`/v1/tasks/${taskId}`, apiKey);
        const s = p.body?.status as string;
        if (s !== lastStatus) {
          setPollResp(p.body);
          setTaskStatus(s);
          lastStatus = s;
        }
        if (s === "succeeded") {
          setAssetUrl(p.body?.asset_url);
          setPollResp(p.body);
          toast.success("Video ready");
          break;
        }
        if (s === "failed") {
          setPollResp(p.body);
          toast.error(p.body?.error_message || "Video failed");
          break;
        }
      }
    } catch (e: any) {
      if (!cancel.cancelled) toast.error(String(e?.message || e));
    } finally {
      if (!cancel.cancelled) setBusy(false);
    }
  };

  const curl = `curl ${location.origin}/v1/videos/generations \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(buildPayload())}'`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle>Request</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Model</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger><SelectValue placeholder="Choose a model" /></SelectTrigger>
              <SelectContent>
                {models.map((m) => <SelectItem key={m.id} value={m.public_name}>{m.public_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Prompt</Label>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Duration (s)</Label>
              <Input type="number" min={4} max={20} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Aspect</Label>
              <Select value={aspect} onValueChange={setAspect}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="16:9">16:9</SelectItem>
                  <SelectItem value="9:16">9:16</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Resolution</Label>
              <Select value={resolution} onValueChange={setResolution}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="720p">720p</SelectItem>
                  <SelectItem value="1024p">1024p</SelectItem>
                  <SelectItem value="1080p">1080p</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={run} disabled={busy}><Play className="h-3.5 w-3.5" /> Generate</Button>
          <p className="text-xs text-muted-foreground">Video tasks typically take 1–3 minutes. The page polls automatically.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Result</CardTitle>
          {taskStatus && (
            <Badge variant={taskStatus === "succeeded" ? "success" : taskStatus === "failed" ? "danger" : "info"}>
              {taskStatus}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="rounded-md border border-border bg-surface-2 min-h-40 flex items-center justify-center overflow-hidden">
            {assetUrl ? (
              <video src={assetUrl} controls className="max-w-full max-h-96" />
            ) : (
              <span className="text-muted-foreground text-sm">{busy ? "Generating…" : "— video appears here —"}</span>
            )}
          </div>
          <div>
            <Label>Raw request</Label>
            <CodeBlock lang="json" code={JSON.stringify(rawReq, null, 2)} maxHeight="8rem" />
          </div>
          <div>
            <Label>Submission response</Label>
            <CodeBlock lang="json" code={JSON.stringify(submitResp, null, 2)} maxHeight="10rem" />
          </div>
          {pollResp && (
            <div>
              <Label>Last poll</Label>
              <CodeBlock lang="json" code={JSON.stringify(pollResp, null, 2)} maxHeight="10rem" />
            </div>
          )}
          <div>
            <Label>curl</Label>
            <CodeBlock lang="bash" code={curl} maxHeight="8rem" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
