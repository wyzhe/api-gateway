import type { ReactNode } from "react";
import { CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function SectionHeading({
  children,
  actions,
  className,
}: {
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-2 flex items-center justify-between", className)}>
      <CardTitle>{children}</CardTitle>
      {actions}
    </div>
  );
}
