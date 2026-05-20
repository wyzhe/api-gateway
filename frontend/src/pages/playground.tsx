import { useEffect, useMemo, useRef, useState } from "react";
import { Image as ImageIcon, Play, Square, Type as TypeIcon, Video as VideoIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeBlock } from "@/components/ui/code-block";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
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
import { PageHeader } from "@/components/shell";
import { api, gateway, gatewayStream } from "@/lib/api";
import { useDefaultModel } from "@/lib/hooks";
import { useT } from "@/lib/i18n";
import type { ApiKey, Model } from "@/lib/types";
import { API_KEY_RE, fmtCompactMoney, reqStatusKey } from "@/lib/utils";

export function PlaygroundPage() {
  const t = useT();
  const [models, setModels] = useState<Model[]>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  // Playground API key lives in sessionStorage only (cleared on tab close) so
  // an XSS that grabs `localStorage` can't lift it. Migrate any legacy
  // localStorage value once and then remove it.
  const [keyValue, setKeyValue] = useState<string>(() => {
    const legacy = localStorage.getItem("lgw_pg_key");
    if (legacy) {
      sessionStorage.setItem("lgw_pg_key", legacy);
      localStorage.removeItem("lgw_pg_key");
      return legacy;
    }
    return sessionStorage.getItem("lgw_pg_key") || "";
  });

  useEffect(() => {
    api<Model[]>("/api/models").then(setModels).catch(() => {});
    api<ApiKey[]>("/api/keys").then((ks) => setKeys(ks.filter((k) => k.status === "active"))).catch(() => {});
  }, []);

  const onKeyChange = (v: string) => {
    setKeyValue(v);
    if (v) sessionStorage.setItem("lgw_pg_key", v);
    else sessionStorage.removeItem("lgw_pg_key");
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
      <PageHeader title={t("playground.title")} />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5 grow min-w-72">
            <Label>{t("playground.apiKeyLabel")}</Label>
            <Input
              type="password"
              placeholder={t("playground.apiKeyPlaceholder")}
              className="mono"
              value={keyValue}
              onChange={(e) => onKeyChange(e.target.value)}
              pattern={API_KEY_RE.source}
              aria-invalid={!!keyValue && !API_KEY_RE.test(keyValue)}
            />
            {keys.length > 0 && (
              <span className="text-[11px] text-muted-foreground">
                {t("playground.apiKeyActive", {
                  count: keys.length,
                  prefixes: keys.map((k) => k.key_prefix).join(", "),
                })}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="chat">
        <TabsList>
          {([
            { value: "chat", Icon: TypeIcon, label: t("playground.tabChat") },
            { value: "image", Icon: ImageIcon, label: t("playground.tabImage") },
            { value: "video", Icon: VideoIcon, label: t("playground.tabVideo") },
          ] as const).map(({ value, Icon, label }) => (
            <TabsTrigger key={value} value={value} className="gap-1.5 min-w-24">
              <Icon className="h-3.5 w-3.5" />
              {label}
            </TabsTrigger>
          ))}
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
  const t = useT();
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

  useDefaultModel(models, model, setModel, "gpt-4o");

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
    if (!apiKey) return toast.error(t("playground.toastNeedApiKey"));
    if (!model) return toast.error(t("playground.toastPickModel"));
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
            toast.error(ev.parsed.error.message || t("playground.toastStreamError"));
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
        <CardHeader><CardTitle>{t("playground.cardRequest")}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label>{t("playground.modelLabel")}</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger><SelectValue placeholder={t("playground.modelPlaceholder")} /></SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.public_name}>{m.public_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-1.5 grow">
                <Label>{t("playground.streamLabel")}</Label>
                <Switch checked={stream} onCheckedChange={setStream} />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t("playground.systemPromptLabel")}</Label>
            <Textarea value={system} onChange={(e) => setSystem(e.target.value)} rows={2} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("playground.userMessageLabel")}</Label>
            <Textarea value={userMsg} onChange={(e) => setUserMsg(e.target.value)} rows={5} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("playground.temperatureLabel")}</Label>
              <NumberInput step={0.1} value={temperature} onChange={setTemperature} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("playground.maxTokensLabel")}</Label>
              <NumberInput value={maxTokens} onChange={setMaxTokens} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={run} disabled={busy} className="flex-1"><Play className="h-3.5 w-3.5" /> {t("playground.generateBtn")}</Button>
            {busy && (
              <Button variant="outline" onClick={() => abortRef.current?.abort()}>
                <Square className="h-3.5 w-3.5" /> {t("playground.stopBtn")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("playground.cardResponse")}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="rounded-md border border-border bg-surface-2 min-h-32 p-3 text-sm whitespace-pre-wrap mono">
            {output || <span className="text-muted-foreground">{t("playground.outputEmpty")}</span>}
          </div>
          {rawResp?.usage && (
            <div className="text-xs text-muted-foreground flex gap-3">
              <span>{t("playground.usageTokens", { tokens: rawResp.usage.total_tokens })}</span>
              {rawResp._gateway?.cost && <span>{t("playground.usageCost", { cost: fmtCompactMoney(rawResp._gateway.cost) })}</span>}
              {rawResp._gateway?.latency_ms && <span>{t("playground.usageLatency", { ms: rawResp._gateway.latency_ms })}</span>}
            </div>
          )}
          <div>
            <Label>{t("playground.rawRequest")}</Label>
            <CodeBlock lang="json" code={JSON.stringify(rawReq, null, 2)} maxHeight="10rem" />
          </div>
          <div>
            <Label>{t("playground.rawResponse")}</Label>
            <CodeBlock lang="json" code={JSON.stringify(rawResp, null, 2)} maxHeight="14rem" />
          </div>
          <div>
            <Label>{t("playground.curlLabel")}</Label>
            <CodeBlock lang="bash" code={curl} maxHeight="10rem" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- Image ---------------- */
function ImageTab({ models, apiKey }: { models: Model[]; apiKey: string }) {
  const t = useT();
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

  useDefaultModel(models, model, setModel, "gpt-image-2");

  const buildPayload = () => ({ model, prompt, size, n, resolution: "1k" });

  const run = async () => {
    if (!apiKey) return toast.error(t("playground.toastNeedApiKey"));
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
        toast.error(t("playground.toastNoTaskId"));
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
          toast.success(t("playground.toastImageReady"));
          break;
        }
        if (s === "failed") {
          setPollResp(p.body);
          toast.error(p.body?.error_message || t("playground.toastImageFailed"));
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
        <CardHeader><CardTitle>{t("playground.cardRequest")}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>{t("playground.modelLabel")}</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger><SelectValue placeholder={t("playground.modelPlaceholder")} /></SelectTrigger>
              <SelectContent>
                {models.map((m) => <SelectItem key={m.id} value={m.public_name}>{m.public_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("playground.promptLabel")}</Label>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("playground.sizeLabel")}</Label>
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
              <Label>{t("playground.nLabel")}</Label>
              <NumberInput min={1} max={4} value={n} onChange={setN} />
            </div>
          </div>
          <Button onClick={run} disabled={busy}><Play className="h-3.5 w-3.5" /> {t("playground.generateBtn")}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t("playground.cardResult")}</CardTitle>
          {taskStatus && (
            <Badge variant={taskStatus === "succeeded" ? "success" : taskStatus === "failed" ? "danger" : "info"}>
              {t(reqStatusKey(taskStatus))}
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
              <span className="text-muted-foreground text-sm">{busy ? t("playground.waitingUpstream") : t("playground.imageEmpty")}</span>
            )}
          </div>
          <div>
            <Label>{t("playground.rawRequest")}</Label>
            <CodeBlock lang="json" code={JSON.stringify(rawReq, null, 2)} maxHeight="8rem" />
          </div>
          <div>
            <Label>{t("playground.submissionResponse")}</Label>
            <CodeBlock lang="json" code={JSON.stringify(submitResp, null, 2)} maxHeight="10rem" />
          </div>
          {pollResp && (
            <div>
              <Label>{t("playground.lastPoll")}</Label>
              <CodeBlock lang="json" code={JSON.stringify(pollResp, null, 2)} maxHeight="10rem" />
            </div>
          )}
          <div>
            <Label>{t("playground.curlLabel")}</Label>
            <CodeBlock lang="bash" code={curl} maxHeight="8rem" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- Video ---------------- */
function VideoTab({ models, apiKey }: { models: Model[]; apiKey: string }) {
  const t = useT();
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

  useDefaultModel(models, model, setModel, "veo3");

  const buildPayload = () => ({ model, prompt, duration, aspect_ratio: aspect, resolution });

  const run = async () => {
    if (!apiKey) return toast.error(t("playground.toastNeedApiKey"));
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
        toast.error(t("playground.toastNoTaskId"));
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
          toast.success(t("playground.toastVideoReady"));
          break;
        }
        if (s === "failed") {
          setPollResp(p.body);
          toast.error(p.body?.error_message || t("playground.toastVideoFailed"));
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
        <CardHeader><CardTitle>{t("playground.cardRequest")}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>{t("playground.modelLabel")}</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger><SelectValue placeholder={t("playground.modelPlaceholder")} /></SelectTrigger>
              <SelectContent>
                {models.map((m) => <SelectItem key={m.id} value={m.public_name}>{m.public_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("playground.promptLabel")}</Label>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("playground.durationLabel")}</Label>
              <NumberInput min={4} max={20} value={duration} onChange={setDuration} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("playground.aspectLabel")}</Label>
              <Select value={aspect} onValueChange={setAspect}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="16:9">16:9</SelectItem>
                  <SelectItem value="9:16">9:16</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("playground.resolutionLabel")}</Label>
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
          <Button onClick={run} disabled={busy}><Play className="h-3.5 w-3.5" /> {t("playground.generateBtn")}</Button>
          <p className="text-xs text-muted-foreground">{t("playground.videoPollingHint")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t("playground.cardResult")}</CardTitle>
          {taskStatus && (
            <Badge variant={taskStatus === "succeeded" ? "success" : taskStatus === "failed" ? "danger" : "info"}>
              {t(reqStatusKey(taskStatus))}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="rounded-md border border-border bg-surface-2 min-h-40 flex items-center justify-center overflow-hidden">
            {assetUrl ? (
              <video src={assetUrl} controls className="max-w-full max-h-96" />
            ) : (
              <span className="text-muted-foreground text-sm">{busy ? t("playground.generating") : t("playground.videoEmpty")}</span>
            )}
          </div>
          <div>
            <Label>{t("playground.rawRequest")}</Label>
            <CodeBlock lang="json" code={JSON.stringify(rawReq, null, 2)} maxHeight="8rem" />
          </div>
          <div>
            <Label>{t("playground.submissionResponse")}</Label>
            <CodeBlock lang="json" code={JSON.stringify(submitResp, null, 2)} maxHeight="10rem" />
          </div>
          {pollResp && (
            <div>
              <Label>{t("playground.lastPoll")}</Label>
              <CodeBlock lang="json" code={JSON.stringify(pollResp, null, 2)} maxHeight="10rem" />
            </div>
          )}
          <div>
            <Label>{t("playground.curlLabel")}</Label>
            <CodeBlock lang="bash" code={curl} maxHeight="8rem" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
