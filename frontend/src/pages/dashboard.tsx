import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { KpiStrip } from "@/components/kpi-strip";
import { EmptyState } from "@/components/empty-state";
import { SectionHeading } from "@/components/section-heading";
import { DotStatus } from "@/components/dot-status";
import { LogDetailDrawer, useLogDetail } from "@/components/log-detail-drawer";
import { TypeBadge } from "@/components/type-badge";
import { PageHeader } from "@/components/shell";
import { UsageTrends } from "@/components/usage-trends";
import { api } from "@/lib/api";
import type { LogSummary, DailyUsage } from "@/lib/types";
import { fmtCompactMoney, fmtRelative, reqStatusKey } from "@/lib/utils";
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
  daily_usage: DailyUsage[];
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

      <KpiStrip
        cols={5}
        items={[
          {
            label: t("dashboard.kpiBalance"),
            value: fmtCompactMoney(data?.balance),
            onClick: () => nav("/billing"),
            title: t("dashboard.kpiBillingLink"),
          },
          {
            label: t("dashboard.kpiTodaySpend"),
            value: fmtCompactMoney(data?.today_spend),
          },
          {
            label: t("dashboard.kpiMonthSpend"),
            value: fmtCompactMoney(data?.month_spend),
          },
          {
            label: t("dashboard.kpiTextRequestsToday"),
            value: data?.today_text_requests ?? 0,
            hint: t("dashboard.kpiMediaHint", {
              image: data?.today_image_requests ?? 0,
              video: data?.today_video_requests ?? 0,
            }),
          },
          {
            label: t("dashboard.kpiFailuresRecent"),
            value: data?.recent_failures.length ?? 0,
            onClick: () => nav("/logs?status=failed"),
            title: t("dashboard.kpiViewFailedTitle"),
          },
        ]}
      />

      <UsageTrends data={data?.daily_usage} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2">
          <SectionHeading
            actions={<Link to="/logs" className="text-xs text-primary hover:underline">{t("dashboard.allLogsLink")}</Link>}
          >
            {t("dashboard.recentActivity")}
          </SectionHeading>
          {data && data.recent_logs.length === 0 ? (
            <EmptyState
              title={t("dashboard.emptyRecentTitle")}
              action={<Link to="/playground" className="text-primary hover:underline">{t("dashboard.emptyRecentLink")}</Link>}
            />
          ) : (
            <ul className="divide-y divide-border border-t border-b border-border">
              {data?.recent_logs.slice(0, 10).map((r) => (
                <li
                  key={r.id}
                  onClick={() => detail.open(r.id)}
                  className="px-2 py-2 flex items-center gap-3 text-xs cursor-pointer hover:bg-surface-2"
                >
                  <TypeBadge type={r.request_type} />
                  <span className="mono text-foreground">{r.model_name || r.upstream_model}</span>
                  <DotStatus status={r.status} label={t(reqStatusKey(r.status))} />
                  <span className="text-muted-foreground ml-auto">{fmtCompactMoney(r.cost)}</span>
                  <span className="text-muted-foreground w-20 text-right">{fmtRelative(r.created_at, t)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-6">
          <section>
            <SectionHeading>{t("dashboard.topModels")}</SectionHeading>
            <TopModelBars
              empty={t("dashboard.noDataYet")}
              items={data?.top_models_by_cost ?? []}
              onClick={(name) => nav(`/logs?model=${encodeURIComponent(name)}`)}
            />
          </section>
          <section>
            <SectionHeading>{t("dashboard.topApiKeys")}</SectionHeading>
            <StatRows
              empty={t("dashboard.noDataYet")}
              items={data?.top_api_keys_by_usage ?? []}
              getKey={(k) => k.api_key_id ?? -1}
              getLabel={(k) => k.api_key_prefix ? `${k.api_key_prefix}…` : t("dashboard.deletedKey")}
              getValue={(k) => t("dashboard.statValueRequestsCost", { requests: k.requests, cost: fmtCompactMoney(k.cost) })}
              onClick={(k) => k.api_key_id && nav(`/logs?api_key_id=${k.api_key_id}`)}
            />
          </section>
        </div>
      </div>

      <LogDetailDrawer log={detail.selected} onClose={detail.close} />
    </div>
  );
}

function StatRows<T>({
  empty, items, getKey, getLabel, getValue, onClick,
}: {
  empty: string;
  items: T[];
  getKey: (it: T) => number | string;
  getLabel: (it: T) => string;
  getValue: (it: T) => string;
  onClick: (it: T) => void;
}) {
  if (items.length === 0) {
    return <div className="py-3 text-xs text-muted-foreground">{empty}</div>;
  }
  return (
    <ul className="divide-y divide-border border-t border-b border-border">
      {items.map((it) => (
        <li
          key={getKey(it)}
          onClick={() => onClick(it)}
          className="px-2 py-1.5 flex items-center justify-between text-xs cursor-pointer hover:bg-surface-2"
        >
          <span className="mono">{getLabel(it)}</span>
          <span className="text-muted-foreground">{getValue(it)}</span>
        </li>
      ))}
    </ul>
  );
}

function TopModelBars({
  empty,
  items,
  onClick,
}: {
  empty: string;
  items: DashboardOut["top_models_by_cost"];
  onClick: (modelName: string) => void;
}) {
  const t = useT();
  if (items.length === 0) {
    return <div className="py-3 text-xs text-muted-foreground">{empty}</div>;
  }
  const max = Math.max(...items.map((m) => Number(m.cost)), 0);
  return (
    <ul className="flex flex-col gap-2.5 border-t border-b border-border py-2.5">
      {items.map((m) => {
        const pct = max > 0 ? (Number(m.cost) / max) * 100 : 0;
        return (
          <li
            key={m.model_id ?? -1}
            onClick={() => m.model_name && onClick(m.model_name)}
            className="group cursor-pointer rounded-sm px-2 py-1 transition-colors hover:bg-surface-2"
          >
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="mono group-hover:text-foreground">{m.model_name || "—"}</span>
              <span className="text-muted-foreground">
                {t("dashboard.statValueCostRequests", {
                  cost: fmtCompactMoney(m.cost),
                  requests: m.requests,
                })}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-info" style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
