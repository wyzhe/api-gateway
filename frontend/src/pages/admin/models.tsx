import { Activity, Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TypeBadge } from "@/components/type-badge";
import { ProviderTag } from "@/components/provider-tag";
import { PageHeader } from "@/components/shell";
import { api } from "@/lib/api";
import type { HealthCheckResult, Model, Provider } from "@/lib/types";
import { priceLabel } from "@/lib/utils";

const DISPLAY_PROVIDERS = ["apimart", "openai", "anthropic", "gemini", "xai", "veo"] as const;
type DisplayProvider = (typeof DISPLAY_PROVIDERS)[number];

type ModelFormState = {
  public_name: string;
  upstream_model: string;
  provider_id: number | "";
  type: "text" | "image" | "video" | "multimodal";
  display_name: string;
  description: string;
  display_provider: DisplayProvider;
  pricing_mode: "per_token" | "per_image" | "per_second" | "per_generation";
  input_price: string;
  output_price: string;
  cache_write_price: string;
  cache_read_price: string;
  image_price: string;
  video_second_price: string;
  generation_price: string;
  max_input_tokens: string;
  capabilitiesJson: string;
  visible: boolean;
  status: "active" | "disabled";
};

function emptyForm(providerId: number | ""): ModelFormState {
  return {
    public_name: "",
    upstream_model: "",
    provider_id: providerId,
    type: "text",
    display_name: "",
    description: "",
    display_provider: "apimart",
    pricing_mode: "per_token",
    input_price: "",
    output_price: "",
    cache_write_price: "",
    cache_read_price: "",
    image_price: "",
    video_second_price: "",
    generation_price: "",
    max_input_tokens: "",
    capabilitiesJson: "{}",
    visible: true,
    status: "active",
  };
}

function modelToForm(m: Model): ModelFormState {
  const dp = (m.display_provider ?? "apimart") as DisplayProvider;
  return {
    public_name: m.public_name,
    upstream_model: m.upstream_model,
    provider_id: m.provider_id,
    type: m.type,
    display_name: m.display_name ?? "",
    description: m.description ?? "",
    display_provider: DISPLAY_PROVIDERS.includes(dp) ? dp : "apimart",
    pricing_mode: m.pricing_mode,
    input_price: m.input_price ?? "",
    output_price: m.output_price ?? "",
    cache_write_price: m.cache_write_price ?? "",
    cache_read_price: m.cache_read_price ?? "",
    image_price: m.image_price ?? "",
    video_second_price: m.video_second_price ?? "",
    generation_price: m.generation_price ?? "",
    max_input_tokens: m.max_input_tokens?.toString() ?? "",
    capabilitiesJson: m.capabilities ? JSON.stringify(m.capabilities) : "{}",
    visible: m.visible,
    status: m.status,
  };
}

type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

function formToPayload(f: ModelFormState): Validated<Record<string, unknown>> {
  let caps: unknown = null;
  try {
    caps = f.capabilitiesJson.trim() ? JSON.parse(f.capabilitiesJson) : null;
  } catch {
    return { ok: false, error: "capabilities must be valid JSON" };
  }
  if (!f.public_name.trim()) return { ok: false, error: "public_name required" };
  if (!f.provider_id) return { ok: false, error: "provider required" };
  let maxInputTokens: number | null = null;
  if (f.max_input_tokens.trim()) {
    const n = Number(f.max_input_tokens.trim());
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
      return { ok: false, error: "max_input_tokens must be a positive integer" };
    }
    maxInputTokens = n;
  }
  return {
    ok: true,
    value: {
      public_name: f.public_name.trim(),
      upstream_model: f.upstream_model.trim() || f.public_name.trim(),
      provider_id: f.provider_id,
      type: f.type,
      display_name: f.display_name.trim() || null,
      description: f.description.trim() || null,
      display_provider: f.display_provider,
      pricing_mode: f.pricing_mode,
      input_price: f.input_price.trim() || null,
      output_price: f.output_price.trim() || null,
      cache_write_price: f.cache_write_price.trim() || null,
      cache_read_price: f.cache_read_price.trim() || null,
      image_price: f.image_price.trim() || null,
      video_second_price: f.video_second_price.trim() || null,
      generation_price: f.generation_price.trim() || null,
      max_input_tokens: maxInputTokens,
      capabilities: caps,
      visible: f.visible,
      status: f.status,
    },
  };
}

export function AdminModelsPage() {
  const [rows, setRows] = useState<Model[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [health, setHealth] = useState<Record<number, HealthCheckResult | "pending">>({});

  // One dialog at a time; form is initialized whenever we open. Prevents stale
  // values leaking between Create and Edit reopen cycles.
  type Dialog = { mode: "create" } | { mode: "edit"; model: Model } | null;
  const [dialog, setDialog] = useState<Dialog>(null);
  const [form, setForm] = useState<ModelFormState>(emptyForm(""));

  const refresh = async () => {
    const [m, p] = await Promise.all([
      api<Model[]>("/api/admin/models"),
      api<Provider[]>("/api/admin/providers"),
    ]);
    setRows(m);
    setProviders(p);
  };

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  const startCreate = () => {
    setForm(emptyForm(providers[0]?.id ?? ""));
    setDialog({ mode: "create" });
  };
  const startEdit = (m: Model) => {
    setForm(modelToForm(m));
    setDialog({ mode: "edit", model: m });
  };
  const closeDialog = () => setDialog(null);

  const submitDialog = async () => {
    if (!dialog) return;
    const r = formToPayload(form);
    if (!r.ok) return toast.error(r.error);
    if (dialog.mode === "create") {
      await api("/api/admin/models", { method: "POST", body: r.value });
      toast.success("Model created");
    } else {
      await api(`/api/admin/models/${dialog.model.id}`, { method: "PATCH", body: r.value });
      toast.success("Model updated");
    }
    closeDialog();
    void refresh();
  };

  const toggle = async (m: Model) => {
    const a = m.status === "active" ? "disable" : "enable";
    await api(`/api/admin/models/${m.id}/${a}`, { method: "POST" });
    toast.success(`Model ${a}d`);
    void refresh();
  };

  const ping = async (m: Model) => {
    setHealth((h) => ({ ...h, [m.id]: "pending" }));
    try {
      const result = await api<HealthCheckResult>(`/api/admin/models/${m.id}/healthcheck`, { method: "POST" });
      setHealth((h) => ({ ...h, [m.id]: result }));
      if (result.ok) toast.success(`${m.public_name}: ${result.latency_ms}ms ✓`);
      else toast.error(`${m.public_name}: ${result.error || "failed"}`);
    } catch (e: any) {
      setHealth((h) => ({
        ...h,
        [m.id]: {
          model_id: m.id,
          public_name: m.public_name,
          upstream_model: m.upstream_model,
          type: m.type,
          ok: false,
          status_code: null,
          latency_ms: 0,
          error: String(e?.message || e),
          sample: null,
        },
      }));
    }
  };

  return (
    <div>
      <PageHeader
        title="Models"
        subtitle={`${rows.length} models. Ping calls the upstream — uses a tiny bit of credit.`}
        actions={
          <Button onClick={startCreate}>
            <Plus className="h-4 w-4" /> New model
          </Button>
        }
      />

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Public name</TableHead>
              <TableHead>Upstream</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Provider tag</TableHead>
              <TableHead>Pricing</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Health</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => {
              const h = health[m.id];
              return (
                <TableRow key={m.id}>
                  <TableCell className="mono">{m.public_name}</TableCell>
                  <TableCell className="mono text-muted-foreground text-xs">{m.upstream_model}</TableCell>
                  <TableCell><TypeBadge type={m.type} /></TableCell>
                  <TableCell><ProviderTag provider={m.display_provider} /></TableCell>
                  <TableCell className="mono text-xs">{priceLabel(m)}</TableCell>
                  <TableCell>
                    <Badge variant={m.status === "active" ? "success" : "warn"}>{m.status}</Badge>
                    {!m.visible && <Badge variant="outline" className="ml-1">hidden</Badge>}
                  </TableCell>
                  <TableCell className="text-xs">
                    {h === "pending" && <span className="text-muted-foreground">pinging…</span>}
                    {h && h !== "pending" && (
                      <span title={h.error || h.sample || ""}>
                        <Badge variant={h.ok ? "success" : "danger"}>{h.ok ? "ok" : "fail"}</Badge>
                        <span className="mono ml-1.5 text-muted-foreground">{h.latency_ms}ms</span>
                      </span>
                    )}
                    {!h && <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => startEdit(m)} title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => ping(m)} disabled={h === "pending"}>
                        <Activity className="h-3.5 w-3.5" /> Ping
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => toggle(m)}>
                        {m.status === "active" ? "Disable" : "Enable"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "edit" ? `Edit ${dialog.model.public_name}` : "New model"}
            </DialogTitle>
          </DialogHeader>
          <ModelFormBody form={form} setForm={setForm} providers={providers} />
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={submitDialog}>
              {dialog?.mode === "edit" ? "Save" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ModelFormBody({
  form, setForm, providers,
}: {
  form: ModelFormState;
  setForm: (f: ModelFormState) => void;
  providers: Provider[];
}) {
  const set = <K extends keyof ModelFormState>(k: K, v: ModelFormState[K]) =>
    setForm({ ...form, [k]: v });

  const pricingFields = () => {
    switch (form.pricing_mode) {
      case "per_token":
        return (
          <>
            <FormField label="Input price (USD / 1M tokens)">
              <Input value={form.input_price} onChange={(e) => set("input_price", e.target.value)} />
            </FormField>
            <FormField label="Output price (USD / 1M tokens)">
              <Input value={form.output_price} onChange={(e) => set("output_price", e.target.value)} />
            </FormField>
            <FormField label="Cache write price (USD / 1M, blank = use input price)">
              <Input
                value={form.cache_write_price}
                onChange={(e) => set("cache_write_price", e.target.value)}
                placeholder="e.g. 3.75 (Claude Sonnet)"
              />
            </FormField>
            <FormField label="Cache read price (USD / 1M, blank = use input price)">
              <Input
                value={form.cache_read_price}
                onChange={(e) => set("cache_read_price", e.target.value)}
                placeholder="e.g. 0.30 (Claude Sonnet)"
              />
            </FormField>
          </>
        );
      case "per_image":
        return (
          <FormField label="Image price (USD / image)">
            <Input value={form.image_price} onChange={(e) => set("image_price", e.target.value)} />
          </FormField>
        );
      case "per_second":
        return (
          <FormField label="Video price (USD / second)">
            <Input value={form.video_second_price} onChange={(e) => set("video_second_price", e.target.value)} />
          </FormField>
        );
      case "per_generation":
        return (
          <FormField label="Per-generation price (USD)">
            <Input value={form.generation_price} onChange={(e) => set("generation_price", e.target.value)} />
          </FormField>
        );
    }
  };

  return (
    <div className="flex flex-col gap-3 max-h-[70vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Public name (what users send)">
          <Input
            value={form.public_name}
            onChange={(e) => set("public_name", e.target.value)}
            placeholder="e.g. gpt-4o"
          />
        </FormField>
        <FormField label="Upstream model (what we forward)">
          <Input
            value={form.upstream_model}
            onChange={(e) => set("upstream_model", e.target.value)}
            placeholder="defaults to public name"
          />
        </FormField>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <FormField label="Type">
          <Select value={form.type} onValueChange={(v) => set("type", v as ModelFormState["type"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="text">text</SelectItem>
              <SelectItem value="image">image</SelectItem>
              <SelectItem value="video">video</SelectItem>
              <SelectItem value="multimodal">multimodal</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Provider">
          <Select
            value={form.provider_id ? String(form.provider_id) : ""}
            onValueChange={(v) => set("provider_id", Number(v))}
          >
            <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
            <SelectContent>
              {providers.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.display_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Provider tag (UI color)">
          <Select
            value={form.display_provider}
            onValueChange={(v) => set("display_provider", v as DisplayProvider)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DISPLAY_PROVIDERS.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <FormField label="Display name (optional)">
        <Input value={form.display_name} onChange={(e) => set("display_name", e.target.value)} />
      </FormField>
      <FormField label="Description (optional)">
        <Input value={form.description} onChange={(e) => set("description", e.target.value)} />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Pricing mode">
          <Select value={form.pricing_mode} onValueChange={(v) => set("pricing_mode", v as ModelFormState["pricing_mode"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="per_token">per_token</SelectItem>
              <SelectItem value="per_image">per_image</SelectItem>
              <SelectItem value="per_second">per_second</SelectItem>
              <SelectItem value="per_generation">per_generation</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <div className="grid grid-cols-1 gap-3">{pricingFields()}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Max input tokens (gateway rejects at 95% of this)">
          <Input
            value={form.max_input_tokens}
            onChange={(e) => set("max_input_tokens", e.target.value)}
            placeholder="e.g. 200000 (must match capabilities.ctx)"
          />
        </FormField>
        <FormField label="Capabilities (JSON)">
          <Input
            className="mono text-xs"
            value={form.capabilitiesJson}
            onChange={(e) => set("capabilitiesJson", e.target.value)}
            placeholder='{"stream": true, "ctx": 200000}'
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Status">
          <Select value={form.status} onValueChange={(v) => set("status", v as ModelFormState["status"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">active</SelectItem>
              <SelectItem value="disabled">disabled</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Visible to users">
          <Select value={form.visible ? "yes" : "no"} onValueChange={(v) => set("visible", v === "yes")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">yes</SelectItem>
              <SelectItem value="no">no</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </div>
    </div>
  );
}
