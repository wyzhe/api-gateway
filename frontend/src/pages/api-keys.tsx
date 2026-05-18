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
import type { ApiKey } from "@/lib/types";
import { fmtCompactMoney, fmtDate } from "@/lib/utils";

type CreatedKey = ApiKey & { key: string };

function parseLimit(v: string): number | null {
  const trimmed = v.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : NaN as unknown as null;
}

export function ApiKeysPage() {
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
    if (Number.isNaN(limit as number)) {
      toast.error("Monthly limit must be a non-negative number");
      return;
    }
    setBusy(true);
    try {
      const k = await api<CreatedKey>("/api/keys", {
        method: "POST",
        body: { name: newName.trim(), monthly_limit: limit },
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
    if (Number.isNaN(limit as number)) {
      toast.error("Monthly limit must be a non-negative number");
      return;
    }
    await api(`/api/keys/${editing.id}`, {
      method: "PATCH",
      body: { name: editName.trim(), monthly_limit: limit },
    });
    toast.success("Updated");
    setEditing(null);
    void refresh();
  };

  const onToggle = async (k: ApiKey) => {
    const action = k.status === "active" ? "disable" : "enable";
    await api(`/api/keys/${k.id}/${action}`, { method: "POST" });
    toast.success(`Key ${action}d`);
    void refresh();
  };

  const onDelete = async (k: ApiKey) => {
    if (!confirm(`Delete key "${k.name}"? This cannot be undone.`)) return;
    await api(`/api/keys/${k.id}`, { method: "DELETE" });
    toast.success("Deleted");
    void refresh();
  };

  return (
    <div>
      <PageHeader
        title="API Keys"
        subtitle="Used for /v1/* requests (chat, image, video). Full key is shown only once."
        actions={
          <Button onClick={() => setOpenCreate(true)}>
            <Plus className="h-4 w-4" /> Create key
          </Button>
        }
      />

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Prefix</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>This month / limit</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                  No keys yet. Create one to start using the gateway.
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
                    <Badge variant={k.status === "active" ? "success" : "warn"}>{k.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="mono">
                      {fmtCompactMoney(k.mtd_cost)} {limit !== null && <span className="text-muted-foreground">/ {fmtCompactMoney(limit)}</span>}
                      {limit === null && <span className="text-muted-foreground"> (no cap)</span>}
                    </div>
                    {limit !== null && (
                      <div className="h-1 mt-1 rounded bg-surface-3 overflow-hidden w-32">
                        <div
                          className="h-full"
                          style={{
                            width: `${pct}%`,
                            background:
                              pct >= 100 ? "var(--danger)" : pct >= 80 ? "var(--warn)" : "var(--accent)",
                          }}
                        />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {k.last_used_at ? fmtDate(k.last_used_at) : "Never"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(k)} title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => onToggle(k)}>
                        {k.status === "active" ? "Disable" : "Enable"}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => onDelete(k)} title="Delete">
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
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              The full key value is shown once on the next screen.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <FormField label="Name">
              <Input
                autoFocus
                placeholder="e.g. local-dev"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onCreate()}
              />
            </FormField>
            <FormField label="Monthly spend limit (USD, optional)">
              <Input
                placeholder="leave blank for no cap"
                value={newLimit}
                onChange={(e) => setNewLimit(e.target.value)}
              />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setOpenCreate(false)}>Cancel</Button>
            <Button onClick={onCreate} disabled={busy || !newName.trim()}>
              {busy ? "Creating…" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit modal */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit API Key</DialogTitle>
            <DialogDescription>
              Rename or change the monthly spend cap. The key value cannot be revealed again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <FormField label="Name">
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </FormField>
            <FormField label="Monthly spend limit (USD, blank = no cap)">
              <Input value={editLimit} onChange={(e) => setEditLimit(e.target.value)} placeholder="e.g. 10" />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={onSaveEdit} disabled={!editName.trim()}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reveal modal — only time the full key is visible */}
      <Dialog open={!!createdKey} onOpenChange={(o) => !o && setCreatedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API key created</DialogTitle>
            <DialogDescription>
              <span className="text-warn">Copy it now.</span> This is the only time the full value is shown.
            </DialogDescription>
          </DialogHeader>
          {createdKey && (
            <div className="flex flex-col gap-3">
              <div className="text-xs text-muted-foreground">
                Name: <span className="text-foreground mono">{createdKey.name}</span>
                {createdKey.monthly_limit && (
                  <> · Monthly limit: <span className="text-foreground mono">{fmtCompactMoney(createdKey.monthly_limit)}</span></>
                )}
              </div>
              <CodeBlock code={createdKey.key} lang="apikey" />
            </div>
          )}
          <div className="flex justify-end mt-2">
            <Button onClick={() => setCreatedKey(null)}>I have saved it</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
