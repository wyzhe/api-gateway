import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { useT, type TKey } from "@/lib/i18n";
import type { ThemePreference } from "@/lib/theme";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: ReadonlyArray<readonly [ThemePreference, TKey, LucideIcon]> = [
  ["system", "theme.system", Monitor],
  ["light", "theme.light", Sun],
  ["dark", "theme.dark", Moon],
];

export function ThemeSwitcher({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  const t = useT();
  return (
    <div
      className={cn(
        "inline-flex h-7 shrink-0 items-center rounded-md border border-border bg-surface-2 p-0.5",
        className,
      )}
      role="group"
      aria-label={t("nav.theme")}
    >
      {OPTIONS.map(([value, labelKey, Icon]) => {
        const active = preference === value;
        return (
          <Tooltip key={value} content={t(labelKey)}>
            <button
              type="button"
              onClick={() => setPreference(value)}
              aria-pressed={active}
              aria-label={t(labelKey)}
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                active
                  ? "bg-surface text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
