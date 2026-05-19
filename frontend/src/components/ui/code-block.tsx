import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { cn, copyToClipboard } from "@/lib/utils";

interface CodeBlockProps {
  code: string;
  lang?: string;
  className?: string;
  copyable?: boolean;
  maxHeight?: string;
}

export function CodeBlock({
  code,
  lang,
  className,
  copyable = true,
  maxHeight = "32rem",
}: CodeBlockProps) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    if (await copyToClipboard(code)) {
      setCopied(true);
      toast.success(t("common.toastCopied"));
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error(t("common.toastCopyFailed"));
    }
  };
  return (
    <div className={cn("relative rounded-md border border-border bg-surface-2", className)}>
      {(lang || copyable) && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mono">
            {lang || ""}
          </span>
          {copyable && (
            <button
              onClick={onCopy}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Copy"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      )}
      <pre
        className="text-xs mono p-3 overflow-auto whitespace-pre"
        style={{ maxHeight }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
