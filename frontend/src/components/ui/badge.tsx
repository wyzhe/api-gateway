import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-border bg-surface-2 text-muted-foreground",
        success: "border-success/40 bg-success/10 text-success",
        warn: "border-warn/40 bg-warn/10 text-warn",
        danger: "border-destructive/40 bg-destructive/10 text-destructive",
        info: "border-info/40 bg-info/10 text-info",
        accent: "border-accent/40 bg-accent/10 text-accent",
        outline: "border-border bg-transparent text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
