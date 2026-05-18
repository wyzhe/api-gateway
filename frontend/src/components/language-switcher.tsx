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
        "inline-flex items-center rounded-md border border-border bg-surface-2 p-0.5 text-[11px]",
        className,
      )}
      role="group"
      aria-label="Language"
    >
      {OPTIONS.map(([code, label]) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
          className={cn(
            "px-2 py-0.5 rounded-sm transition-colors",
            lang === code
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
