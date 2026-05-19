import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function KpiTile({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-md border border-border bg-card p-3 flex flex-col gap-1", className)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mono leading-tight">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
