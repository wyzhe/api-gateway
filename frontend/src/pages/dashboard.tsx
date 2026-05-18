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
import { fmtCompactMoney, fmtRelative, statusBadgeVariant } from "@/lib/utils";

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

  useEffect(() => {
    api<DashboardOut>("/api/dashboard").then(setData).catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Today's usage at a glance" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiTile
          label="Balance"
          value={fmtCompactMoney(data?.balance)}
          hint={<Link to="/billing" className="text-primary hover:underline">Billing →</Link>}
        />
        <KpiTile
          label="Today spend"
          value={fmtCompactMoney(data?.today_spend)}
          hint={`This month: ${fmtCompactMoney(data?.month_spend)}`}
        />
        <KpiTile
          label="Text requests today"
          value={data?.today_text_requests ?? 0}
          hint={`${data?.today_image_requests ?? 0} image · ${data?.today_video_requests ?? 0} video`}
        />
        <button
          type="button"
          onClick={() => nav("/logs?status=failed")}
          className="text-left focus:outline-none focus:ring-2 focus:ring-ring rounded-md"
          title="View all failed requests"
        >
          <KpiTile
            label="Failures (recent)"
            value={data?.recent_failures.length ?? 0}
            hint={<span className="text-primary hover:underline">View failed →</span>}
          />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent activity</CardTitle>
            <Link to="/logs" className="text-xs text-primary hover:underline">All logs →</Link>
          </CardHeader>
          <CardContent className="p-0">
            {data && data.recent_logs.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                No requests yet. Try the <Link to="/playground" className="text-primary hover:underline">Playground</Link>.
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
                    <Badge variant={statusBadgeVariant(r.status)}>{r.status}</Badge>
                    <span className="text-muted-foreground ml-auto">{fmtCompactMoney(r.cost)}</span>
                    <span className="text-muted-foreground w-20 text-right">{fmtRelative(r.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <StatList
            title="Top models"
            empty="No data yet."
            items={data?.top_models_by_cost ?? []}
            getKey={(m) => m.model_id ?? -1}
            getLabel={(m) => m.model_name || "—"}
            getValue={(m) => `${fmtCompactMoney(m.cost)} · ${m.requests}`}
            onClick={(m) => m.model_name && nav(`/logs?model=${encodeURIComponent(m.model_name)}`)}
          />
          <StatList
            title="Top API keys"
            empty="No data yet."
            items={data?.top_api_keys_by_usage ?? []}
            getKey={(k) => k.api_key_id ?? -1}
            getLabel={(k) => `${k.api_key_prefix}…`}
            getValue={(k) => `${k.requests} req · ${fmtCompactMoney(k.cost)}`}
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
