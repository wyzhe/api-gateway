import { cn } from "@/lib/utils";

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  xai: "xAI · Grok",
  veo: "Google Veo",
  apimart: "APIMart",
  deepseek: "DeepSeek",
};

const PROVIDER_COLOR_VAR: Record<string, string> = {
  openai: "var(--openai)",
  anthropic: "var(--anthropic)",
  gemini: "var(--gemini)",
  xai: "var(--xai)",
  veo: "var(--veo)",
  apimart: "var(--apimart)",
  deepseek: "var(--deepseek)",
};

export function ProviderTag({
  provider,
  className,
}: {
  provider: string | null | undefined;
  className?: string;
}) {
  const key = (provider || "apimart").toLowerCase();
  const label = PROVIDER_LABELS[key] || provider || "—";
  const color = PROVIDER_COLOR_VAR[key] || PROVIDER_COLOR_VAR.apimart;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
