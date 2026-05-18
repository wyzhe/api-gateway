import { useEffect } from "react";
import type { Model } from "./types";

/** Pick a sensible default model when the list arrives. Prefers `gpt-4o` if
 * present so the Chat tab doesn't land on an upstream that's currently flaky. */
export function useDefaultModel(
  models: Model[],
  value: string,
  setValue: (v: string) => void,
  preferred?: string,
) {
  useEffect(() => {
    if (value || !models.length) return;
    const pref = preferred ? models.find((m) => m.public_name === preferred) : undefined;
    setValue((pref ?? models[0]).public_name);
  }, [models, value, setValue, preferred]);
}
