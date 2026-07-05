/**
 * Fund/target context builder for AI deck fill.
 *
 * Reads canonical data from funds + funds.assessment + linked LP report,
 * hands back a compact JSON blob Qwen can chew on without exploding the
 * context window. Numeric fractions are pre-formatted for humans (0.02
 * -> "2%").
 */
import { sql } from "@/lib/db"

export interface FundContext {
  fund: {
    id: string; name: string; tagline?: string
    vintage?: string; target_size?: string; minimum_check?: string
    thesis?: string; sector_focus?: string; stage_focus?: string
    geography?: string; term_years?: number
    management_fee?: string; carried_interest?: string; hurdle?: string
    gp_commit?: string
  }
  team?: Array<{ name: string; title: string; bio?: string }>
  track_record?: {
    prior_funds?: number; total_committed?: string
    top_wins?: Array<{ company: string; note: string }>
  }
  portfolio?: Array<{
    company: string; sector?: string; stage?: string
    check_size?: string; ownership?: string; one_liner?: string
  }>
  narrative?: {
    why_now?: string; differentiation?: string; risks?: string
  }
}

function pct(x: any): string | undefined {
  if (x == null) return undefined
  const n = Number(x)
  if (Number.isNaN(n)) return undefined
  return `${(n <= 1 ? n * 100 : n).toFixed(1).replace(/\.0$/, "")}%`
}
function usd(x: any): string | undefined {
  if (x == null) return undefined
  const n = Number(x)
  if (Number.isNaN(n)) return undefined
  if (n >= 1_000_000_000) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1_000_000)     return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1_000)         return `$${(n / 1e3).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

export async function buildFundContext(fundId: string): Promise<FundContext | null> {
  try {
    const rows: any[] = await sql`
      SELECT id, name, tagline, vintage, target_size_usd, minimum_check_usd,
             thesis, sector_focus, stage_focus, geography, term_years,
             management_fee_pct, carried_interest_pct, hurdle_pct, gp_commit_pct,
             assessment
        FROM funds WHERE id = ${fundId}::uuid LIMIT 1`
    if (!rows.length) return null
    const f = rows[0]
    const a = f.assessment ?? {}
    const ctx: FundContext = {
      fund: {
        id: f.id, name: f.name,
        tagline: f.tagline || a?.narrative?.tagline || undefined,
        vintage: f.vintage || undefined,
        target_size: usd(f.target_size_usd),
        minimum_check: usd(f.minimum_check_usd),
        thesis: f.thesis || a?.narrative?.thesis || undefined,
        sector_focus: f.sector_focus || undefined,
        stage_focus: f.stage_focus || undefined,
        geography: f.geography || undefined,
        term_years: f.term_years || undefined,
        management_fee: pct(f.management_fee_pct),
        carried_interest: pct(f.carried_interest_pct),
        hurdle: pct(f.hurdle_pct),
        gp_commit: pct(f.gp_commit_pct),
      },
      narrative: {
        why_now: a?.narrative?.why_now,
        differentiation: a?.narrative?.differentiation,
        risks: a?.narrative?.risks,
      },
    }
    // Portfolio companies for tables.
    try {
      const p: any[] = await sql`
        SELECT company, sector, stage, check_size_usd, ownership_pct, one_liner
          FROM portfolio_companies WHERE fund_id = ${fundId}::uuid LIMIT 40`
      ctx.portfolio = p.map((r) => ({
        company: r.company, sector: r.sector, stage: r.stage,
        check_size: usd(r.check_size_usd), ownership: pct(r.ownership_pct),
        one_liner: r.one_liner,
      }))
    } catch {}
    return ctx
  } catch (e) {
    console.error("[decks buildFundContext]", e)
    return null
  }
}
