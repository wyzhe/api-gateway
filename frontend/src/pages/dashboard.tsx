import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiTile } from "@/components/kpi-tile";
import { Badge } from "@/components/ui/badge";
import { TypeBadge } from "@/components/type-badge";
import { PageHeader } from "@/components/shell";
import { api } from "@/lib/api";
import { fmtCompactMoney, fmtRelative } from "@/lib/utils";

type DashboardOut = {
  balance: string;
  today_text_requests: number;
  today_image_requests: number;
  today_video_requests: number;
  today_spend: string;
  month_spend: string;
  recent_failures: any[];
  recent_logs: any[];
  top_models_by_cost: Array<{ model_id: number | null; model_name: string | null; cost: string; requests: number }>;
  top_api_keys_by_usage: Array<{ api_key_id: number | null; api_key_prefix: string | null; requests: number; cost: string }>;
};

export function DashboardPage() {
  const [data, setData] = useState<DashboardOut | null>(null);

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
        <KpiTile
          label="Failures (recent)"
          value={data?.recent_failures.length ?? 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data && data.recent_logs.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                No requests yet. Try the <Link to="/playground" className="text-primary hover:underline">Playground</Link>.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {data?.recent_logs.slice(0, 10).map((r) => (
                  <li key={r.id} className="px-4 py-2.5 flex items-center gap-3 text-xs">
                    <TypeBadge type={r.request_type} />
                    <span className="mono text-foreground">{r.model_name || r.upstream_model}</span>
                    <Badge variant={r.status === "success" ? "success" : r.status === "failed" ? "danger" : "info"}>
                      {r.status}
                    </Badge>
                    <span className="text-muted-foreground ml-auto">{fmtCompactMoney(r.cost)}</span>
                    <span className="text-muted-foreground w-20 text-right">{fmtRelative(r.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Top models</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data && data.top_models_by_cost.length === 0 ? (
                <div className="p-4 text-xs text-muted-foreground">No data yet.</div>
              ) : (
                <ul className="divide-y divide-border">
                  {data?.top_models_by_cost.map((m) => (
                    <li key={m.model_id} className="px-4 py-2 flex items-center justify-between text-xs">
                      <span className="mono">{m.model_name || "—"}</span>
                      <span className="text-muted-foreground">{fmtCompactMoney(m.cost)} · {m.requests}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top API keys</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data && data.top_api_keys_by_usage.length === 0 ? (
                <div className="p-4 text-xs text-muted-foreground">No data yet.</div>
              ) : (
                <ul className="divide-y divide-border">
                  {data?.top_api_keys_by_usage.map((k) => (
                    <li key={k.api_key_id} className="px-4 py-2 flex items-center justify-between text-xs">
                      <span className="mono">{k.api_key_prefix}…</span>
                      <span className="text-muted-foreground">{k.requests} req · {fmtCompactMoney(k.cost)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
