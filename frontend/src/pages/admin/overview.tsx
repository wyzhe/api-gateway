import { useEffect, useState } from "react";
import { KpiTile } from "@/components/kpi-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shell";
import { api } from "@/lib/api";
import { fmtCompactMoney } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type Overview = {
  users: number;
  today_requests: number;
  today_spend: string;
  month_spend: string;
  error_rate_today: number;
  usage_today: { text: number; image: number; video: number };
};

export function AdminOverviewPage() {
  const t = useT();
  const [data, setData] = useState<Overview | null>(null);
  useEffect(() => {
    api<Overview>("/api/admin/overview").then(setData).catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader title={t("admin.overview.title")} subtitle={t("admin.overview.subtitle")} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label={t("admin.overview.kpiUsers")} value={data?.users ?? 0} />
        <KpiTile
          label={t("admin.overview.kpiRequestsToday")}
          value={data?.today_requests ?? 0}
          hint={t("admin.overview.kpiRequestsTodayHint", {
            rate: ((data?.error_rate_today ?? 0) * 100).toFixed(1),
          })}
        />
        <KpiTile label={t("admin.overview.kpiTodaySpend")} value={fmtCompactMoney(data?.today_spend)} />
        <KpiTile label={t("admin.overview.kpiMonthSpend")} value={fmtCompactMoney(data?.month_spend)} />
      </div>
      <Card className="mt-4">
        <CardHeader><CardTitle>{t("admin.overview.todayByTypeTitle")}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-3 gap-3">
          <KpiTile label={t("common.reqType.text")} value={data?.usage_today.text ?? 0} />
          <KpiTile label={t("common.reqType.image")} value={data?.usage_today.image ?? 0} />
          <KpiTile label={t("common.reqType.video")} value={data?.usage_today.video ?? 0} />
        </CardContent>
      </Card>
    </div>
  );
}
