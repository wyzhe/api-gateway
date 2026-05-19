import { Fragment } from "react";
import type { Lang } from "@/lib/i18n";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const OPTIONS: ReadonlyArray<readonly [Lang, string, string]> = [
  ["en", "EN", "EN"],
  ["zh", "中文", "中"],
];

export function LanguageSwitcher({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { lang, setLang } = useLang();
  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-[11px]",
        className,
      )}
      role="group"
      aria-label="Language"
    >
      {OPTIONS.map(([code, label, shortLabel], i) => (
        <Fragment key={code}>
          {i > 0 && <span className="text-faint" aria-hidden>·</span>}
          <button
            type="button"
            onClick={() => setLang(code)}
            aria-pressed={lang === code}
            className={cn(
              "whitespace-nowrap transition-colors px-0.5 rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              lang === code
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {compact ? shortLabel : label}
          </button>
        </Fragment>
      ))}
    </div>
  );
}
