/**
 * Saved forecasting scenarios store (server-only).
 *
 * A scenario is a named set of forecasting assumptions (the sliders + Monte-Carlo σ). Save
 * is an upsert on (user_id, name) — re-saving a name overwrites it. Read paths degrade to
 * empty on any DB error so the forecasting panel never breaks.
 */
import "server-only"
import { sql } from "@/lib/db"

export interface ForecastParams {
  deployPct: number
  reservePct: number
  multiples: { downside: number; base: number; upside: number }
  uncertainty: number
}

export interface ForecastScenario {
  id: string
  name: string
  params: ForecastParams
  created_at: string
}

/** Coerce arbitrary stored/posted JSON into safe, bounded params. */
export function normalizeParams(raw: any): ForecastParams {
  const n = (v: any, d: number, lo: number, hi: number) => {
    const x = Number(v)
    return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d
  }
  const m = raw?.multiples ?? {}
  return {
    deployPct: n(raw?.deployPct, 100, 0, 100),
    reservePct: n(raw?.reservePct, 30, 0, 100),
    multiples: { downside: n(m.downside, 1.2, 0, 100), base: n(m.base, 2.0, 0, 100), upside: n(m.upside, 3.2, 0, 100) },
    uncertainty: n(raw?.uncertainty, 60, 5, 200),
  }
}

export async function listScenarios(userId: string): Promise<ForecastScenario[]> {
  try {
    const rows = await sql`SELECT id, name, params, created_at FROM forecast_scenarios
      WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 50` as any[]
    return rows.map((r) => ({ id: r.id, name: r.name, params: normalizeParams(typeof r.params === "string" ? JSON.parse(r.params) : r.params), created_at: String(r.created_at) }))
  } catch {
    return []
  }
}

export async function saveScenario(userId: string, name: string, params: ForecastParams): Promise<ForecastScenario> {
  const clean = normalizeParams(params)
  const rows = await sql`
    INSERT INTO forecast_scenarios (user_id, name, params)
    VALUES (${userId}, ${name.trim()}, ${JSON.stringify(clean)}::jsonb)
    ON CONFLICT (user_id, name) DO UPDATE SET params = EXCLUDED.params, updated_at = now()
    RETURNING id, name, params, created_at` as any[]
  const r = rows[0]
  return { id: r.id, name: r.name, params: clean, created_at: String(r.created_at) }
}

export async function deleteScenario(userId: string, id: string): Promise<boolean> {
  const rows = await sql`DELETE FROM forecast_scenarios WHERE user_id = ${userId} AND id = ${id} RETURNING id` as any[]
  return rows.length > 0
}
