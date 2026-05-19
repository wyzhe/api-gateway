import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { PageHeader } from "@/components/shell";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { Provider } from "@/lib/types";

export function AdminProvidersPage() {
  const t = useT();
  const [rows, setRows] = useState<Provider[]>([]);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [editName, setEditName] = useState("");
  const [editBase, setEditBase] = useState("");
  const [editStatus, setEditStatus] = useState<"active" | "disabled">("active");

  const refresh = () => api<Provider[]>("/api/admin/providers").then(setRows).catch(() => {});

  useEffect(() => {
    refresh();
  }, []);

  const startEdit = (p: Provider) => {
    setEditing(p);
    setEditName(p.display_name);
    setEditBase(p.base_url);
    setEditStatus(p.status);
  };

  const save = async () => {
    if (!editing) return;
    if (editStatus === "disabled" && rows.filter((p) => p.status === "active").length === 1 && editing.status === "active") {
      if (!confirm(t("admin.providers.confirmLastActive"))) return;
    }
    await api(`/api/admin/providers/${editing.id}`, {
      method: "PATCH",
      body: {
        display_name: editName.trim(),
        base_url: editBase.trim(),
        status: editStatus,
      },
    });
    toast.success(t("admin.providers.toastUpdated"));
    setEditing(null);
    refresh();
  };

  return (
    <div>
      <PageHeader title={t("admin.providers.title")} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {rows.map((p) => (
          <Card key={p.id}>
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle>{p.display_name}</CardTitle>
                <div className="text-xs text-muted-foreground mt-1 mono">{p.name}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={p.status === "active" ? "success" : "warn"}>
                  {p.status === "active"
                    ? t("common.status.active")
                    : t("common.status.disabled")}
                </Badge>
                <Button variant="ghost" size="icon" onClick={() => startEdit(p)} title={t("admin.providers.editTitle")}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="text-xs text-muted-foreground">{t("admin.providers.baseUrlLabel")}</div>
              <div className="mono text-xs break-all">{p.base_url}</div>
              <div className="text-xs text-muted-foreground mt-2">{t("admin.providers.apiKeyLabel")}</div>
              <div className="mono text-xs text-muted-foreground">
                {t("admin.providers.apiKeyHintPrefix")}
                <span className="text-foreground">{t("admin.providers.apiKeyHintEnvVar")}</span>
                {t("admin.providers.apiKeyHintSuffix")}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.providers.editDialog.title", { name: editing?.name ?? "" })}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <FormField label={t("admin.providers.editDialog.displayNameLabel")}>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </FormField>
            <FormField label={t("admin.providers.editDialog.baseUrlLabel")}>
              <Input className="mono text-xs" value={editBase} onChange={(e) => setEditBase(e.target.value)} />
            </FormField>
            <FormField label={t("admin.providers.editDialog.statusLabel")}>
              <Select value={editStatus} onValueChange={(v) => setEditStatus(v as "active" | "disabled")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t("common.status.active")}</SelectItem>
                  <SelectItem value="disabled">{t("admin.providers.editDialog.disabledLongHint")}</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <p className="text-xs text-muted-foreground">
              {t("admin.providers.editDialog.rotateHintPrefix")}
              <span className="mono">{t("admin.providers.editDialog.rotateHintEnvVar")}</span>
              {t("admin.providers.editDialog.rotateHintMiddle")}
              <span className="mono">{t("admin.providers.editDialog.rotateHintEnvFile")}</span>
              {t("admin.providers.editDialog.rotateHintSuffix")}
            </p>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={() => setEditing(null)}>{t("admin.providers.editDialog.cancel")}</Button>
            <Button onClick={save}>{t("admin.providers.editDialog.save")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
