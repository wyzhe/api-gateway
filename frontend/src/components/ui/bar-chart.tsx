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
