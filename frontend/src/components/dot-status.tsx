import type { LogLifecycleStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_COLOR: Record<LogLifecycleStatus, string> = {
  success: "bg-success",
  succeeded: "bg-success",
  failed: "bg-destructive",
  queued: "bg-info",
  running: "bg-warn",
  pending: "bg-info",
  cancelled: "bg-dim",
  submitting: "bg-info",
};

const STATUS_FALLBACK = "bg-muted-foreground";

export function DotStatus({
  status,
  label,
  className,
}: {
  status: LogLifecycleStatus | null | undefined;
  /** The localized label — DotStatus does not call `t()`; the caller does. */
  label: string;
  className?: string;
}) {
  const color = (status && STATUS_COLOR[status]) || STATUS_FALLBACK;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-foreground whitespace-nowrap",
        className,
      )}
    >
      <span className={cn("inline-block h-1.5 w-1.5 rounded-full", color)} />
      {label}
    </span>
  );
}
