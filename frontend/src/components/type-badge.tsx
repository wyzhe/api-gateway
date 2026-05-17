import { Image, Type, Video, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

export function TypeBadge({
  type,
  className,
}: {
  type: string | null | undefined;
  className?: string;
}) {
  const t = (type || "text").toLowerCase();
  const map: Record<string, { label: string; cls: string; Icon: any }> = {
    text: { label: "TXT", cls: "border-info/40 bg-info/10 text-info", Icon: Type },
    image: { label: "IMG", cls: "border-warn/40 bg-warn/10 text-warn", Icon: Image },
    video: { label: "VID", cls: "border-accent/40 bg-accent/10 text-accent", Icon: Video },
    multimodal: {
      label: "MUL",
      cls: "border-veo/40 bg-veo/10 text-veo",
      Icon: Layers,
    },
  };
  const m = map[t] || map.text;
  const I = m.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-medium",
        m.cls,
        className,
      )}
    >
      <I className="h-3 w-3" />
      {m.label}
    </span>
  );
}
