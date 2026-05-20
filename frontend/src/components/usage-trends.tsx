import { useState, type ReactNode } from "react";
import { BarChart, type BarDatum, type BarSeries } from "@/components/ui/bar-chart";
import { SectionHeading } from "@/components/section-heading";
import { useT } from "@/lib/i18n";
import { fmtCompactMoney } from "@/lib/utils";
import type { DailyUsage } from "@/lib/types";

type Range = 7 | 30;

/** Format a "YYYY-MM-DD" UTC day string as "M/D". */
function fmtDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

export function UsageTrends({ data }: { data: DailyUsage[] | undefined }) {
  const t = useT();
  const [range, setRange] = useState<Range>(30);

  const rows = (data ?? []).slice(-range);

  // text/image/video series — keys + colors reused by both charts; colors
  // match TypeBadge (text=info, image=warn, video=accent).
  const series: BarSeries[] = [
    { key: "text", label: t("dashboard.legendText"), colorVar: "--info" },
    { key: "image", label: t("dashboard.legendImage"), colorVar: "--warn" },
    { key: "video", label: t("dashboard.legendVideo"), colorVar: "--accent" },
  ];

  const spendData: BarDatum[] = rows.map((r) => ({
    label: fmtDay(r.date),
    tooltipLabel: fmtDay(r.date),
    values: {
      text: Number(r.text_cost),
      image: Number(r.image_cost),
      video: Number(r.video_cost),
    },
  }));
  const reqData: BarDatum[] = rows.map((r) => ({
    label: fmtDay(r.date),
    tooltipLabel: fmtDay(r.date),
    values: {
      text: r.text_requests,
      image: r.image_requests,
      video: r.video_requests,
    },
  }));

  const spendTotal = spendData.reduce(
    (s, d) => s + d.values.text + d.values.image + d.values.video,
    0,
  );
  const reqTotal = reqData.reduce(
    (s, d) => s + d.values.text + d.values.image + d.values.video,
    0,
  );

  const firstDay = rows.length ? fmtDay(rows[0].date) : "";
  const lastDay = rows.length ? fmtDay(rows[rows.length - 1].date) : "";

  const toggle = (
    <div className="inline-flex overflow-hidden rounded-md border border-border text-xs">
      {([7, 30] as Range[]).map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={range === r}
          onClick={() => setRange(r)}
          className={
            "px-2.5 py-1 transition-colors " +
            (range === r
              ? "bg-surface-2 text-foreground"
              : "text-muted-foreground hover:text-foreground")
          }
        >
          {t(r === 7 ? "dashboard.range7d" : "dashboard.range30d")}
        </button>
      ))}
    </div>
  );

  return (
    <section className="mb-6">
      <SectionHeading actions={toggle}>{t("dashboard.usageTrends")}</SectionHeading>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title={t("dashboard.chartSpend")}
          bigValue={fmtCompactMoney(spendTotal)}
          legend={series}
          firstDay={firstDay}
          lastDay={lastDay}
        >
          <BarChart
            data={spendData}
            series={series}
            formatValue={(v) => fmtCompactMoney(v)}
            emptyText={t("dashboard.chartEmpty")}
            totalLabel={t("dashboard.tooltipTotal")}
          />
        </ChartCard>
        <ChartCard
          title={t("dashboard.chartRequests")}
          bigValue={reqTotal.toLocaleString()}
          legend={series}
          firstDay={firstDay}
          lastDay={lastDay}
        >
          <BarChart
            data={reqData}
            series={series}
            formatValue={(v) => Math.round(v).toLocaleString()}
            emptyText={t("dashboard.chartEmpty")}
            totalLabel={t("dashboard.tooltipTotal")}
          />
        </ChartCard>
      </div>
    </section>
  );
}

function ChartCard({
  title,
  bigValue,
  legend,
  firstDay,
  lastDay,
  children,
}: {
  title: string;
  bigValue: string;
  legend: BarSeries[];
  firstDay: string;
  lastDay: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{title}</span>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {legend.map((s) => (
            <span key={s.key} className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ backgroundColor: `var(${s.colorVar})` }}
              />
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <div className="kpi-strip-value mono mb-3">{bigValue}</div>
      {children}
      {(firstDay || lastDay) && (
        <div className="mt-1.5 flex justify-between border-t border-border pt-1.5 text-[10px] text-faint">
          <span>{firstDay}</span>
          <span>{lastDay}</span>
        </div>
      )}
    </div>
  );
}
