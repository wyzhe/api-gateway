import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

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
      <button
        type="button"
        onClick={() => setLang("en")}
        className={cn(
          "px-2 py-0.5 rounded-sm transition-colors",
          lang === "en"
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={lang === "en"}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang("zh")}
        className={cn(
          "px-2 py-0.5 rounded-sm transition-colors",
          lang === "zh"
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={lang === "zh"}
      >
        中文
      </button>
    </div>
  );
}
