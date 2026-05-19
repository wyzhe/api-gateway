import type { EnDict } from "./dict-en";

export type Lang = "en" | "zh";

// 递归收集所有点号路径，例如 "common.save" | "nav.dashboard"
export type PathOf<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? P extends ""
      ? K
      : `${P}.${K}`
    : PathOf<T[K], P extends "" ? K : `${P}.${K}`>;
}[keyof T & string];

export type TKey = PathOf<EnDict>;
