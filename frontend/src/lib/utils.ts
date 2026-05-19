import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { TKey } from "@/lib/i18n";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** API key shape — kept in sync with backend `API_KEY_PREFIX` (security.py). */
export const API_KEY_RE = /^sk-[A-Za-z0-9_-]+$/;

/** Copy text to the clipboard. Returns true on success. Caller renders toasts. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function toFiniteNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isNaN(n) ? null : n;
}

export function fmtCompactMoney(value: number | string | null | undefined): string {
  const n = toFiniteNumber(value);
  if (n === null) return "—";
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

/**
 * Format a balance value losslessly: keeps up to 6 decimals, never rounds
 * sub-cent precision away. Use for actual account balances and ledger
 * "balance after" fields where a debit must remain visible.
 */
export function fmtBalance(value: number | string | null | undefined): string {
  const n = toFiniteNumber(value);
  if (n === null) return "—";
  if (n === 0) return "$0";
  const sign = n < 0 ? "-" : "";
  const fixed = Math.abs(n).toFixed(6);
  // Trim trailing zeros but keep at least 2 decimals (so $5 always renders as $5.00).
  let end = fixed.length - 1;
  const dot = fixed.indexOf(".");
  const minEnd = dot + 2;
  while (end > minEnd && fixed[end] === "0") end--;
  return `${sign}$${fixed.slice(0, end + 1)}`;
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

/** Translation key for a model's pricing_mode badge. */
export function pricingModeKey(mode: string): TKey {
  const known = ["per_token", "per_image", "per_second", "per_generation"];
  return (
    known.includes(mode) ? `common.pricingMode.${mode}` : `common.pricingMode.per_token`
  ) as TKey;
}

/**
 * Translation key for a backend request/task status badge label.
 * Falls back to "failed" if the value isn't one of the known enum members
 * (keeps the badge readable even if upstream adds a new status).
 */
export function reqStatusKey(status: string | null | undefined): TKey {
  const known = [
    "success",
    "failed",
    "queued",
    "running",
    "succeeded",
    "pending",
    "cancelled",
    "submitting",
  ];
  return (
    known.includes(status ?? "")
      ? `common.reqStatus.${status}`
      : `common.reqStatus.failed`
  ) as TKey;
}

/** Translation key for a transaction type label. */
export function txnTypeKey(type: string): TKey {
  const known = ["recharge", "debit", "adjustment", "refund"];
  return (
    known.includes(type) ? `common.txnType.${type}` : `common.txnType.adjustment`
  ) as TKey;
}

/** Badge variant for a transaction type. */
export function txnBadgeVariant(type: string): "success" | "warn" | "default" {
  if (type === "recharge") return "success";
  if (type === "debit") return "warn";
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

type Translator = (key: TKey, vars?: Record<string, string | number>) => string;

export function fmtRelative(value: string | Date | null | undefined, t?: Translator): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (!t) {
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }
  if (diff < 60) return t("common.relativeTime.secAgo", { n: Math.floor(diff) });
  if (diff < 3600) return t("common.relativeTime.minAgo", { n: Math.floor(diff / 60) });
  if (diff < 86400) return t("common.relativeTime.hourAgo", { n: Math.floor(diff / 3600) });
  return t("common.relativeTime.dayAgo", { n: Math.floor(diff / 86400) });
}
