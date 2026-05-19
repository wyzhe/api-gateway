import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiTile } from "@/components/kpi-tile";
import { Badge } from "@/components/ui/badge";
import { LogDetailDrawer, useLogDetail } from "@/components/log-detail-drawer";
import { TypeBadge } from "@/components/type-badge";
import { PageHeader } from "@/components/shell";
import { api } from "@/lib/api";
import type { LogSummary } from "@/lib/types";
import { fmtBalance, fmtCompactMoney, fmtRelative, reqStatusKey, statusBadgeVariant } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type DashboardOut = {
  balance: string;
  today_text_requests: number;
  today_image_requests: number;
  today_video_requests: number;
  today_spend: string;
  month_spend: string;
  recent_failures: LogSummary[];
  recent_logs: LogSummary[];
  top_models_by_cost: Array<{ model_id: number | null; model_name: string | null; cost: string; requests: number }>;
  top_api_keys_by_usage: Array<{ api_key_id: number | null; api_key_prefix: string | null; requests: number; cost: string }>;
};

export function DashboardPage() {
  const [data, setData] = useState<DashboardOut | null>(null);
  const detail = useLogDetail();
  const nav = useNavigate();
  const t = useT();

  useEffect(() => {
    api<DashboardOut>("/api/dashboard").then(setData).catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader title={t("dashboard.title")} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiTile
          label={t("dashboard.kpiBalance")}
          value={fmtBalance(data?.balance)}
          hint={<Link to="/billing" className="text-primary hover:underline">{t("dashboard.kpiBillingLink")}</Link>}
        />
        <KpiTile
          label={t("dashboard.kpiTodaySpend")}
          value={fmtCompactMoney(data?.today_spend)}
          hint={t("dashboard.kpiThisMonthHint", { amount: fmtCompactMoney(data?.month_spend) })}
        />
        <KpiTile
          label={t("dashboard.kpiTextRequestsToday")}
          value={data?.today_text_requests ?? 0}
          hint={t("dashboard.kpiMediaHint", {
            image: data?.today_image_requests ?? 0,
            video: data?.today_video_requests ?? 0,
          })}
        />
        <button
          type="button"
          onClick={() => nav("/logs?status=failed")}
          className="text-left focus:outline-none focus:ring-2 focus:ring-ring rounded-md"
          title={t("dashboard.kpiViewFailedTitle")}
        >
          <KpiTile
            label={t("dashboard.kpiFailuresRecent")}
            value={data?.recent_failures.length ?? 0}
            hint={<span className="text-primary hover:underline">{t("dashboard.kpiViewFailed")}</span>}
          />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t("dashboard.recentActivity")}</CardTitle>
            <Link to="/logs" className="text-xs text-primary hover:underline">{t("dashboard.allLogsLink")}</Link>
          </CardHeader>
          <CardContent className="p-0">
            {data && data.recent_logs.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                {t("dashboard.emptyRecentPrefix")}
                <Link to="/playground" className="text-primary hover:underline">{t("dashboard.emptyRecentLink")}</Link>
                {t("dashboard.emptyRecentSuffix")}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {data?.recent_logs.slice(0, 10).map((r) => (
                  <li
                    key={r.id}
                    onClick={() => detail.open(r.id)}
                    className="px-4 py-2.5 flex items-center gap-3 text-xs cursor-pointer hover:bg-surface-2"
                  >
                    <TypeBadge type={r.request_type} />
                    <span className="mono text-foreground">{r.model_name || r.upstream_model}</span>
                    <Badge variant={statusBadgeVariant(r.status)}>{t(reqStatusKey(r.status))}</Badge>
                    <span className="text-muted-foreground ml-auto">{fmtCompactMoney(r.cost)}</span>
                    <span className="text-muted-foreground w-20 text-right">{fmtRelative(r.created_at, t)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <StatList
            title={t("dashboard.topModels")}
            empty={t("dashboard.noDataYet")}
            items={data?.top_models_by_cost ?? []}
            getKey={(m) => m.model_id ?? -1}
            getLabel={(m) => m.model_name || "—"}
            getValue={(m) => t("dashboard.statValueCostRequests", { cost: fmtCompactMoney(m.cost), requests: m.requests })}
            onClick={(m) => m.model_name && nav(`/logs?model=${encodeURIComponent(m.model_name)}`)}
          />
          <StatList
            title={t("dashboard.topApiKeys")}
            empty={t("dashboard.noDataYet")}
            items={data?.top_api_keys_by_usage ?? []}
            getKey={(k) => k.api_key_id ?? -1}
            getLabel={(k) => k.api_key_prefix ? `${k.api_key_prefix}…` : t("dashboard.deletedKey")}
            getValue={(k) => t("dashboard.statValueRequestsCost", { requests: k.requests, cost: fmtCompactMoney(k.cost) })}
            onClick={(k) => k.api_key_id && nav(`/logs?api_key_id=${k.api_key_id}`)}
          />
        </div>
      </div>

      <LogDetailDrawer log={detail.selected} onClose={detail.close} />
    </div>
  );
}

function StatList<T>({
  title, empty, items, getKey, getLabel, getValue, onClick,
}: {
  title: string;
  empty: string;
  items: T[];
  getKey: (it: T) => number | string;
  getLabel: (it: T) => string;
  getValue: (it: T) => string;
  onClick: (it: T) => void;
}) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground">{empty}</div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((it) => (
              <li
                key={getKey(it)}
                onClick={() => onClick(it)}
                className="px-4 py-2 flex items-center justify-between text-xs cursor-pointer hover:bg-surface-2"
              >
                <span className="mono">{getLabel(it)}</span>
                <span className="text-muted-foreground">{getValue(it)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
