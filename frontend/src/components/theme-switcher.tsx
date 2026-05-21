import { Fragment } from "react";
import { useT, type TKey } from "@/lib/i18n";
import type { ThemePreference } from "@/lib/theme";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: ReadonlyArray<readonly [ThemePreference, TKey]> = [
  ["system", "theme.system"],
  ["light", "theme.light"],
  ["dark", "theme.dark"],
];

export function ThemeSwitcher({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  const t = useT();
  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-[11px]",
        className,
      )}
      role="group"
      aria-label={t("nav.theme")}
    >
      {OPTIONS.map(([value, key], i) => (
        <Fragment key={value}>
          {i > 0 && (
            <span className="text-faint" aria-hidden>
              ·
            </span>
          )}
          <button
            type="button"
            onClick={() => setPreference(value)}
            aria-pressed={preference === value}
            className={cn(
              "whitespace-nowrap transition-colors px-0.5 rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              preference === value
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(key)}
          </button>
        </Fragment>
      ))}
    </div>
  );
}
