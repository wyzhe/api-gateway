import { Plus, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shell";
import { api } from "@/lib/api";
import type { ApiKey } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

type CreatedKey = ApiKey & { key: string };

export function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [openCreate, setOpenCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);

  const refresh = async () => {
    const rows = await api<ApiKey[]>("/api/keys");
    setKeys(rows);
  };

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  const onCreate = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const k = await api<CreatedKey>("/api/keys", {
        method: "POST",
        body: { name: newName.trim() },
      });
      setOpenCreate(false);
      setNewName("");
      setCreatedKey(k);
      void refresh();
    } finally {
      setBusy(false);
    }
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
              <TableHead>Last used</TableHead>
              <TableHead>Created</TableHead>
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
            {keys.map((k) => (
              <TableRow key={k.id}>
                <TableCell className="font-medium">{k.name}</TableCell>
                <TableCell className="mono text-xs">{k.key_prefix}…</TableCell>
                <TableCell>
                  <Badge variant={k.status === "active" ? "success" : "warn"}>{k.status}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {k.last_used_at ? fmtDate(k.last_used_at) : "Never"}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">{fmtDate(k.created_at)}</TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => onToggle(k)}>
                      {k.status === "active" ? "Disable" : "Enable"}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(k)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Create modal */}
      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Give it a memorable name. The full key value will be shown once on the next screen.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="kname">Name</Label>
            <Input
              id="kname"
              autoFocus
              placeholder="e.g. local-dev"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onCreate()}
            />
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setOpenCreate(false)}>Cancel</Button>
            <Button onClick={onCreate} disabled={busy || !newName.trim()}>
              {busy ? "Creating…" : "Create"}
            </Button>
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
              <div className="text-xs text-muted-foreground">Name: <span className="text-foreground mono">{createdKey.name}</span></div>
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
