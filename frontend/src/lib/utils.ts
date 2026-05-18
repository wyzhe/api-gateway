import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtCompactMoney(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString();
}

export type PricedModel = {
  pricing_mode: string;
  input_price?: string | null;
  output_price?: string | null;
  cache_write_price?: string | null;
  cache_read_price?: string | null;
  image_price?: string | null;
  video_second_price?: string | null;
  generation_price?: string | null;
};

export function priceLabel(m: PricedModel): string {
  switch (m.pricing_mode) {
    case "per_token": {
      const base = `$${m.input_price ?? "0"} in · $${m.output_price ?? "0"} out / 1M`;
      if (m.cache_write_price || m.cache_read_price) {
        const cw = m.cache_write_price ?? m.input_price ?? "0";
        const cr = m.cache_read_price ?? m.input_price ?? "0";
        return `${base} (cache: $${cw} w · $${cr} r)`;
      }
      return `${base} tokens`;
    }
    case "per_image":
      return `$${m.image_price ?? m.generation_price ?? "0"} / image`;
    case "per_second":
      return `$${m.video_second_price ?? "0"} / second`;
    case "per_generation":
      return `$${m.generation_price ?? "0"} / generation`;
    default:
      return "—";
  }
}

export function statusBadgeVariant(
  status: string | null | undefined,
): "success" | "danger" | "info" | "warn" | "default" {
  if (status === "success" || status === "succeeded" || status === "active") return "success";
  if (status === "failed" || status === "disabled") return "danger";
  if (status === "running" || status === "queued") return "info";
  return "default";
}

export function limitBarColor(pct: number): string {
  if (pct >= 100) return "var(--danger)";
  if (pct >= 80) return "var(--warn)";
  return "var(--accent)";
}

/** Parse a user-entered limit. Empty = "no cap" (null). Returns ok=false on garbage. */
export function parseLimit(raw: string): { ok: true; value: number | null } | { ok: false } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return { ok: false };
  return { ok: true, value: n };
}

export function fmtRelative(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
