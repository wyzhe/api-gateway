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
    <div className={cn("border-b border-border mb-6", className)}>
      {/* -mx-5 cancels each cell's px-5 at the strip edges: edge cells stay
          flush with the page gutter while interior dividers keep even
          padding on both sides. */}
      <div className={cn("grid -mx-5", gridClass)}>
        {items.map((it, i) => {
          const isLast = i === items.length - 1;
          const cellClass = cn(
            "py-5 px-5 flex flex-col gap-1 text-left",
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
    </div>
  );
}
