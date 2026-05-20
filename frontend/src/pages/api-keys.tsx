import { Check, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CodeBlock } from "@/components/ui/code-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shell";
import { api, ApiError } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { ApiKey } from "@/lib/types";
import { copyToClipboard, fmtCompactMoney, fmtDate, limitBarColor, parseLimit } from "@/lib/utils";

type CreatedKey = ApiKey & { key: string };

type IntFieldResult = { ok: true; value: number | null } | { ok: false };

function parsePositiveInt(s: string): IntFieldResult {
  const t = s.trim();
  if (t === "") return { ok: true, value: null };
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return { ok: false };
  return { ok: true, value: n };
}

export function ApiKeysPage() {
  const t = useT();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [openCreate, setOpenCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLimit, setNewLimit] = useState("");
  const [newRpm, setNewRpm] = useState("");
  const [newTpm, setNewTpm] = useState("");
  const [newConc, setNewConc] = useState("");
  const [busy, setBusy] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);
  const [editing, setEditing] = useState<ApiKey | null>(null);
  const [editName, setEditName] = useState("");
  const [editLimit, setEditLimit] = useState("");
  const [editRpm, setEditRpm] = useState("");
  const [editTpm, setEditTpm] = useState("");
  const [editConc, setEditConc] = useState("");
  const [revealCopied, setRevealCopied] = useState(false);

  const copyText = async (text: string) => {
    const ok = await copyToClipboard(text);
    if (ok) toast.success(t("common.toastCopied"));
    else toast.error(t("common.toastCopyFailed"));
    return ok;
  };

  const copyFullKey = async (k: ApiKey) => {
    try {
      const r = await api<{ key: string }>(`/api/keys/${k.id}/reveal`, { method: "POST" });
      await copyText(r.key);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast.error(t("apiKeys.toastRevealUnavailable"));
      } else {
        toast.error(t("common.toastCopyFailed"));
      }
    }
  };

  const refresh = async () => {
    const rows = await api<ApiKey[]>("/api/keys");
    setKeys(rows);
  };

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  const onCreate = async () => {
    if (!newName.trim()) return;
    const limit = parseLimit(newLimit);
    if (!limit.ok) {
      toast.error(t("apiKeys.toastInvalidLimit"));
      return;
    }
    const rpm = parsePositiveInt(newRpm);
    const tpm = parsePositiveInt(newTpm);
    const conc = parsePositiveInt(newConc);
    if (!rpm.ok || !tpm.ok || !conc.ok) {
      toast.error("Limits must be positive integers (blank = use default)");
      return;
    }
    setBusy(true);
    try {
      const k = await api<CreatedKey>("/api/keys", {
        method: "POST",
        body: {
          name: newName.trim(),
          monthly_limit: limit.value,
          rate_limit_rpm: rpm.value,
          rate_limit_tpm: tpm.value,
          max_concurrent_requests: conc.value,
        },
      });
      setOpenCreate(false);
      setNewName("");
      setNewLimit("");
      setNewRpm("");
      setNewTpm("");
      setNewConc("");
      setCreatedKey(k);
      void refresh();
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (k: ApiKey) => {
    setEditing(k);
    setEditName(k.name);
    setEditLimit(k.monthly_limit ?? "");
    setEditRpm(k.rate_limit_rpm?.toString() ?? "");
    setEditTpm(k.rate_limit_tpm?.toString() ?? "");
    setEditConc(k.max_concurrent_requests?.toString() ?? "");
  };

  const onSaveEdit = async () => {
    if (!editing) return;
    if (!editName.trim()) return;
    const limit = parseLimit(editLimit);
    if (!limit.ok) {
      toast.error(t("apiKeys.toastInvalidLimit"));
      return;
    }
    const rpm = parsePositiveInt(editRpm);
    const tpm = parsePositiveInt(editTpm);
    const conc = parsePositiveInt(editConc);
    if (!rpm.ok || !tpm.ok || !conc.ok) {
      toast.error("Limits must be positive integers (blank = clear)");
      return;
    }
    await api(`/api/keys/${editing.id}`, {
      method: "PATCH",
      body: {
        name: editName.trim(),
        monthly_limit: limit.value,
        rate_limit_rpm: rpm.value,
        rate_limit_tpm: tpm.value,
        max_concurrent_requests: conc.value,
      },
    });
    toast.success(t("apiKeys.toastUpdated"));
    setEditing(null);
    void refresh();
  };

  const onToggle = async (k: ApiKey) => {
    const action = k.status === "active" ? "disable" : "enable";
    await api(`/api/keys/${k.id}/${action}`, { method: "POST" });
    toast.success(action === "disable" ? t("apiKeys.toastDisabled") : t("apiKeys.toastEnabled"));
    void refresh();
  };

  const onDelete = async (k: ApiKey) => {
    if (!confirm(t("apiKeys.confirmDelete", { name: k.name }))) return;
    await api(`/api/keys/${k.id}`, { method: "DELETE" });
    toast.success(t("apiKeys.toastDeleted"));
    void refresh();
  };

  const statusLabel = (s: ApiKey["status"]): string => {
    if (s === "active") return t("common.status.active");
    if (s === "disabled") return t("common.status.disabled");
    if (s === "revoked") return t("common.status.revoked");
    return s;
  };

  return (
    <div>
      <PageHeader
        title={t("apiKeys.title")}
        actions={
          <Button onClick={() => setOpenCreate(true)}>
            <Plus className="h-4 w-4" /> {t("apiKeys.createBtn")}
          </Button>
        }
      />

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("apiKeys.colName")}</TableHead>
              <TableHead>{t("apiKeys.colPrefix")}</TableHead>
              <TableHead>{t("apiKeys.colStatus")}</TableHead>
              <TableHead>{t("apiKeys.colMonthLimit")}</TableHead>
              <TableHead>{t("apiKeys.colRateLimits")}</TableHead>
              <TableHead>{t("apiKeys.colLastUsed")}</TableHead>
              <TableHead className="text-right">{t("apiKeys.colActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="p-0">
                  <EmptyState title={t("apiKeys.empty")} />
                </TableCell>
              </TableRow>
            )}
            {keys.map((k) => {
              const usage = Number(k.mtd_cost || 0);
              const limit = k.monthly_limit ? Number(k.monthly_limit) : null;
              const pct = limit && limit > 0 ? Math.min(100, (usage / limit) * 100) : 0;
              return (
                <TableRow key={k.id} className="group">
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell className="mono text-xs">
                    <span className="inline-flex items-center gap-1.5">
                      <span>{k.key_prefix}…</span>
                      <Tooltip content={t("apiKeys.revealDialog.copyBtn")}>
                        <button
                          type="button"
                          onClick={() => copyFullKey(k)}
                          className="text-muted-foreground transition-colors hover:text-foreground"
                          aria-label={t("apiKeys.revealDialog.copyBtn")}
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </Tooltip>
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={k.status === "active" ? "success" : "warn"}>{statusLabel(k.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="mono">
                      {fmtCompactMoney(k.mtd_cost)} {limit !== null && <span className="text-muted-foreground">/ {fmtCompactMoney(limit)}</span>}
                      {limit === null && <span className="text-muted-foreground"> {t("apiKeys.noCap")}</span>}
                    </div>
                    {limit !== null && (
                      <div className="h-1 mt-1 rounded bg-surface-3 overflow-hidden w-32">
                        <div
                          className="h-full"
                          style={{ width: `${pct}%`, background: limitBarColor(pct) }}
                        />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <div className="flex flex-col gap-0.5 mono">
                      <Tooltip content={t("apiKeys.rpmTooltip")}>
                        <span>RPM: {k.rate_limit_rpm ?? <span className="text-muted-foreground/60">{t("apiKeys.rateLimitDefault")}</span>}</span>
                      </Tooltip>
                      <Tooltip content={t("apiKeys.tpmTooltip")}>
                        <span>TPM: {k.rate_limit_tpm ?? <span className="text-muted-foreground/60">{t("apiKeys.rateLimitUnlimited")}</span>}</span>
                      </Tooltip>
                      <Tooltip content={t("apiKeys.concurrencyTooltip")}>
                        <span>{t("apiKeys.concurrencyShort")}: {k.max_concurrent_requests ?? <span className="text-muted-foreground/60">{t("apiKeys.rateLimitDefault")}</span>}</span>
                      </Tooltip>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {k.last_used_at ? fmtDate(k.last_used_at) : t("apiKeys.never")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-0.5 opacity-50 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px] min-w-[64px]"
                        onClick={() => onToggle(k)}
                      >
                        {k.status === "active" ? t("apiKeys.disable") : t("apiKeys.enable")}
                      </Button>
                      <Tooltip content={t("apiKeys.editTitle")}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => openEdit(k)}
                          aria-label={t("apiKeys.editTitle")}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </Tooltip>
                      <Tooltip content={t("apiKeys.deleteTitle")}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => onDelete(k)}
                          aria-label={t("apiKeys.deleteTitle")}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Create modal */}
      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("apiKeys.createDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("apiKeys.createDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <FormField label={t("apiKeys.createDialog.nameLabel")}>
              <Input
                autoFocus
                placeholder={t("apiKeys.createDialog.namePlaceholder")}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onCreate()}
              />
            </FormField>
            <FormField label={t("apiKeys.createDialog.limitLabel")}>
              <Input
                placeholder={t("apiKeys.createDialog.limitPlaceholder")}
                value={newLimit}
                onChange={(e) => setNewLimit(e.target.value)}
              />
            </FormField>
            <div className="grid grid-cols-3 gap-2">
              <FormField label={t("apiKeys.createDialog.rpmLabel")}>
                <Input placeholder={t("apiKeys.createDialog.rpmPlaceholder")} value={newRpm} onChange={(e) => setNewRpm(e.target.value)} />
              </FormField>
              <FormField label={t("apiKeys.createDialog.tpmLabel")}>
                <Input placeholder={t("apiKeys.createDialog.tpmPlaceholder")} value={newTpm} onChange={(e) => setNewTpm(e.target.value)} />
              </FormField>
              <FormField label={t("apiKeys.createDialog.concurrencyLabel")}>
                <Input placeholder={t("apiKeys.createDialog.concurrencyPlaceholder")} value={newConc} onChange={(e) => setNewConc(e.target.value)} />
              </FormField>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setOpenCreate(false)}>{t("common.cancel")}</Button>
            <Button onClick={onCreate} disabled={busy || !newName.trim()}>
              {busy ? t("apiKeys.createDialog.submitting") : t("apiKeys.createDialog.submit")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit modal */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("apiKeys.editDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("apiKeys.editDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <FormField label={t("apiKeys.editDialog.nameLabel")}>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </FormField>
            <FormField label={t("apiKeys.editDialog.limitLabel")}>
              <Input value={editLimit} onChange={(e) => setEditLimit(e.target.value)} placeholder={t("apiKeys.editDialog.limitPlaceholder")} />
            </FormField>
            <div className="grid grid-cols-3 gap-2">
              <FormField label={t("apiKeys.editDialog.rpmLabel")}>
                <Input placeholder={t("apiKeys.editDialog.rpmPlaceholder")} value={editRpm} onChange={(e) => setEditRpm(e.target.value)} />
              </FormField>
              <FormField label={t("apiKeys.editDialog.tpmLabel")}>
                <Input placeholder={t("apiKeys.editDialog.tpmPlaceholder")} value={editTpm} onChange={(e) => setEditTpm(e.target.value)} />
              </FormField>
              <FormField label={t("apiKeys.editDialog.concurrencyLabel")}>
                <Input placeholder={t("apiKeys.editDialog.concurrencyPlaceholder")} value={editConc} onChange={(e) => setEditConc(e.target.value)} />
              </FormField>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
            <Button onClick={onSaveEdit} disabled={!editName.trim()}>{t("apiKeys.editDialog.save")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reveal modal — only time the full key is visible */}
      <Dialog
        open={!!createdKey}
        onOpenChange={(o) => {
          if (!o) {
            setCreatedKey(null);
            setRevealCopied(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("apiKeys.revealDialog.title")}</DialogTitle>
            <DialogDescription>
              <span className="text-warn">{t("apiKeys.revealDialog.warning")}</span> {t("apiKeys.revealDialog.warningRest")}
            </DialogDescription>
          </DialogHeader>
          {createdKey && (
            <div className="flex flex-col gap-3">
              <div className="text-xs text-muted-foreground">
                {t("apiKeys.revealDialog.nameLabel")}: <span className="text-foreground mono">{createdKey.name}</span>
                {createdKey.monthly_limit !== null && (
                  <> · {t("apiKeys.revealDialog.monthlyLimitLabel")}: <span className="text-foreground mono">{fmtCompactMoney(createdKey.monthly_limit)}</span></>
                )}
              </div>
              <CodeBlock code={createdKey.key} lang="apikey" />
            </div>
          )}
          <div className="flex justify-end gap-2 mt-2">
            {createdKey && (
              <Button
                variant="outline"
                onClick={async () => {
                  const ok = await copyText(createdKey.key);
                  if (ok) {
                    setRevealCopied(true);
                    setTimeout(() => setRevealCopied(false), 1500);
                  }
                }}
              >
                {revealCopied ? (
                  <><Check className="h-3.5 w-3.5" /> {t("common.copied")}</>
                ) : (
                  <><Copy className="h-3.5 w-3.5" /> {t("apiKeys.revealDialog.copyBtn")}</>
                )}
              </Button>
            )}
            <Button onClick={() => { setCreatedKey(null); setRevealCopied(false); }}>{t("apiKeys.revealDialog.acknowledge")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
