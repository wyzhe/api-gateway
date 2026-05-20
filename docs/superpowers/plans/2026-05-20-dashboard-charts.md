# Dashboard 图表展示增强 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在用户侧 `/dashboard` 页面增加基础的「花费 + 用量」可视化:用量趋势双柱状图(7/30 天切换)、本月花费 KPI 格、Top 模型横向条形图。

**Architecture:** 后端给现有 `GET /api/dashboard` 的 `DashboardOut` 新增一个 `daily_usage` 字段(最近 30 个 UTC 自然日的聚合);前端新增一个手写 SVG 堆叠柱状图原语 `BarChart` 和一个 `UsageTrends` 区块组件,嵌进 `dashboard.tsx`。不引图表库,不新建路由。

**Tech Stack:** 后端 FastAPI + SQLAlchemy 2 + Pydantic + pytest;前端 React 19 + TypeScript(strict)+ Tailwind v4 + 手写 SVG。

**Spec:** `docs/superpowers/specs/2026-05-20-dashboard-charts-design.md`

---

## 文件结构

**后端**
- 改:`backend/app/api/dashboard.py` — 新增 `DailyUsageEntry` 模型、`build_daily_usage` 纯函数、聚合查询、`DashboardOut.daily_usage` 字段。
- 建:`backend/tests/test_dashboard_usage.py` — `build_daily_usage` 纯函数单测。
- 建:`backend/tests/test_dashboard_api.py` — `/api/dashboard` 响应 shape 集成测试。

**前端**
- 建:`frontend/src/components/ui/bar-chart.tsx` — 堆叠柱状图原语。
- 建:`frontend/src/components/usage-trends.tsx` — 用量趋势区块。
- 改:`frontend/src/lib/types.ts` — 新增 `DailyUsage` 类型。
- 改:`frontend/src/lib/i18n/dict-en.ts` + `dict-zh.ts` — 新增 i18n key,删除废弃的 `kpiThisMonthHint`。
- 改:`frontend/src/components/kpi-strip.tsx` — 支持 5 列。
- 改:`frontend/src/pages/dashboard.tsx` — 集成 `UsageTrends`、本月花费 KPI 格、Top 模型横向条形图。
- 改:`DESIGN.md`(仓库根目录)— 记录 `BarChart`、`UsageTrends` 组件。

---

## Task 1: 后端 — `build_daily_usage` 纯函数 + `DailyUsageEntry` 模型

**Files:**
- Modify: `backend/app/api/dashboard.py`
- Test: `backend/tests/test_dashboard_usage.py`

- [ ] **Step 1: 写失败测试**

Create `backend/tests/test_dashboard_usage.py`:

```python
"""Unit tests for build_daily_usage — pure function, runs without Postgres."""
from datetime import date
from decimal import Decimal

from app.api.dashboard import DailyUsageEntry, build_daily_usage


def test_empty_input_yields_30_zero_buckets():
    out = build_daily_usage([], date(2026, 4, 21))
    assert len(out) == 30
    assert all(isinstance(e, DailyUsageEntry) for e in out)
    assert out[0].date == date(2026, 4, 21)
    assert out[29].date == date(2026, 5, 20)
    assert all(e.text_cost == Decimal("0") and e.text_requests == 0 for e in out)


def test_dates_are_consecutive_ascending():
    out = build_daily_usage([], date(2026, 4, 21))
    for i in range(1, len(out)):
        assert (out[i].date - out[i - 1].date).days == 1


def test_single_day_single_type():
    rows = [(date(2026, 4, 21), "text", Decimal("1.50"), 3)]
    out = build_daily_usage(rows, date(2026, 4, 21))
    assert out[0].text_cost == Decimal("1.50")
    assert out[0].text_requests == 3
    assert out[0].image_cost == Decimal("0")
    assert out[1].text_cost == Decimal("0")


def test_multi_day_multi_type_pivot_with_gap():
    rows = [
        (date(2026, 4, 21), "text", Decimal("1.00"), 2),
        (date(2026, 4, 21), "image", Decimal("0.30"), 1),
        (date(2026, 4, 23), "video", Decimal("2.00"), 1),
    ]
    out = build_daily_usage(rows, date(2026, 4, 21))
    assert out[0].text_cost == Decimal("1.00")
    assert out[0].image_cost == Decimal("0.30")
    assert out[0].text_requests == 2
    assert out[1].text_cost == Decimal("0")  # 4/22 gap zero-filled
    assert out[2].video_cost == Decimal("2.00")
    assert out[2].video_requests == 1


def test_cost_stays_decimal_not_float():
    rows = [(date(2026, 4, 21), "text", 0.1, 1)]  # float-ish input
    out = build_daily_usage(rows, date(2026, 4, 21))
    assert isinstance(out[0].text_cost, Decimal)


def test_unknown_request_type_is_ignored():
    rows = [(date(2026, 4, 21), "embedding", Decimal("9.99"), 5)]
    out = build_daily_usage(rows, date(2026, 4, 21))
    assert out[0].text_cost == Decimal("0")
    assert out[0].text_requests == 0
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/bin/pytest tests/test_dashboard_usage.py -v`
Expected: FAIL — `ImportError: cannot import name 'DailyUsageEntry'` / `'build_daily_usage'`.

- [ ] **Step 3: 实现 `DailyUsageEntry` 与 `build_daily_usage`**

In `backend/app/api/dashboard.py`, change the top imports — add `date, timedelta`:

```python
from datetime import date, timedelta
from decimal import Decimal
```

Add the new Pydantic model next to `TopModelEntry` (before `class DashboardOut`):

```python
class DailyUsageEntry(BaseModel):
    date: date
    text_cost: Decimal
    image_cost: Decimal
    video_cost: Decimal
    text_requests: int
    image_requests: int
    video_requests: int
```

Add the pure function below the Pydantic models (above the `@router.get` route):

```python
def build_daily_usage(
    rows: list[tuple[date, str, Decimal, int]],
    start: date,
    num_days: int = 30,
) -> list[DailyUsageEntry]:
    """Pivot grouped (day, request_type, cost, count) rows into `num_days`
    consecutive daily buckets starting at `start`. Missing days are zero-filled.
    Only request_type in {text, image, video} is counted; others are ignored.
    cost is always wrapped as Decimal(str(...)) — never raw float."""
    by_day: dict[date, dict[str, tuple[Decimal, int]]] = {}
    for day, rtype, cost, count in rows:
        by_day.setdefault(day, {})[rtype] = (Decimal(str(cost)), int(count))

    out: list[DailyUsageEntry] = []
    for i in range(num_days):
        d = start + timedelta(days=i)
        types = by_day.get(d, {})
        t_cost, t_n = types.get("text", (Decimal("0"), 0))
        i_cost, i_n = types.get("image", (Decimal("0"), 0))
        v_cost, v_n = types.get("video", (Decimal("0"), 0))
        out.append(
            DailyUsageEntry(
                date=d,
                text_cost=t_cost,
                image_cost=i_cost,
                video_cost=v_cost,
                text_requests=t_n,
                image_requests=i_n,
                video_requests=v_n,
            )
        )
    return out
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/bin/pytest tests/test_dashboard_usage.py -v`
Expected: PASS — 6 passed.

- [ ] **Step 5: 提交**

```bash
git add backend/app/api/dashboard.py backend/tests/test_dashboard_usage.py
git commit -m "feat(dashboard): add build_daily_usage pivot helper + DailyUsageEntry

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 后端 — 把 `daily_usage` 接入 `GET /api/dashboard`

**Files:**
- Modify: `backend/app/api/dashboard.py`
- Test: `backend/tests/test_dashboard_api.py`

- [ ] **Step 1: 写失败的集成测试**

Create `backend/tests/test_dashboard_api.py`:

```python
"""Integration test for GET /api/dashboard. Skips if Postgres is unreachable."""


def test_dashboard_returns_30_day_daily_usage(client, jwt):
    r = client.get("/api/dashboard", headers={"Authorization": f"Bearer {jwt}"})
    assert r.status_code == 200
    body = r.json()

    assert "daily_usage" in body
    assert len(body["daily_usage"]) == 30

    first = body["daily_usage"][0]
    for key in (
        "date",
        "text_cost",
        "image_cost",
        "video_cost",
        "text_requests",
        "image_requests",
        "video_requests",
    ):
        assert key in first

    dates = [e["date"] for e in body["daily_usage"]]
    assert dates == sorted(dates)          # ascending
    assert len(set(dates)) == 30           # no duplicates / gaps
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/bin/pytest tests/test_dashboard_api.py -v`
Expected: FAIL with `KeyError`/`assert "daily_usage" in body` (字段还不存在)。若本机无 Postgres,则 SKIP — 那就跳到 Step 3,靠 Step 5 的全量测试兜底。

- [ ] **Step 3: 给 `DashboardOut` 加字段**

In `backend/app/api/dashboard.py`, extend the `from sqlalchemy import ...` line to include `Date` and `cast`:

```python
from sqlalchemy import Date, cast, desc, func
```

Add the field to `class DashboardOut` (after `top_api_keys_by_usage`):

```python
    top_api_keys_by_usage: list[TopApiKeyEntry]
    daily_usage: list[DailyUsageEntry]
```

- [ ] **Step 4: 在路由里查询并填充**

In the `dashboard()` route in `backend/app/api/dashboard.py`, after the `top_keys` query block and before `keys_by_id = ...`, add the aggregation:

```python
    # Last 30 UTC days of per-type cost/count, for the usage-trend charts.
    usage_start = today - timedelta(days=29)
    day_col = cast(func.timezone("UTC", RequestLog.created_at), Date).label("d")
    usage_rows = (
        db.query(
            day_col,
            RequestLog.request_type,
            func.coalesce(func.sum(RequestLog.cost), 0).label("cost"),
            func.count(RequestLog.id).label("n"),
        )
        .filter(RequestLog.user_id == user.id, RequestLog.created_at >= usage_start)
        .group_by(day_col, RequestLog.request_type)
        .all()
    )
    daily_usage = build_daily_usage(
        [(r.d, r.request_type, Decimal(str(r.cost)), int(r.n)) for r in usage_rows],
        usage_start.date(),
    )
```

(`today` is already defined at the top of the route as `today = today_utc()`, a tz-aware datetime at 00:00 UTC.)

Then add `daily_usage=daily_usage` to the `return DashboardOut(...)` call, after `top_api_keys_by_usage=[...]`:

```python
        top_api_keys_by_usage=[
            TopApiKeyEntry(
                api_key_id=k_id,
                api_key_prefix=keys_by_id[k_id].key_prefix if k_id in keys_by_id else None,
                requests=int(n),
                cost=Decimal(c),
            )
            for (k_id, n, c) in top_keys
        ],
        daily_usage=daily_usage,
    )
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd backend && .venv/bin/pytest tests/test_dashboard_api.py tests/test_dashboard_usage.py -v`
Expected: PASS(若有 Postgres);无 Postgres 时 `test_dashboard_api.py` SKIP、`test_dashboard_usage.py` PASS。

- [ ] **Step 6: 提交**

```bash
git add backend/app/api/dashboard.py backend/tests/test_dashboard_api.py
git commit -m "feat(dashboard): expose 30-day daily_usage on GET /api/dashboard

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 前端 — `DailyUsage` 类型 + i18n key

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/i18n/dict-en.ts`
- Modify: `frontend/src/lib/i18n/dict-zh.ts`

- [ ] **Step 1: 加 `DailyUsage` 类型**

In `frontend/src/lib/types.ts`, add after the `LogDetail` type (around line 122):

```typescript
/** One UTC day of usage, from GET /api/dashboard `daily_usage`. */
export type DailyUsage = {
  date: string; // "YYYY-MM-DD" (UTC day)
  text_cost: string;
  image_cost: string;
  video_cost: string;
  text_requests: number;
  image_requests: number;
  video_requests: number;
};
```

- [ ] **Step 2: 加 i18n key(英文),删废弃 key**

In `frontend/src/lib/i18n/dict-en.ts`, in the `dashboard:` block: **delete** the line `kpiThisMonthHint: "This month: {amount}",` and **add** these keys before the closing `}` of the `dashboard:` block (after `statValueRequestsCost`):

```typescript
    kpiMonthSpend: "This month",
    usageTrends: "Usage trends",
    chartSpend: "Spend",
    chartRequests: "Requests",
    range7d: "7 days",
    range30d: "30 days",
    legendText: "Text",
    legendImage: "Image",
    legendVideo: "Video",
    chartEmpty: "No data yet",
    tooltipTotal: "Total",
```

- [ ] **Step 3: 加 i18n key(中文),删废弃 key**

In `frontend/src/lib/i18n/dict-zh.ts`, in the `dashboard:` block: **delete** the line `kpiThisMonthHint: "本月累计：{amount}",` and **add** these keys before the closing `}` of the `dashboard:` block (after `statValueRequestsCost`):

```typescript
    kpiMonthSpend: "本月花费",
    usageTrends: "用量趋势",
    chartSpend: "花费",
    chartRequests: "请求数",
    range7d: "7 天",
    range30d: "30 天",
    legendText: "文本",
    legendImage: "图片",
    legendVideo: "视频",
    chartEmpty: "暂无数据",
    tooltipTotal: "合计",
```

- [ ] **Step 4: 类型检查**

Run: `cd frontend && npx tsc -b`
Expected: 通过,无错误。(`dict-zh.ts` 类型为 `EnDict`,若两个文件 key 不一致会报错 — 这一步正是验证两边一致。`dashboard.tsx` 仍引用已删除的 `kpiThisMonthHint`,会在 Task 6 修复;**本步预期 `dashboard.tsx` 出现一个 `kpiThisMonthHint` 相关类型错误,属预期**,其余文件应无错。)

> 说明:Task 3 单独跑 `tsc` 会因 `dashboard.tsx` 的旧引用报 1 个错。这是预期的中间态。如需本任务即干净通过,可与 Task 6 合并验证;否则确认错误**仅**来自 `dashboard.tsx:52` 的 `kpiThisMonthHint` 即可。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/i18n/dict-en.ts frontend/src/lib/i18n/dict-zh.ts
git commit -m "feat(dashboard): add DailyUsage type + usage-trend i18n keys

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 前端 — `BarChart` SVG 原语

**Files:**
- Create: `frontend/src/components/ui/bar-chart.tsx`
- Modify: `DESIGN.md`

- [ ] **Step 1: 创建 `BarChart` 组件**

Create `frontend/src/components/ui/bar-chart.tsx`:

```tsx
import { useState } from "react";

export type BarSeries = { key: string; label: string; colorVar: string };
export type BarDatum = {
  label: string;
  tooltipLabel: string;
  values: Record<string, number>;
};

const VIEW_W = 300;

/**
 * Hand-rolled SVG stacked vertical bar chart. No chart library.
 * Responsive via viewBox + width:100%. HTML hover tooltip positioned by
 * percentage. Renders `emptyText` when there is no data or all values are 0.
 */
export function BarChart({
  data,
  series,
  height = 130,
  formatValue,
  emptyText,
  totalLabel,
}: {
  data: BarDatum[];
  series: BarSeries[];
  height?: number;
  formatValue: (n: number) => string;
  emptyText: string;
  totalLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const totals = data.map((d) =>
    series.reduce((s, ser) => s + (d.values[ser.key] ?? 0), 0),
  );
  const max = Math.max(...totals, 0);

  if (data.length === 0 || max <= 0) {
    return (
      <div
        className="flex items-center justify-center text-xs text-muted-foreground"
        style={{ height }}
      >
        {emptyText}
      </div>
    );
  }

  const n = data.length;
  const slot = VIEW_W / n;
  const barW = slot * 0.82; // 18% gap between bars

  return (
    <div className="relative" style={{ height }}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${VIEW_W} ${height}`}
        preserveAspectRatio="none"
        className="block"
      >
        {data.map((d, i) => {
          const x = i * slot + (slot - barW) / 2;
          let yCursor = height;
          return (
            <g key={i}>
              {series.map((ser) => {
                const v = d.values[ser.key] ?? 0;
                if (v <= 0) return null;
                const h = (v / max) * height;
                yCursor -= h;
                return (
                  <rect
                    key={ser.key}
                    x={x}
                    y={yCursor}
                    width={barW}
                    height={h}
                    fill={`var(${ser.colorVar})`}
                  />
                );
              })}
              <rect
                x={i * slot}
                y={0}
                width={slot}
                height={height}
                fill="transparent"
                pointerEvents="all"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-border-strong bg-surface-3 px-2 py-1.5 text-xs shadow-lg"
          style={{ left: `${((hover + 0.5) / n) * 100}%` }}
        >
          <div className="mb-1 text-muted-foreground">{data[hover].tooltipLabel}</div>
          {series.map((ser) => (
            <div key={ser.key} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ backgroundColor: `var(${ser.colorVar})` }}
              />
              <span className="text-muted-foreground">{ser.label}</span>
              <span className="mono ml-auto pl-3 text-foreground">
                {formatValue(data[hover].values[ser.key] ?? 0)}
              </span>
            </div>
          ))}
          <div className="mt-1 flex justify-between gap-3 border-t border-border pt-1">
            <span className="text-muted-foreground">{totalLabel}</span>
            <span className="mono text-foreground">{formatValue(totals[hover])}</span>
          </div>
        </div>
      )}
    </div>
  );
}
```

> 说明:spec 5.1 提到「柱顶 2–3px 圆角」。SVG 堆叠 `<rect>` 只圆顶角实现复杂、收益小,本计划用平角柱(Helicone 实际也近似平角)。如后续想要圆角,是独立小改动。

- [ ] **Step 2: 在 `DESIGN.md` 记录原语**

In `DESIGN.md` (仓库根目录), find the primitives table (header `| Component | File | Use for |` around line 395). After the last primitive row (the `` `Label` + `FormField` `` row), add:

```markdown
| `BarChart` | `ui/bar-chart.tsx` | Stacked vertical bar chart, hand-rolled SVG (no chart lib). `<BarChart data series formatValue emptyText totalLabel height? />`. Responsive via viewBox; HTML hover tooltip; renders `emptyText` when all values are 0. |
```

- [ ] **Step 3: 类型检查**

Run: `cd frontend && npx tsc -b`
Expected: `bar-chart.tsx` 无错误。(`dashboard.tsx` 的 `kpiThisMonthHint` 旧错误仍在,Task 6 修复 — 确认无**新增**错误即可。)

- [ ] **Step 4: 提交**

```bash
git add frontend/src/components/ui/bar-chart.tsx DESIGN.md
git commit -m "feat(ui): add hand-rolled SVG BarChart primitive

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: 前端 — `UsageTrends` 区块组件

**Files:**
- Create: `frontend/src/components/usage-trends.tsx`

- [ ] **Step 1: 创建 `UsageTrends` 组件**

Create `frontend/src/components/usage-trends.tsx`:

```tsx
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
      <div className="mt-1.5 flex justify-between border-t border-border pt-1.5 text-[10px] text-faint">
        <span>{firstDay}</span>
        <span>{lastDay}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

Run: `cd frontend && npx tsc -b`
Expected: `usage-trends.tsx`、`bar-chart.tsx` 无错误。(`dashboard.tsx` 旧 `kpiThisMonthHint` 错误仍在,Task 6 修复。)

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/usage-trends.tsx
git commit -m "feat(dashboard): add UsageTrends block (spend + requests charts)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: 前端 — `dashboard.tsx` 集成 + `KpiStrip` 支持 5 列

**Files:**
- Modify: `frontend/src/components/kpi-strip.tsx`
- Modify: `frontend/src/pages/dashboard.tsx`
- Modify: `DESIGN.md`

- [ ] **Step 1: `KpiStrip` 支持 5 列**

In `frontend/src/components/kpi-strip.tsx`, change the `cols` prop type and the `gridClass` line.

Change the prop type:

```typescript
  cols?: 3 | 4 | 5;
```

Change the `gridClass` assignment:

```typescript
  const gridClass =
    cols === 5
      ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-5"
      : cols === 3
        ? "grid-cols-3"
        : "grid-cols-2 md:grid-cols-4";
```

- [ ] **Step 2: `dashboard.tsx` — 改 import 与类型**

In `frontend/src/pages/dashboard.tsx`:

Change the types import (line 11) to add `DailyUsage`:

```typescript
import type { LogSummary, DailyUsage } from "@/lib/types";
```

Add a new import for `UsageTrends` (after the `PageHeader` import line):

```typescript
import { UsageTrends } from "@/components/usage-trends";
```

Add `daily_usage` to the `DashboardOut` type (after `top_api_keys_by_usage`):

```typescript
  top_api_keys_by_usage: Array<{ api_key_id: number | null; api_key_prefix: string | null; requests: number; cost: string }>;
  daily_usage: DailyUsage[];
};
```

- [ ] **Step 3: `dashboard.tsx` — 改 KPI 条为 5 格**

Replace the entire `<KpiStrip ... />` element (currently lines ~42-70) with:

```tsx
      <KpiStrip
        cols={5}
        items={[
          {
            label: t("dashboard.kpiBalance"),
            value: fmtBalance(data?.balance),
            hint: <Link to="/billing" className="text-primary hover:underline">{t("dashboard.kpiBillingLink")}</Link>,
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
            hint: <span className="text-primary hover:underline">{t("dashboard.kpiViewFailed")}</span>,
            onClick: () => nav("/logs?status=failed"),
            title: t("dashboard.kpiViewFailedTitle"),
          },
        ]}
      />
```

(This removes the now-deleted `kpiThisMonthHint` reference and adds the `本月花费` cell.)

- [ ] **Step 4: `dashboard.tsx` — 插入 `UsageTrends`**

Immediately after the `<KpiStrip ... />` element and before `<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">`, add:

```tsx
      <UsageTrends data={data?.daily_usage} />
```

- [ ] **Step 5: `dashboard.tsx` — Top 模型改横向条形图**

Replace the Top-models `<StatRows ... />` block (the `<section>` containing `t("dashboard.topModels")`) — change only the `<StatRows>` inside it to `<TopModelBars>`:

```tsx
          <section>
            <SectionHeading>{t("dashboard.topModels")}</SectionHeading>
            <TopModelBars
              empty={t("dashboard.noDataYet")}
              items={data?.top_models_by_cost ?? []}
              onClick={(name) => nav(`/logs?model=${encodeURIComponent(name)}`)}
            />
          </section>
```

(Leave the `Top API keys` `<StatRows>` block unchanged.)

Then add the `TopModelBars` component definition at the end of the file, after the existing `StatRows` function:

```tsx
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
            className="group cursor-pointer px-2"
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
```

- [ ] **Step 6: 在 `DESIGN.md` 记录 `UsageTrends`**

In `DESIGN.md`, find the "Composite / shared" table (header `| Component | File | Use for |` around line 416). After the last row (the `LogDetailDrawer` row), add:

```markdown
| `UsageTrends` | `components/usage-trends.tsx` | Dashboard "usage trends" block — two Helicone-style cards (spend / requests) wrapping a stacked `BarChart`, with a 7/30-day toggle. |
```

- [ ] **Step 7: 类型检查 + 构建**

Run: `cd frontend && npm run build`
Expected: PASS — `tsc -b` 无类型错误,Vite 构建成功。(此时 `kpiThisMonthHint` 已无任何引用。)

- [ ] **Step 8: 提交**

```bash
git add frontend/src/pages/dashboard.tsx frontend/src/components/kpi-strip.tsx DESIGN.md
git commit -m "feat(dashboard): integrate UsageTrends, month-spend KPI, top-model bars

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: 全量验证

**Files:** 无(仅运行验证)

- [ ] **Step 1: 后端全量测试**

Run: `cd backend && .venv/bin/pytest -q`
Expected: 全部 PASS 或 SKIP(无 Postgres/Redis 的集成测试 SKIP)。无 FAIL。重点确认 `test_dashboard_usage.py`、`test_dashboard_api.py` 不是 FAIL。

- [ ] **Step 2: 后端 lint**

Run: `ruff check backend/app/api/dashboard.py backend/tests/test_dashboard_usage.py backend/tests/test_dashboard_api.py`
Expected: 无报错(`All checks passed!`)。有问题则修复后重跑。

- [ ] **Step 3: 前端构建**

Run: `cd frontend && npm run build`
Expected: PASS — `tsc -b` 无类型错误,Vite 构建产物生成。

- [ ] **Step 4: 人工核对(开发服务器)**

启动后端 `cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000` 与前端 `cd frontend && npm run dev`,登录后打开 `/dashboard`,确认:
- KPI 条为 5 格:余额 / 今日花费 / 本月花费 / 今日文本请求 / 近期失败。
- KPI 条与下方列表之间出现「用量趋势」区块:两张卡(花费 / 请求数),7天/30天 切换可用,切换即时无网络请求。
- 鼠标悬停柱子出 tooltip(日期 + 各类型值 + 合计)。
- 新账号(无请求记录)时两张图显示「暂无数据」,不报错。
- 「Top 模型」显示为横向条形图,点击跳转 `/logs?model=...`;「Top API Key」仍为文字列表。

- [ ] **Step 5: 无需提交**(本任务仅验证;若 Step 2 修了 lint 则单独提交那次修复)。

---

## 自检清单(规划者已核对)

- **Spec 覆盖**:① `daily_usage` 字段 + 聚合 → Task 1/2;② `build_daily_usage` 纯函数 + 单测 → Task 1;③ UTC 日界 `cast(timezone('UTC',…), Date)` → Task 2 Step 4;④ `BarChart` 原语 → Task 4;⑤ `UsageTrends` 区块 + 7/30 切换 → Task 5;⑥ 本月花费 KPI 格 → Task 6 Step 3;⑦ Top 模型横向条形图 → Task 6 Step 5;⑧ `DailyUsage` 类型 → Task 3;⑨ i18n key → Task 3;⑩ DESIGN.md 记录 → Task 4 + Task 6;⑪ 测试 → Task 1/2/7。
- **类型一致性**:`build_daily_usage` / `DailyUsageEntry`(后端)与 `DailyUsage`(前端 `types.ts`)字段名一一对应;`BarSeries` / `BarDatum` 在 Task 4 定义、Task 5 引用一致;`DashboardOut.top_models_by_cost` 在 `TopModelBars` 中以 `DashboardOut["top_models_by_cost"]` 引用。
- **已知偏差**:spec 5.1 的「柱顶圆角」改为平角柱(见 Task 4 说明);spec 5.4 写的 `frontend/DESIGN.md` 实为仓库根 `DESIGN.md`(本计划已用正确路径)。
