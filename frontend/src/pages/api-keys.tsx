import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CodeBlock } from "@/components/ui/code-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shell";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { ApiKey } from "@/lib/types";
import { fmtCompactMoney, fmtDate, limitBarColor, parseLimit } from "@/lib/utils";

type CreatedKey = ApiKey & { key: string };

export function ApiKeysPage() {
  const t = useT();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [openCreate, setOpenCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLimit, setNewLimit] = useState("");
  const [busy, setBusy] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);
  const [editing, setEditing] = useState<ApiKey | null>(null);
  const [editName, setEditName] = useState("");
  const [editLimit, setEditLimit] = useState("");

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
    setBusy(true);
    try {
      const k = await api<CreatedKey>("/api/keys", {
        method: "POST",
        body: { name: newName.trim(), monthly_limit: limit.value },
      });
      setOpenCreate(false);
      setNewName("");
      setNewLimit("");
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
  };

  const onSaveEdit = async () => {
    if (!editing) return;
    if (!editName.trim()) return;
    const limit = parseLimit(editLimit);
    if (!limit.ok) {
      toast.error(t("apiKeys.toastInvalidLimit"));
      return;
    }
    await api(`/api/keys/${editing.id}`, {
      method: "PATCH",
      body: { name: editName.trim(), monthly_limit: limit.value },
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
        subtitle={t("apiKeys.subtitle")}
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
              <TableHead>{t("apiKeys.colLastUsed")}</TableHead>
              <TableHead className="text-right">{t("apiKeys.colActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                  {t("apiKeys.empty")}
                </TableCell>
              </TableRow>
            )}
            {keys.map((k) => {
              const usage = Number(k.mtd_cost || 0);
              const limit = k.monthly_limit ? Number(k.monthly_limit) : null;
              const pct = limit && limit > 0 ? Math.min(100, (usage / limit) * 100) : 0;
              return (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell className="mono text-xs">{k.key_prefix}…</TableCell>
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
                  <TableCell className="text-muted-foreground text-xs">
                    {k.last_used_at ? fmtDate(k.last_used_at) : t("apiKeys.never")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(k)} title={t("apiKeys.editTitle")}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => onToggle(k)}>
                        {k.status === "active" ? t("apiKeys.disable") : t("apiKeys.enable")}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => onDelete(k)} title={t("apiKeys.deleteTitle")}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
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
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
            <Button onClick={onSaveEdit} disabled={!editName.trim()}>{t("apiKeys.editDialog.save")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reveal modal — only time the full key is visible */}
      <Dialog open={!!createdKey} onOpenChange={(o) => !o && setCreatedKey(null)}>
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
          <div className="flex justify-end mt-2">
            <Button onClick={() => setCreatedKey(null)}>{t("apiKeys.revealDialog.acknowledge")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
