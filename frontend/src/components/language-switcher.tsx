import type { Lang } from "@/lib/i18n";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const OPTIONS: ReadonlyArray<readonly [Lang, string]> = [
  ["en", "EN"],
  ["zh", "中文"],
];

export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <div
      className={cn(
        "inline-flex h-7 shrink-0 items-center rounded-md border border-border bg-surface-2 p-0.5",
        className,
      )}
      role="group"
      aria-label="Language"
    >
      {OPTIONS.map(([code, label]) => {
        const active = lang === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLang(code)}
            aria-pressed={active}
            className={cn(
              "inline-flex h-6 items-center justify-center whitespace-nowrap rounded-sm px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              active
                ? "bg-surface text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
