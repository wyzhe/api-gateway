import { cn } from "@/lib/utils";

const STATUS_COLOR: Record<string, string> = {
  success: "bg-success",
  failed: "bg-destructive",
  queued: "bg-info",
  running: "bg-warn",
  pending: "bg-info",
  cancelled: "bg-dim",
};

const STATUS_FALLBACK = "bg-muted-foreground";

export function DotStatus({
  status,
  label,
  className,
}: {
  /** The raw status key from request/task; lowercase form. */
  status: string | null | undefined;
  /** The localized label (already translated by caller). */
  label: string;
  className?: string;
}) {
  const key = (status || "").toLowerCase();
  const color = STATUS_COLOR[key] || STATUS_FALLBACK;
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
