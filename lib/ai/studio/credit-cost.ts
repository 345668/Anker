import { modelFor } from "./catalog"

/** The pure part of credits (docs/architecture/52): no database, so the browser can price a request before it is sent. */
export interface Rate {
  unit: "job" | "second"
  credits: number
}
/** Self-hosted recipes are charged a flat amount: our own GPU time is not in the table. */
export const RECIPE_CREDITS = 20
/** What the code falls back to when the rates table is missing or empty. The migration seeds the same numbers. */
export const DEFAULT_RATES: Record<string, Rate> = {
  "qwen-image-2.0|*": { unit: "job", credits: 30 },
  "qwen-image-plus|*": { unit: "job", credits: 30 },
  "wan2.6-t2i|*": { unit: "job", credits: 30 },
  "qwen-image-2.0-pro|*": { unit: "job", credits: 60 },
  "qwen-image-max|*": { unit: "job", credits: 80 },
  "wan2.7-image-pro|*": { unit: "job", credits: 80 },
  "z-image-turbo|*": { unit: "job", credits: 10 },
  "qwen-image-edit-plus-2025-12-15|*": { unit: "job", credits: 40 },
  "qwen-image-edit-max|*": { unit: "job", credits: 80 },
  "wan2.7|720p": { unit: "second", credits: 50 },
  "wan2.7|1080p": { unit: "second", credits: 100 },
  "happyhorse-1.1|720p": { unit: "second", credits: 60 },
  "happyhorse-1.1|1080p": { unit: "second", credits: 120 },
}
export class NoRateError extends Error {
  constructor(model: string) {
    super(`No credit rate for ${model}`)
    this.name = "NoRateError"
  }
}
/** What one request costs. A model with no rate throws: it is never charged zero. */
export function costOf(
  input: { model: string; resolution: string; duration?: number },
  rates: Record<string, Rate>,
): number {
  if (modelFor(input.model)?.recipe) return RECIPE_CREDITS
  const rate = rates[`${input.model}|${input.resolution}`] ?? rates[`${input.model}|*`]
  if (!rate) throw new NoRateError(input.model)
  const n = rate.unit === "second" ? rate.credits * Math.max(1, input.duration ?? 1) : rate.credits
  return Math.max(1, Math.round(n))
}
