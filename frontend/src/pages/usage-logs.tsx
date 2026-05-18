import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LogDetailDrawer, useLogDetail } from "@/components/log-detail-drawer";
import { TypeBadge } from "@/components/type-badge";
import { PageHeader } from "@/components/shell";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { LogSummary } from "@/lib/types";
import { fmtCompactMoney, fmtRelative, statusBadgeVariant } from "@/lib/utils";

export function UsageLogsPage() {
  const t = useT();
  const [params] = useSearchParams();
  const [rows, setRows] = useState<LogSummary[]>([]);
  const [type, setType] = useState<string>(params.get("type") ?? "__all__");
  const [status, setStatus] = useState<string>(params.get("status") ?? "__all__");
  const [model, setModel] = useState<string>(params.get("model") ?? "");
  const apiKeyId = params.get("api_key_id");
  const detail = useLogDetail();

  const refresh = async () => {
    const qs = new URLSearchParams({ limit: "200" });
    if (type !== "__all__") qs.set("type", type);
    if (status !== "__all__") qs.set("status", status);
    if (model) qs.set("model", model);
    if (apiKeyId) qs.set("api_key_id", apiKeyId);
    const data = await api<LogSummary[]>(`/api/logs?${qs.toString()}`);
    setRows(data);
  };

  useEffect(() => {
    refresh().catch(() => {});
  }, [type, status, model, apiKeyId]);

  return (
    <div>
      <PageHeader title={t("usageLogs.title")} subtitle={t("usageLogs.subtitle")} />

      <div className="flex flex-wrap gap-2 mb-3">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-32"><SelectValue placeholder={t("usageLogs.filterTypePlaceholder")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("usageLogs.filterAllTypes")}</SelectItem>
            <SelectItem value="text">{t("usageLogs.typeText")}</SelectItem>
            <SelectItem value="image">{t("usageLogs.typeImage")}</SelectItem>
            <SelectItem value="video">{t("usageLogs.typeVideo")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder={t("usageLogs.filterStatusPlaceholder")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("usageLogs.filterAllStatuses")}</SelectItem>
            <SelectItem value="success">{t("usageLogs.statusSuccess")}</SelectItem>
            <SelectItem value="failed">{t("usageLogs.statusFailed")}</SelectItem>
            <SelectItem value="running">{t("usageLogs.statusRunning")}</SelectItem>
            <SelectItem value="queued">{t("usageLogs.statusQueued")}</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder={t("usageLogs.filterModelPlaceholder")}
          className="w-56"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
        <Button variant="outline" onClick={() => refresh()}>{t("usageLogs.refreshBtn")}</Button>
      </div>

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("usageLogs.colType")}</TableHead>
              <TableHead>{t("usageLogs.colModel")}</TableHead>
              <TableHead>{t("usageLogs.colStatus")}</TableHead>
              <TableHead>{t("usageLogs.colTokensAssets")}</TableHead>
              <TableHead>{t("usageLogs.colCost")}</TableHead>
              <TableHead>{t("usageLogs.colLatency")}</TableHead>
              <TableHead>{t("usageLogs.colKey")}</TableHead>
              <TableHead>{t("usageLogs.colWhen")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                  {t("usageLogs.empty")}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow
                key={r.id}
                onClick={() => detail.open(r.id)}
                className="cursor-pointer"
              >
                <TableCell><TypeBadge type={r.request_type} /></TableCell>
                <TableCell className="mono text-xs">{r.model_name || r.upstream_model}</TableCell>
                <TableCell>
                  <Badge variant={statusBadgeVariant(r.status)}>{r.status}</Badge>{" "}
                  {r.task_status && (
                    <Badge variant="outline" className="ml-1">{r.task_status}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.total_tokens && `${r.total_tokens}${t("usageLogs.cellTokensSuffix")}`}
                  {r.image_count && t("usageLogs.cellImageCount", { count: r.image_count })}
                  {r.video_duration && t("usageLogs.cellVideoDuration", { seconds: r.video_duration })}
                  {!r.total_tokens && !r.image_count && !r.video_duration && "—"}
                </TableCell>
                <TableCell className="mono text-xs">{fmtCompactMoney(r.cost)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.latency_ms ?? "—"}{t("usageLogs.latencyMs")}</TableCell>
                <TableCell className="mono text-xs">{r.api_key_prefix || "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtRelative(r.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <LogDetailDrawer log={detail.selected} onClose={detail.close} />
    </div>
  );
}
