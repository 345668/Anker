import "server-only"
import { sql } from "@/lib/db"
import { catalogRates } from "./model-catalog"

/**
 * What a call cost, and how sure we are (docs/architecture/58).
 *   exact      tokens from the provider, a known list price
 *   estimated  no usage from the provider: tokens guessed from text length (about 4 characters each), a known price
 *   unpriced   the model has no price anywhere: a visible fault, counted by an alert, never read as free
 *   none       nothing was consumed or nothing was asked (a failed call with no usage, a disabled task)
 * Prices are list prices, whichever lane served the call, so a plan allowance means the same thing on the free lane and the paid one.
 */
export type CostState = "exact" | "estimated" | "unpriced" | "none"
export interface PriceInput { model?: string | null; provider?: string | null; ok: boolean; promptTokens?: number | null; outputTokens?: number | null; promptChars?: number | null; outputChars?: number | null }

const PSEUDO = new Set(["disabled", "rejected", "none"])
let cache: { at: number; map: Map<string, { in: number; out: number }> } | null = null
const TTL_MS = 60_000

/** Loads the editable price table (cached for a minute). Never throws: without it the catalogue's prices still apply. */
export async function warmPrices(force = false): Promise<void> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return
  try {
    const rows = (await sql`SELECT model, price_in, price_out FROM model_prices`) as any[]
    cache = { at: Date.now(), map: new Map(rows.map((r) => [String(r.model), { in: Number(r.price_in), out: Number(r.price_out) }])) }
  } catch { cache = { at: Date.now(), map: cache?.map ?? new Map() } }
}
export const resetPriceCache = () => { cache = null }

/** The price per million tokens for a model: the table first (SAIL's override), then the catalogue. */
export function ratesFor(model: string | null | undefined): { in: number; out: number } | null {
  if (!model) return null
  const t = cache?.map.get(model)
  if (t) return t
  const c = catalogRates(model)
  return c ? { in: c.in ?? 0, out: c.out ?? 0 } : null
}

const CHARS_PER_TOKEN = 4
export function priceCall(i: PriceInput): { costUsd: number | null; state: CostState } {
  if (i.provider && PSEUDO.has(i.provider)) return { costUsd: null, state: "none" }
  const hasTokens = i.promptTokens != null || i.outputTokens != null
  if (!hasTokens && !i.ok) return { costUsd: null, state: "none" }
  const rates = ratesFor(i.model)
  if (!rates) return { costUsd: null, state: "unpriced" }
  let pt = i.promptTokens ?? 0, ot = i.outputTokens ?? 0, state: CostState = "exact"
  if (!hasTokens) {
    if (i.promptChars == null && i.outputChars == null) return { costUsd: null, state: "unpriced" }
    pt = Math.ceil((i.promptChars ?? 0) / CHARS_PER_TOKEN); ot = Math.ceil((i.outputChars ?? 0) / CHARS_PER_TOKEN); state = "estimated"
  }
  return { costUsd: (pt * rates.in + ot * rates.out) / 1_000_000, state }
}

/** Who pays for a call: the workspace, or the named platform job. Never blank. */
export const costCenterOf = (workspaceId: string | null | undefined, task: string | null | undefined) =>
  workspaceId ? `workspace:${workspaceId}` : task ? `platform:${task}` : "unknown"
