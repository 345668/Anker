/**
 * POST /api/portfolio/kpi-updates/[id]/approve — commit a reviewed extraction.
 *
 * Requires a matched company_id and a month_end. Writes the metrics into
 * portfolio_kpis_monthly via upsertKpiSnapshot (source 'email_update'), then
 * marks the extraction approved. The (company_id, month_end) upsert means
 * re-approving the same month overwrites rather than duplicating.
 *
 * Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { sql } from "@/lib/db"
import { upsertKpiSnapshot } from "@/lib/portfolio/queries"

export const runtime = "nodejs"

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params

  const rows = await sql`
    select * from portfolio_kpi_extractions where id = ${id}::uuid and status = 'pending' limit 1
  ` as Array<Record<string, any>>
  const x = rows[0]
  if (!x) return NextResponse.json({ error: "Not found or already reviewed" }, { status: 404 })
  if (!x.company_id) return NextResponse.json({ error: "Pick a portfolio company first." }, { status: 400 })
  if (!x.month_end) return NextResponse.json({ error: "Set the reporting month first." }, { status: 400 })

  const num = (v: unknown) => (v == null ? null : Number(v))
  await upsertKpiSnapshot({
    companyId: String(x.company_id),
    monthEnd: String(x.month_end).slice(0, 10),
    cashBalance: num(x.cash_balance),
    monthlyBurn: num(x.monthly_burn),
    runwayMonths: num(x.runway_months),
    monthlyRevenue: num(x.monthly_revenue),
    revenueGrowthMom: num(x.revenue_growth_mom),
    grossMarginPct: num(x.gross_margin_pct),
    headcount: x.headcount != null ? Number(x.headcount) : null,
    customers: x.customers != null ? Number(x.customers) : null,
    arr: num(x.arr),
    notes: x.highlights ?? null,
    source: "email_update" as any,
    createdBy: guard.id,
  })

  await sql`
    update portfolio_kpi_extractions
    set status = 'approved', reviewed_by = ${guard.id}, reviewed_at = now(), updated_at = now()
    where id = ${id}::uuid
  `
  return NextResponse.json({ ok: true, companyId: String(x.company_id), monthEnd: String(x.month_end).slice(0, 10) })
}
