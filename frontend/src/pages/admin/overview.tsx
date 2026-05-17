import { useEffect, useState } from "react";
import { KpiTile } from "@/components/kpi-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shell";
import { api } from "@/lib/api";
import { fmtCompactMoney } from "@/lib/utils";

type Overview = {
  users: number;
  today_requests: number;
  today_spend: string;
  month_spend: string;
  error_rate_today: number;
  usage_today: { text: number; image: number; video: number };
};

export function AdminOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  useEffect(() => {
    api<Overview>("/api/admin/overview").then(setData).catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader title="Admin overview" subtitle="System-wide usage." />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Users" value={data?.users ?? 0} />
        <KpiTile label="Requests today" value={data?.today_requests ?? 0} hint={`error rate ${((data?.error_rate_today ?? 0) * 100).toFixed(1)}%`} />
        <KpiTile label="Today spend" value={fmtCompactMoney(data?.today_spend)} />
        <KpiTile label="Month spend" value={fmtCompactMoney(data?.month_spend)} />
      </div>
      <Card className="mt-4">
        <CardHeader><CardTitle>Today by type</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-3 gap-3">
          <KpiTile label="Text" value={data?.usage_today.text ?? 0} />
          <KpiTile label="Image" value={data?.usage_today.image ?? 0} />
          <KpiTile label="Video" value={data?.usage_today.video ?? 0} />
        </CardContent>
      </Card>
    </div>
  );
}
