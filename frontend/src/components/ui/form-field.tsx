import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Form input row: label on top, control below. */
export function FormField({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/** Read-only label + value pair (used in detail drawers). */
export function LabeledValue({
  label,
  value,
  mono,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={mono ? "mono" : ""}>{value}</span>
    </div>
  );
}
