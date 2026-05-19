import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-6 w-6 rounded-md flex items-center justify-center bg-accent",
        className,
      )}
    >
      <span className="text-xs font-bold text-accent-foreground">R</span>
    </div>
  );
}
