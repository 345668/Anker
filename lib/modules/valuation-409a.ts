import { sql } from "@/lib/db"
import type { OpmInputs } from "@/lib/modules/opm-409a"

/**
 * 409A valuation records with OPM inputs/outputs (server side). Compute lives in
 * the pure opm-409a module (runs client-side too); this persists the inputs and
 * the resulting fair market value.
 */

const num = (v: any) => (v == null ? null : Number(v))

export interface Valuation409aFull {
  id: string; company_id: string; method: string
  status: "requested" | "in_progress" | "completed" | "board_approved" | "expired"
  valued_at: string | null; expires_at: string | null; notes: string | null
  fair_market_value: number | null; common_price: number | null; equity_value: number | null
  common_shares: number | null; preferred_shares: number | null; liquidation_pref: number | null
  recent_price: number | null; volatility: number | null; risk_free_rate: number | null
  years_to_liquidity: number | null; dlom: number | null; created_at: string
}

function norm(r: any): Valuation409aFull {
  return {
    id: r.id, company_id: r.company_id, method: r.method, status: r.status,
    valued_at: r.valued_at ? String(r.valued_at) : null,
    expires_at: r.expires_at ? String(r.expires_at) : null, notes: r.notes ?? null,
    fair_market_value: num(r.fair_market_value), common_price: num(r.common_price), equity_value: num(r.equity_value),
    common_shares: num(r.common_shares), preferred_shares: num(r.preferred_shares), liquidation_pref: num(r.liquidation_pref),
    recent_price: num(r.recent_price), volatility: num(r.volatility), risk_free_rate: num(r.risk_free_rate),
    years_to_liquidity: num(r.years_to_liquidity), dlom: num(r.dlom), created_at: String(r.created_at),
  }
}

export async function getValuation(companyId: string, id: string): Promise<Valuation409aFull | null> {
  const rows = await sql`SELECT * FROM valuations_409a WHERE id = ${id} AND company_id = ${companyId} LIMIT 1`
  return rows[0] ? norm(rows[0]) : null
}

/** Persist the OPM inputs + computed common FMV / equity value; marks completed. */
export async function saveValuationOpm(
  companyId: string, id: string, input: OpmInputs, out: { commonFmv: number; equityValue: number },
): Promise<Valuation409aFull | null> {
  const rows = await sql`
    UPDATE valuations_409a SET
      method = 'OPM', status = 'completed', valued_at = CURRENT_DATE,
      common_shares = ${input.commonShares}, preferred_shares = ${input.preferredShares},
      liquidation_pref = ${input.liquidationPref}, recent_price = ${input.recentPrice},
      volatility = ${input.volatility}, risk_free_rate = ${input.riskFreeRate},
      years_to_liquidity = ${input.yearsToLiquidity}, dlom = ${input.dlom},
      equity_value = ${out.equityValue}, common_price = ${out.commonFmv},
      fair_market_value = ${out.equityValue}
    WHERE id = ${id} AND company_id = ${companyId}
    RETURNING *`
  return rows[0] ? norm(rows[0]) : null
}

export async function setValuationStatus(companyId: string, id: string, status: Valuation409aFull["status"]): Promise<Valuation409aFull | null> {
  // Board approval stamps a 12-month expiry (409A safe-harbor).
  const rows = await sql`
    UPDATE valuations_409a SET
      status = ${status},
      expires_at = CASE WHEN ${status} = 'board_approved' AND valued_at IS NOT NULL THEN valued_at + INTERVAL '12 months' ELSE expires_at END
    WHERE id = ${id} AND company_id = ${companyId}
    RETURNING *`
  return rows[0] ? norm(rows[0]) : null
}
