import { Image, Play, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DotStatus } from "@/components/dot-status";
import { EmptyState } from "@/components/empty-state";
import { LogDetailDrawer, useLogDetail } from "@/components/log-detail-drawer";
import { PageHeader } from "@/components/shell";
import { TypeBadge } from "@/components/type-badge";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { LogSummary as Log } from "@/lib/types";
import { cn, fmtCompactMoney, fmtRelative, reqStatusKey } from "@/lib/utils";

/** 40×40 preview cell. The full-size asset opens in the detail drawer on row click. */
function Thumbnail({ log }: { log: Log }) {
  const box =
    "h-10 w-10 shrink-0 rounded-md border border-border bg-surface-2 overflow-hidden flex items-center justify-center";
  if (log.asset_url && log.request_type === "image") {
    return (
      <div className={box}>
        <img src={log.asset_url} loading="lazy" className="h-full w-full object-cover" />
      </div>
    );
  }
  if (log.asset_url && log.request_type === "video") {
    return (
      <div className={cn(box, "relative")}>
        <video src={log.asset_url} preload="metadata" muted className="h-full w-full object-cover" />
        <Play className="absolute h-3.5 w-3.5 fill-white/90 text-white/90 drop-shadow" />
      </div>
    );
  }
  const Icon = log.request_type === "video" ? Video : Image;
  return (
    <div className={box}>
      <Icon className="h-4 w-4 text-faint" />
    </div>
  );
}

export function GenerationsPage() {
  const t = useT();
  const [items, setItems] = useState<Log[]>([]);
  const detail = useLogDetail();

  const refresh = () => {
    Promise.all([
      api<Log[]>("/api/logs?type=image&limit=100"),
      api<Log[]>("/api/logs?type=video&limit=100"),
    ])
      .then(([img, vid]) => {
        const merged = [...img, ...vid].sort((a, b) =>
          b.created_at.localeCompare(a.created_at),
        );
        setItems(merged);
      })
      .catch(() => {});
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div>
      <PageHeader
        title={t("generations.title")}
        actions={<Button variant="outline" onClick={refresh}>{t("generations.refreshBtn")}</Button>}
      />

      <p className="mb-3 text-xs text-muted-foreground">{t("generations.assetExpiryNotice")}</p>

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">{t("generations.colPreview")}</TableHead>
              <TableHead>{t("generations.colType")}</TableHead>
              <TableHead>{t("generations.colModel")}</TableHead>
              <TableHead>{t("generations.colStatus")}</TableHead>
              <TableHead>{t("generations.colCost")}</TableHead>
              <TableHead>{t("generations.colWhen")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="p-0">
                  <EmptyState
                    title={t("generations.emptyTitle")}
                    action={
                      <Link to="/playground" className="text-primary hover:underline">
                        {t("generations.emptyLink")}
                      </Link>
                    }
                  />
                </TableCell>
              </TableRow>
            )}
            {items.map((it) => {
              const status = it.task_status || it.status;
              return (
                <TableRow
                  key={it.id}
                  onClick={() => detail.open(it.id)}
                  className="cursor-pointer"
                >
                  <TableCell>
                    <Thumbnail log={it} />
                  </TableCell>
                  <TableCell>
                    <TypeBadge type={it.request_type} />
                  </TableCell>
                  <TableCell className="mono text-xs">
                    {it.model_name || it.upstream_model}
                  </TableCell>
                  <TableCell>
                    <DotStatus status={status} label={t(reqStatusKey(status))} />
                  </TableCell>
                  <TableCell className="mono text-xs">{fmtCompactMoney(it.cost)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {fmtRelative(it.created_at, t)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <LogDetailDrawer log={detail.selected} onClose={detail.close} showPrompt />
    </div>
  );
}
