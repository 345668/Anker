/**
 * /api/portfolio/kpi-updates — AI KPI ingestion review queue.
 *
 *   GET  ?status=pending|approved|dismissed   list extractions (default pending)
 *   POST { rawText, fundId? }                 run the extractor, queue a row
 *
 * POST takes an investor-update body (pasted email text), extracts a month
 * of KPIs, fuzzy-matches the portfolio company, and inserts a PENDING
 * extraction for review. Approving it (see [id]/approve) writes
 * portfolio_kpis_monthly.
 *
 * Admin-gated. Feature adapted from Hemrock Portfolio Reporting (Apache-2.0).
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { sql } from "@/lib/db"
import { extractKpisFromUpdate, matchCompany } from "@/lib/portfolio/kpi-extract"

export const runtime = "nodejs"
export const maxDuration = 120

const FLAGSHIP = "svs-fund-ii"

export async function GET(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const status = req.nextUrl.searchParams.get("status") || "pending"
  const valid = ["pending", "approved", "dismissed"].includes(status) ? status : "pending"
  const rows = await sql`
    select x.*, c.name as company_name
    from portfolio_kpi_extractions x
    left join portfolio_companies c on c.id = x.company_id
    where x.status = ${valid}
    order by x.created_at desc
    limit 200
  `
  return NextResponse.json({ extractions: rows })
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard

  let body: any = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const rawText = typeof body.rawText === "string" ? body.rawText.trim() : ""
  if (rawText.length < 20) {
    return NextResponse.json({ error: "Paste the investor update (at least 20 characters)." }, { status: 400 })
  }
  const fundId = typeof body.fundId === "string" && body.fundId ? body.fundId : FLAGSHIP

  const ex = await extractKpisFromUpdate(rawText)
  const match = await matchCompany(fundId, ex.companyName)

  const rows = await sql`
    insert into portfolio_kpi_extractions (
      fund_id, company_id, matched_name, month_end,
      cash_balance, monthly_burn, runway_months, monthly_revenue,
      revenue_growth_mom, gross_margin_pct, headcount, customers, arr,
      highlights, raw_text, source, confidence, status, created_by
    ) values (
      ${fundId}, ${match?.id ?? null}, ${ex.companyName}, ${ex.monthEnd},
      ${ex.cashBalance}, ${ex.monthlyBurn}, ${ex.runwayMonths}, ${ex.monthlyRevenue},
      ${ex.revenueGrowthMom}, ${ex.grossMarginPct}, ${ex.headcount}, ${ex.customers}, ${ex.arr},
      ${ex.highlights}, ${rawText}, ${"email_update"}, ${ex.confidence}, ${"pending"}, ${guard.id}
    )
    returning id
  ` as Array<{ id: string }>

  return NextResponse.json({
    ok: true,
    id: rows[0].id,
    matched: match ? { id: match.id, name: match.name } : null,
    extraction: ex,
  }, { status: 201 })
}
