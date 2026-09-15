/**
 * POST /api/portfolio/kpi-updates/[id]/approve — commit a reviewed extraction.
 *
 * Requires a matched company_id and a month_end. Writes the metrics into
 * portfolio_kpis_monthly (source 'email_update') and marks the extraction
 * approved atomically. The (company_id, month_end) upsert means
 * re-approving the same month overwrites rather than duplicating.
 *
 * Active fund workspace owner/admin only.
 */
import { NextRequest, NextResponse } from "next/server"
import { requirePortfolioAccess } from "@/lib/auth/portfolio-access"
import { sql } from "@/lib/db"
import { getCompanyById } from "@/lib/portfolio/queries"

export const runtime = "nodejs"

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePortfolioAccess(req)
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params

  const rows = await sql`
    select * from portfolio_kpi_extractions where id = ${id}::uuid and fund_id = ${guard.fund.id} and status = 'pending' limit 1
  ` as Array<Record<string, any>>
  const x = rows[0]
  if (!x) return NextResponse.json({ error: "Not found or already reviewed" }, { status: 404 })
  if (!x.company_id) return NextResponse.json({ error: "Pick a portfolio company first." }, { status: 400 })
  if (!x.month_end) return NextResponse.json({ error: "Set the reporting month first." }, { status: 400 })

  if (!await getCompanyById(String(x.company_id), guard.fund.id)) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 })
  }
  const monthEnd = (x.month_end instanceof Date ? x.month_end.toISOString() : String(x.month_end)).slice(0, 10)
  // Lock and recheck the pending row, then write its KPI and review state in
  // one PostgreSQL statement. Failed writes roll back approval; simultaneous
  // reviewers cannot both commit the same extraction.
  const approved = await sql`
    WITH pending AS (
      SELECT x.* FROM portfolio_kpi_extractions x
      JOIN portfolio_companies c ON c.id = x.company_id AND c.fund_id = x.fund_id
      WHERE x.id = ${id}::uuid AND x.fund_id = ${guard.fund.id}
        AND x.status = 'pending' AND x.month_end IS NOT NULL
      FOR UPDATE OF x
    ), saved AS (
      INSERT INTO portfolio_kpis_monthly (
        company_id, month_end, cash_balance, monthly_burn, runway_months,
        monthly_revenue, revenue_growth_mom, gross_margin_pct,
        headcount, customers, arr, notes, source, created_by
      )
      SELECT company_id, (date_trunc('month', month_end) + interval '1 month - 1 day')::date,
        cash_balance, monthly_burn,
        COALESCE(runway_months, CASE WHEN monthly_burn > 0 THEN round(cash_balance / monthly_burn, 1) END),
        monthly_revenue, revenue_growth_mom, gross_margin_pct,
        headcount, customers, arr, highlights, 'email_update', ${guard.id}
      FROM pending
      ON CONFLICT (company_id, month_end) DO UPDATE SET
        cash_balance = EXCLUDED.cash_balance, monthly_burn = EXCLUDED.monthly_burn,
        runway_months = EXCLUDED.runway_months, monthly_revenue = EXCLUDED.monthly_revenue,
        revenue_growth_mom = EXCLUDED.revenue_growth_mom, gross_margin_pct = EXCLUDED.gross_margin_pct,
        headcount = EXCLUDED.headcount, customers = EXCLUDED.customers, arr = EXCLUDED.arr,
        notes = EXCLUDED.notes, source = EXCLUDED.source, updated_at = now()
      RETURNING company_id
    )
    UPDATE portfolio_kpi_extractions x
    SET status = 'approved', reviewed_by = ${guard.id}, reviewed_at = now(), updated_at = now()
    FROM pending p
    WHERE x.id = p.id AND x.fund_id = ${guard.fund.id}
      AND EXISTS (SELECT 1 FROM saved WHERE saved.company_id = p.company_id)
    RETURNING x.id
  `
  if (!approved.length) return NextResponse.json({ error: "Not found or already reviewed" }, { status: 404 })
  return NextResponse.json({ ok: true, companyId: String(x.company_id), monthEnd })
}
