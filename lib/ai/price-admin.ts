import "server-only"
import { sql } from "@/lib/db"
import { catalogRates } from "./model-catalog"
import { resetPriceCache } from "./pricing"
import { resetUnitPriceCache, UNITS } from "@/lib/metering"

export interface PriceRow { model: string; calls30d: number; unpriced30d: number; source: "table" | "catalog" | "none"; priceIn: number | null; priceOut: number | null; verified: boolean; note: string | null }

/** Every model that was called in the last 30 days or has a table price, with where its price comes from. */
export async function listPrices(): Promise<PriceRow[]> {
  const used = (await sql`SELECT model, count(*)::int AS n, count(*) FILTER (WHERE cost_state = 'unpriced')::int AS unpriced FROM ai_calls WHERE model IS NOT NULL AND created_at > now() - interval '30 days' GROUP BY model`) as any[]
  const table = (await sql`SELECT model, price_in, price_out, verified, note FROM model_prices`) as any[]
  const byModel = new Map<string, PriceRow>()
  for (const u of used) byModel.set(String(u.model), { model: String(u.model), calls30d: Number(u.n), unpriced30d: Number(u.unpriced), source: "none", priceIn: null, priceOut: null, verified: false, note: null })
  for (const t of table) { const r = byModel.get(String(t.model)) ?? { model: String(t.model), calls30d: 0, unpriced30d: 0, source: "table" as const, priceIn: null, priceOut: null, verified: false, note: null }; Object.assign(r, { source: "table", priceIn: Number(t.price_in), priceOut: Number(t.price_out), verified: !!t.verified, note: t.note ?? null }); byModel.set(r.model, r) }
  for (const r of byModel.values()) if (r.source === "none") { const c = catalogRates(r.model); if (c) Object.assign(r, { source: "catalog", priceIn: c.in, priceOut: c.out, verified: false, note: "from the built-in catalogue (high end of its range)" }) }
  return [...byModel.values()].sort((a, b) => (a.source === "none" ? 0 : 1) - (b.source === "none" ? 0 : 1) || b.calls30d - a.calls30d)
}

export class PriceError extends Error {}
/** Saves a list price (USD per million tokens). Every number is checked; the cache is dropped so the change counts at once. */
export async function savePrice(input: { model: unknown; priceIn: unknown; priceOut: unknown; verified?: unknown; note?: unknown }, by: string): Promise<void> {
  const model = String(input.model ?? "").trim()
  if (!/^[\w.\-:/]{1,128}$/.test(model)) throw new PriceError("Enter a model id such as qwen-flash.")
  const pi = Number(input.priceIn), po = Number(input.priceOut)
  if (!Number.isFinite(pi) || !Number.isFinite(po) || pi < 0 || po < 0 || pi > 1000 || po > 1000) throw new PriceError("Prices are US dollars per million tokens, between 0 and 1000.")
  await sql`INSERT INTO model_prices (model, price_in, price_out, verified, note, updated_by, updated_at) VALUES (${model}, ${pi}, ${po}, ${input.verified === true}, ${input.note ? String(input.note).slice(0, 300) : null}, ${by}, now())
    ON CONFLICT (model) DO UPDATE SET price_in = EXCLUDED.price_in, price_out = EXCLUDED.price_out, verified = EXCLUDED.verified, note = EXCLUDED.note, updated_by = EXCLUDED.updated_by, updated_at = now()`
  resetPriceCache()
}

export interface UnitPriceRow { unit: string; priceUsd: number; note: string | null; verified: boolean; events30d: number; qty30d: number; usd30d: number }
export async function listUnitPrices(): Promise<UnitPriceRow[]> {
  const rows = (await sql`SELECT p.unit, p.price_usd, p.note, p.verified, COALESCE(e.n, 0)::int AS n, COALESCE(e.q, 0)::float AS q, COALESCE(e.c, 0)::float AS c
    FROM unit_prices p LEFT JOIN (SELECT unit, count(*) AS n, sum(qty) AS q, sum(cost_usd) AS c FROM usage_events WHERE created_at > now() - interval '30 days' GROUP BY unit) e ON e.unit = p.unit ORDER BY p.unit`) as any[]
  return rows.map((r) => ({ unit: String(r.unit), priceUsd: Number(r.price_usd), note: r.note ?? null, verified: !!r.verified, events30d: Number(r.n), qty30d: Number(r.q), usd30d: Number(r.c) }))
}
/** Saves the list price of one unit (USD per single unit: a second, a character, a token, a page). */
export async function saveUnitPrice(input: { unit: unknown; priceUsd: unknown; verified?: unknown; note?: unknown }, by: string): Promise<void> {
  const unit = String(input.unit ?? "")
  if (!(UNITS as readonly string[]).includes(unit)) throw new PriceError("Unknown unit.")
  const p = Number(input.priceUsd)
  if (!Number.isFinite(p) || p < 0 || p > 1000) throw new PriceError("The price is US dollars for one unit, between 0 and 1000.")
  await sql`INSERT INTO unit_prices (unit, price_usd, verified, note, updated_by, updated_at) VALUES (${unit}, ${p}, ${input.verified === true}, ${input.note ? String(input.note).slice(0, 300) : null}, ${by}, now())
    ON CONFLICT (unit) DO UPDATE SET price_usd = EXCLUDED.price_usd, verified = EXCLUDED.verified, note = EXCLUDED.note, updated_by = EXCLUDED.updated_by, updated_at = now()`
  resetUnitPriceCache()
}
