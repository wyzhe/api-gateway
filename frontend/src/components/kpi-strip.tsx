import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

export type KpiStripItem = {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  onClick?: () => void;
  title?: string;
};

export function KpiStrip({
  items,
  cols = 4,
  className,
}: {
  items: KpiStripItem[];
  cols?: 3 | 4 | 5;
  className?: string;
}) {
  const gridClass =
    cols === 5
      ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-5"
      : cols === 3
        ? "grid-cols-3"
        : "grid-cols-2 md:grid-cols-4";
  return (
    <div className={cn("grid border-b border-border mb-6", gridClass, className)}>
      {items.map((it, i) => {
        const isLast = i === items.length - 1;
        const cellClass = cn(
          "py-4 pr-5 flex flex-col gap-1 text-left",
          isLast && "pr-0",
          !isLast && "md:border-r md:border-border",
        );
        const body = (
          <>
            <div className="text-xs text-muted-foreground">{it.label}</div>
            <div className="kpi-strip-value mono">{it.value}</div>
            {it.hint && <div className="text-xs text-muted-foreground">{it.hint}</div>}
          </>
        );
        if (it.onClick) {
          return (
            <Tooltip key={i} content={it.title}>
              <button
                type="button"
                onClick={it.onClick}
                className={cn(
                  cellClass,
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background rounded-sm",
                )}
              >
                {body}
              </button>
            </Tooltip>
          );
        }
        return (
          <div key={i} className={cellClass}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
