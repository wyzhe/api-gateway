import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  hint,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "py-10 px-4 flex flex-col items-center gap-1.5 text-center",
        className,
      )}
    >
      {icon && (
        <div className="h-6 w-6 mb-1 text-faint flex items-center justify-center">
          {icon}
        </div>
      )}
      <div className="text-sm text-muted-foreground">{title}</div>
      {hint && <div className="text-xs text-faint">{hint}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
