import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TypeBadge } from "@/components/type-badge";
import { PageHeader } from "@/components/shell";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { LogDetail as Detail, LogSummary as Log } from "@/lib/types";
import { fmtCompactMoney, fmtDate, fmtRelative, reqStatusKey, statusBadgeVariant } from "@/lib/utils";

export function AdminLogsPage() {
  const t = useT();
  const [rows, setRows] = useState<Log[]>([]);
  const [type, setType] = useState("__all__");
  const [userId, setUserId] = useState("");
  const [status, setStatus] = useState("__all__");
  const [selected, setSelected] = useState<Detail | null>(null);

  const refresh = async () => {
    const qs = new URLSearchParams({ limit: "300" });
    if (type !== "__all__") qs.set("type", type);
    if (status !== "__all__") qs.set("status", status);
    if (userId) qs.set("user_id", userId);
    const data = await api<Log[]>(`/api/admin/logs?${qs.toString()}`);
    setRows(data);
  };
  useEffect(() => {
    refresh().catch(() => {});
  }, [type, status, userId]);

  return (
    <div>
      <PageHeader title={t("admin.logs.title")} />
      <div className="flex flex-wrap gap-2 mb-3">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("admin.logs.filterAllTypes")}</SelectItem>
            <SelectItem value="text">{t("common.reqType.text")}</SelectItem>
            <SelectItem value="image">{t("common.reqType.image")}</SelectItem>
            <SelectItem value="video">{t("common.reqType.video")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("admin.logs.filterAllStatuses")}</SelectItem>
            <SelectItem value="success">{t("admin.logs.statusSuccess")}</SelectItem>
            <SelectItem value="failed">{t("admin.logs.statusFailed")}</SelectItem>
            <SelectItem value="running">{t("admin.logs.statusRunning")}</SelectItem>
            <SelectItem value="queued">{t("admin.logs.statusQueued")}</SelectItem>
          </SelectContent>
        </Select>
        <Input className="w-32" placeholder={t("admin.logs.userIdPlaceholder")} value={userId} onChange={(e) => setUserId(e.target.value)} />
        <Button variant="outline" onClick={() => refresh()}>{t("admin.logs.refreshBtn")}</Button>
      </div>

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.logs.colType")}</TableHead>
              <TableHead>{t("admin.logs.colUser")}</TableHead>
              <TableHead>{t("admin.logs.colModel")}</TableHead>
              <TableHead>{t("admin.logs.colStatus")}</TableHead>
              <TableHead>{t("admin.logs.colCost")}</TableHead>
              <TableHead>{t("admin.logs.colLatency")}</TableHead>
              <TableHead>{t("admin.logs.colWhen")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} onClick={async () => setSelected(await api<Detail>(`/api/admin/logs/${r.id}`))} className="cursor-pointer">
                <TableCell><TypeBadge type={r.request_type} /></TableCell>
                <TableCell className="text-xs">#{r.user_id}</TableCell>
                <TableCell className="mono text-xs">{r.model_name || r.upstream_model}</TableCell>
                <TableCell>
                  <Badge variant={statusBadgeVariant(r.status)}>{t(reqStatusKey(r.status))}</Badge>
                </TableCell>
                <TableCell className="mono text-xs">{fmtCompactMoney(r.cost)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.latency_ms ?? "—"}{t("admin.logs.latencyMs")}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtRelative(r.created_at, t)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent>
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.model_name || selected.upstream_model}</SheetTitle>
                <SheetDescription className="mono">{selected.request_id}</SheetDescription>
              </SheetHeader>
              <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                <div>{t("admin.logs.drawerUser")}: <span className="mono">#{selected.user_id}</span></div>
                <div>{t("admin.logs.drawerCost")}: <span className="mono">{fmtCompactMoney(selected.cost)}</span></div>
                <div>{t("admin.logs.drawerLatency")}: {selected.latency_ms ?? "—"} {t("admin.logs.drawerLatencyUnit")}</div>
                <div>{t("admin.logs.drawerWhen")}: {fmtDate(selected.created_at)}</div>
              </div>
              {selected.error_message && (
                <div className="mt-3 text-xs border border-destructive/40 bg-destructive/10 text-destructive px-3 py-2 rounded-md">
                  {selected.error_message}
                </div>
              )}
              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">{t("admin.logs.sectionRequest")}</div>
                <CodeBlock lang="json" code={JSON.stringify(selected.request_payload_json, null, 2)} maxHeight="14rem" />
              </div>
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">{t("admin.logs.sectionResponse")}</div>
                <CodeBlock lang="json" code={JSON.stringify(selected.response_payload_json, null, 2)} maxHeight="20rem" />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
