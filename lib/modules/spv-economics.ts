import { sql } from "@/lib/db"
import type { CapTableRow } from "@/lib/modules/waterfall"

/**
 * Per-SPV cap table + economics terms. The cap table is derived from the
 * subscription book: each investor's contributed capital (committed / signed /
 * funded) and their ownership fraction of the LP pool.
 */

const num = (v: any) => (v == null ? 0 : Number(v))
const CONTRIB = ["committed", "signed", "funded"] // statuses that count as capital in

export interface SpvEconomics {
  carry_pct: number
  hurdle_pct: number
  contributed: number
}

export async function getSpvEconomics(spvId: string): Promise<SpvEconomics> {
  const s = await sql`SELECT carry_pct, hurdle_pct FROM spvs WHERE id = ${spvId} LIMIT 1`
  const c = await sql`
    SELECT COALESCE(SUM(amount), 0) AS contributed
    FROM spv_subscriptions WHERE spv_id = ${spvId} AND status IN ('committed', 'signed', 'funded')`
  return {
    carry_pct: num((s[0] as any)?.carry_pct ?? 20),
    hurdle_pct: num((s[0] as any)?.hurdle_pct ?? 0),
    contributed: num((c[0] as any)?.contributed ?? 0),
  }
}

/** Ownership rows for the LP pool (contributed capital), largest first. */
export async function getSpvCapTable(spvId: string): Promise<CapTableRow[]> {
  const rows = await sql`
    SELECT investor_name, COALESCE(SUM(amount), 0) AS contributed
    FROM spv_subscriptions
    WHERE spv_id = ${spvId} AND status IN ('committed', 'signed', 'funded')
    GROUP BY investor_name
    ORDER BY contributed DESC`
  const total = (rows as any[]).reduce((s, r) => s + num(r.contributed), 0)
  return (rows as any[]).map((r) => ({
    investor: r.investor_name,
    contributed: num(r.contributed),
    ownership: total > 0 ? num(r.contributed) / total : 0,
  }))
}

export async function setSpvTerms(userId: string, spvId: string, carryPct: number, hurdlePct: number): Promise<SpvEconomics | null> {
  const carry = Math.max(0, Math.min(100, carryPct))
  const hurdle = Math.max(0, Math.min(100, hurdlePct))
  const rows = await sql`
    UPDATE spvs SET carry_pct = ${carry}, hurdle_pct = ${hurdle}, updated_at = now()
    WHERE id = ${spvId} AND created_by = ${userId}
    RETURNING id`
  if (!rows[0]) return null
  return getSpvEconomics(spvId)
}
