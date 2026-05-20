import { Activity, Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
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
import { useT } from "@/lib/i18n";
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

type ValidationError =
  | "capabilities_json"
  | "public_name_required"
  | "provider_required"
  | "max_input_tokens_invalid";
type Validated<T> = { ok: true; value: T } | { ok: false; error: ValidationError };

function formToPayload(f: ModelFormState): Validated<Record<string, unknown>> {
  let caps: unknown = null;
  try {
    caps = f.capabilitiesJson.trim() ? JSON.parse(f.capabilitiesJson) : null;
  } catch {
    return { ok: false, error: "capabilities_json" };
  }
  if (!f.public_name.trim()) return { ok: false, error: "public_name_required" };
  if (!f.provider_id) return { ok: false, error: "provider_required" };
  let maxInputTokens: number | null = null;
  if (f.max_input_tokens.trim()) {
    const n = Number(f.max_input_tokens.trim());
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
      return { ok: false, error: "max_input_tokens_invalid" };
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
  const t = useT();
  const [rows, setRows] = useState<Model[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [health, setHealth] = useState<Record<number, HealthCheckResult | "pending">>({});

  const validationMessage = (e: ValidationError): string => {
    switch (e) {
      case "capabilities_json":
        return t("admin.models.errCapabilitiesJson");
      case "public_name_required":
        return t("admin.models.errPublicNameRequired");
      case "provider_required":
        return t("admin.models.errProviderRequired");
      case "max_input_tokens_invalid":
        return t("admin.models.errMaxInputTokensInvalid");
    }
  };

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
    if (!r.ok) return toast.error(validationMessage(r.error));
    if (dialog.mode === "create") {
      await api("/api/admin/models", { method: "POST", body: r.value });
      toast.success(t("admin.models.toastCreated"));
    } else {
      await api(`/api/admin/models/${dialog.model.id}`, { method: "PATCH", body: r.value });
      toast.success(t("admin.models.toastUpdated"));
    }
    closeDialog();
    void refresh();
  };

  const toggle = async (m: Model) => {
    const a = m.status === "active" ? "disable" : "enable";
    await api(`/api/admin/models/${m.id}/${a}`, { method: "POST" });
    toast.success(
      a === "disable"
        ? t("admin.models.toastDisabled")
        : t("admin.models.toastEnabled"),
    );
    void refresh();
  };

  const ping = async (m: Model) => {
    setHealth((h) => ({ ...h, [m.id]: "pending" }));
    try {
      const result = await api<HealthCheckResult>(`/api/admin/models/${m.id}/healthcheck`, { method: "POST" });
      setHealth((h) => ({ ...h, [m.id]: result }));
      if (result.ok)
        toast.success(
          t("admin.models.toastPingOk", { name: m.public_name, ms: result.latency_ms }),
        );
      else
        toast.error(
          t("admin.models.toastPingFail", {
            name: m.public_name,
            error: result.error || t("admin.models.toastPingFailFallback"),
          }),
        );
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
        title={t("admin.models.title")}
        actions={
          <Button onClick={startCreate}>
            <Plus className="h-4 w-4" /> {t("admin.models.newModelBtn")}
          </Button>
        }
      />

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.models.colPublicName")}</TableHead>
              <TableHead>{t("admin.models.colUpstream")}</TableHead>
              <TableHead>{t("admin.models.colType")}</TableHead>
              <TableHead>{t("admin.models.colProviderTag")}</TableHead>
              <TableHead>{t("admin.models.colPricing")}</TableHead>
              <TableHead>{t("admin.models.colStatus")}</TableHead>
              <TableHead>{t("admin.models.colHealth")}</TableHead>
              <TableHead className="text-right">{t("admin.models.colActions")}</TableHead>
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
                    <Badge variant={m.status === "active" ? "success" : "warn"}>
                      {m.status === "active"
                        ? t("common.status.active")
                        : t("common.status.disabled")}
                    </Badge>
                    {!m.visible && (
                      <Badge variant="outline" className="ml-1">{t("admin.models.badgeHidden")}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {h === "pending" && (
                      <span className="text-muted-foreground">{t("admin.models.healthPinging")}</span>
                    )}
                    {h && h !== "pending" && (
                      <Tooltip content={h.error || h.sample || ""}>
                        <span>
                          <Badge variant={h.ok ? "success" : "danger"}>
                            {h.ok ? t("admin.models.healthOk") : t("admin.models.healthFail")}
                          </Badge>
                          <span className="mono ml-1.5 text-muted-foreground">{h.latency_ms}ms</span>
                        </span>
                      </Tooltip>
                    )}
                    {!h && <span className="text-muted-foreground">{t("admin.models.healthPlaceholder")}</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Tooltip content={t("admin.models.actionEdit")}>
                        <Button variant="ghost" size="icon" onClick={() => startEdit(m)} aria-label={t("admin.models.actionEdit")}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </Tooltip>
                      <Button variant="outline" size="sm" onClick={() => ping(m)} disabled={h === "pending"}>
                        <Activity className="h-3.5 w-3.5" /> {t("admin.models.actionPing")}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => toggle(m)}>
                        {m.status === "active"
                          ? t("admin.models.actionDisable")
                          : t("admin.models.actionEnable")}
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
              {dialog?.mode === "edit"
                ? t("admin.models.dialog.titleEdit", { name: dialog.model.public_name })
                : t("admin.models.dialog.titleCreate")}
            </DialogTitle>
          </DialogHeader>
          <ModelFormBody form={form} setForm={setForm} providers={providers} />
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={closeDialog}>{t("admin.models.dialog.cancel")}</Button>
            <Button onClick={submitDialog}>
              {dialog?.mode === "edit"
                ? t("admin.models.dialog.save")
                : t("admin.models.dialog.create")}
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
  const t = useT();
  const set = <K extends keyof ModelFormState>(k: K, v: ModelFormState[K]) =>
    setForm({ ...form, [k]: v });

  const pricingFields = () => {
    switch (form.pricing_mode) {
      case "per_token":
        return (
          <>
            <FormField label={t("admin.models.dialog.inputPriceLabel")}>
              <Input value={form.input_price} onChange={(e) => set("input_price", e.target.value)} />
            </FormField>
            <FormField label={t("admin.models.dialog.outputPriceLabel")}>
              <Input value={form.output_price} onChange={(e) => set("output_price", e.target.value)} />
            </FormField>
            <FormField label={t("admin.models.dialog.cacheWritePriceLabel")}>
              <Input
                value={form.cache_write_price}
                onChange={(e) => set("cache_write_price", e.target.value)}
                placeholder={t("admin.models.dialog.cacheWritePricePlaceholder")}
              />
            </FormField>
            <FormField label={t("admin.models.dialog.cacheReadPriceLabel")}>
              <Input
                value={form.cache_read_price}
                onChange={(e) => set("cache_read_price", e.target.value)}
                placeholder={t("admin.models.dialog.cacheReadPricePlaceholder")}
              />
            </FormField>
          </>
        );
      case "per_image":
        return (
          <FormField label={t("admin.models.dialog.imagePriceLabel")}>
            <Input value={form.image_price} onChange={(e) => set("image_price", e.target.value)} />
          </FormField>
        );
      case "per_second":
        return (
          <FormField label={t("admin.models.dialog.videoSecondPriceLabel")}>
            <Input value={form.video_second_price} onChange={(e) => set("video_second_price", e.target.value)} />
          </FormField>
        );
      case "per_generation":
        return (
          <FormField label={t("admin.models.dialog.generationPriceLabel")}>
            <Input value={form.generation_price} onChange={(e) => set("generation_price", e.target.value)} />
          </FormField>
        );
    }
  };

  return (
    <div className="flex flex-col gap-3 max-h-[70vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-3">
        <FormField label={t("admin.models.dialog.publicNameLabel")}>
          <Input
            value={form.public_name}
            onChange={(e) => set("public_name", e.target.value)}
            placeholder={t("admin.models.dialog.publicNamePlaceholder")}
          />
          <span className="text-xs text-muted-foreground">
            {t("admin.models.dialog.publicNameHint")}
          </span>
        </FormField>
        <FormField label={t("admin.models.dialog.upstreamLabel")}>
          <Input
            value={form.upstream_model}
            onChange={(e) => set("upstream_model", e.target.value)}
            placeholder={t("admin.models.dialog.upstreamPlaceholder")}
          />
          <span className="text-xs text-muted-foreground">
            {t("admin.models.dialog.upstreamHint")}
          </span>
        </FormField>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <FormField label={t("admin.models.dialog.typeLabel")}>
          <Select value={form.type} onValueChange={(v) => set("type", v as ModelFormState["type"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="text">{t("admin.models.dialog.typeText")}</SelectItem>
              <SelectItem value="image">{t("admin.models.dialog.typeImage")}</SelectItem>
              <SelectItem value="video">{t("admin.models.dialog.typeVideo")}</SelectItem>
              <SelectItem value="multimodal">{t("admin.models.dialog.typeMultimodal")}</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label={t("admin.models.dialog.providerLabel")}>
          <Select
            value={form.provider_id ? String(form.provider_id) : ""}
            onValueChange={(v) => set("provider_id", Number(v))}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("admin.models.dialog.providerPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {providers.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.display_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label={t("admin.models.dialog.providerTagLabel")}>
          <Select
            value={form.display_provider}
            onValueChange={(v) => set("display_provider", v as DisplayProvider)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DISPLAY_PROVIDERS.map((tag) => (
                <SelectItem key={tag} value={tag}>{tag}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <FormField label={t("admin.models.dialog.displayNameLabel")}>
        <Input value={form.display_name} onChange={(e) => set("display_name", e.target.value)} />
      </FormField>
      <FormField label={t("admin.models.dialog.descriptionLabel")}>
        <Input value={form.description} onChange={(e) => set("description", e.target.value)} />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label={t("admin.models.dialog.pricingModeLabel")}>
          <Select value={form.pricing_mode} onValueChange={(v) => set("pricing_mode", v as ModelFormState["pricing_mode"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="per_token">{t("admin.models.dialog.pricingModePerToken")}</SelectItem>
              <SelectItem value="per_image">{t("admin.models.dialog.pricingModePerImage")}</SelectItem>
              <SelectItem value="per_second">{t("admin.models.dialog.pricingModePerSecond")}</SelectItem>
              <SelectItem value="per_generation">{t("admin.models.dialog.pricingModePerGeneration")}</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <div className="grid grid-cols-1 gap-3">{pricingFields()}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label={t("admin.models.dialog.maxInputTokensLabel")}>
          <Input
            value={form.max_input_tokens}
            onChange={(e) => set("max_input_tokens", e.target.value)}
            placeholder={t("admin.models.dialog.maxInputTokensPlaceholder")}
          />
        </FormField>
        <FormField label={t("admin.models.dialog.capabilitiesLabel")}>
          <Input
            className="mono text-xs"
            value={form.capabilitiesJson}
            onChange={(e) => set("capabilitiesJson", e.target.value)}
            placeholder={t("admin.models.dialog.capabilitiesPlaceholder")}
          />
          <span className="text-xs text-muted-foreground">
            {t("admin.models.dialog.capabilitiesHint")}
          </span>
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label={t("admin.models.dialog.statusLabel")}>
          <Select value={form.status} onValueChange={(v) => set("status", v as ModelFormState["status"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">{t("common.status.active")}</SelectItem>
              <SelectItem value="disabled">{t("common.status.disabled")}</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label={t("admin.models.dialog.visibleLabel")}>
          <Select value={form.visible ? "yes" : "no"} onValueChange={(v) => set("visible", v === "yes")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">{t("admin.models.dialog.visibleYes")}</SelectItem>
              <SelectItem value="no">{t("admin.models.dialog.visibleNo")}</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </div>
    </div>
  );
}
