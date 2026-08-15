import { sql } from "@/lib/db"

/**
 * Per-LP information sharing — the Carta disclosure matrix. Controls what each
 * limited partner can see: their own statement of investments (SOI) and capital
 * account, plus optionally fund-wide deal IRR and fund performance.
 *
 * This is the visible control plane for the LP data firewall we already enforce
 * in the LP portal — it makes disclosure per-LP and editable.
 */

export const SHARING_CATEGORIES = ["soi", "deal_irr", "fund_performance", "cap_account"] as const
export type SharingCategory = (typeof SHARING_CATEGORIES)[number]

export const CATEGORY_LABEL: Record<SharingCategory, string> = {
  soi: "SOI",
  deal_irr: "Deal IRR",
  fund_performance: "Fund performance",
  cap_account: "Cap. account",
}

// Defaults when no row exists yet (mirror the migration defaults).
const DEFAULTS: Record<SharingCategory, boolean> = {
  soi: true,
  deal_irr: false,
  fund_performance: false,
  cap_account: true,
}

export interface LpSharingRow {
  lp_id: string
  lp_name: string
  soi: boolean
  deal_irr: boolean
  fund_performance: boolean
  cap_account: boolean
  updated_at: string | null
}

/** One row per LP in the fund, folding in defaults for LPs without a row yet. */
export async function listInformationSharing(fundId: string): Promise<LpSharingRow[]> {
  const rows = await sql`
    SELECT l.id AS lp_id, l.lp_name,
           s.soi, s.deal_irr, s.fund_performance, s.cap_account,
           to_char(s.updated_at, 'YYYY-MM-DD"T"HH24:MI:SSZ') AS updated_at
    FROM fund_lps l
    LEFT JOIN lp_information_sharing s ON s.lp_id = l.id
    WHERE l.fund_id = ${fundId}
    ORDER BY l.commitment_amount DESC NULLS LAST, l.lp_name
  `
  return (rows as any[]).map((r) => ({
    lp_id: r.lp_id,
    lp_name: r.lp_name,
    soi: r.soi ?? DEFAULTS.soi,
    deal_irr: r.deal_irr ?? DEFAULTS.deal_irr,
    fund_performance: r.fund_performance ?? DEFAULTS.fund_performance,
    cap_account: r.cap_account ?? DEFAULTS.cap_account,
    updated_at: r.updated_at ?? null,
  }))
}

/** Toggle one category for one LP. Reads the current effective row, applies the
 *  single change, and upserts all four columns explicitly — no dynamic SQL, so
 *  the category never touches the query text. */
export async function setInformationSharing(
  fundId: string,
  lpId: string,
  category: SharingCategory,
  value: boolean,
): Promise<LpSharingRow | null> {
  if (!SHARING_CATEGORIES.includes(category)) return null

  // Confirm the LP belongs to this fund (defense against cross-fund writes) and
  // grab the display name in one round-trip.
  const owns = await sql`SELECT lp_name FROM fund_lps WHERE id = ${lpId} AND fund_id = ${fundId} LIMIT 1`
  if (!owns[0]) return null
  const lpName = (owns[0] as any).lp_name as string

  // Current effective values (existing row, or defaults), then apply the toggle.
  const cur = await sql`SELECT soi, deal_irr, fund_performance, cap_account FROM lp_information_sharing WHERE lp_id = ${lpId}`
  const base = cur[0]
    ? { soi: (cur[0] as any).soi, deal_irr: (cur[0] as any).deal_irr, fund_performance: (cur[0] as any).fund_performance, cap_account: (cur[0] as any).cap_account }
    : { ...DEFAULTS }
  const next = { ...base, [category]: value }

  const rows = await sql`
    INSERT INTO lp_information_sharing (lp_id, fund_id, soi, deal_irr, fund_performance, cap_account, updated_at)
    VALUES (${lpId}, ${fundId}, ${next.soi}, ${next.deal_irr}, ${next.fund_performance}, ${next.cap_account}, now())
    ON CONFLICT (lp_id) DO UPDATE SET
      soi = ${next.soi}, deal_irr = ${next.deal_irr},
      fund_performance = ${next.fund_performance}, cap_account = ${next.cap_account},
      updated_at = now()
    RETURNING lp_id, soi, deal_irr, fund_performance, cap_account,
              to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SSZ') AS updated_at
  `
  const r: any = rows[0]
  if (!r) return null
  return {
    lp_id: r.lp_id, lp_name: lpName,
    soi: r.soi, deal_irr: r.deal_irr, fund_performance: r.fund_performance, cap_account: r.cap_account,
    updated_at: r.updated_at,
  }
}
