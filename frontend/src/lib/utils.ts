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
  image_price?: string | null;
  video_second_price?: string | null;
  generation_price?: string | null;
};

export function priceLabel(m: PricedModel): string {
  switch (m.pricing_mode) {
    case "per_token":
      return `$${m.input_price ?? "0"} in · $${m.output_price ?? "0"} out / 1M tokens`;
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

export function fmtRelative(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
