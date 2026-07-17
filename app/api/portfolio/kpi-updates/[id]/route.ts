/**
 * PATCH  /api/portfolio/kpi-updates/[id] — edit the queued extraction before
 *          approval (reviewer corrects the company match, month, or numbers).
 * DELETE /api/portfolio/kpi-updates/[id] — remove a queued extraction.
 *
 * Editable: companyId, monthEnd, and every metric field + highlights/notes.
 * Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { sql } from "@/lib/db"

export const runtime = "nodejs"

const NUM_FIELDS = [
  "cash_balance", "monthly_burn", "runway_months", "monthly_revenue",
  "revenue_growth_mom", "gross_margin_pct", "headcount", "customers", "arr",
] as const

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params

  let b: any = {}
  try { b = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const has = (k: string) => k in b
  const numOrNull = (v: unknown): number | null => {
    if (v === null || v === "" || v === undefined) return null
    const n = Number(v); return Number.isFinite(n) ? n : null
  }
  const n: Record<string, number | null> = {}
  for (const f of NUM_FIELDS) if (has(camel(f))) n[f] = numOrNull(b[camel(f)])

  const companyId = has("companyId") ? (b.companyId ? String(b.companyId) : null) : undefined
  const monthEnd = has("monthEnd") ? (b.monthEnd ? String(b.monthEnd) : null) : undefined
  const highlights = has("highlights") ? (typeof b.highlights === "string" ? b.highlights.slice(0, 2000) : null) : undefined
  const notes = has("notes") ? (typeof b.notes === "string" ? b.notes.slice(0, 2000) : null) : undefined

  const rows = await sql`
    update portfolio_kpi_extractions set
      company_id         = case when ${companyId !== undefined} then ${companyId ?? null} else company_id end,
      month_end          = case when ${monthEnd !== undefined} then ${monthEnd ?? null}::date else month_end end,
      cash_balance       = case when ${"cash_balance" in n} then ${n.cash_balance ?? null} else cash_balance end,
      monthly_burn       = case when ${"monthly_burn" in n} then ${n.monthly_burn ?? null} else monthly_burn end,
      runway_months      = case when ${"runway_months" in n} then ${n.runway_months ?? null} else runway_months end,
      monthly_revenue    = case when ${"monthly_revenue" in n} then ${n.monthly_revenue ?? null} else monthly_revenue end,
      revenue_growth_mom = case when ${"revenue_growth_mom" in n} then ${n.revenue_growth_mom ?? null} else revenue_growth_mom end,
      gross_margin_pct   = case when ${"gross_margin_pct" in n} then ${n.gross_margin_pct ?? null} else gross_margin_pct end,
      headcount          = case when ${"headcount" in n} then ${n.headcount ?? null} else headcount end,
      customers          = case when ${"customers" in n} then ${n.customers ?? null} else customers end,
      arr                = case when ${"arr" in n} then ${n.arr ?? null} else arr end,
      highlights         = case when ${highlights !== undefined} then ${highlights ?? null} else highlights end,
      notes              = case when ${notes !== undefined} then ${notes ?? null} else notes end,
      updated_at         = now()
    where id = ${id}::uuid and status = 'pending'
    returning id
  ` as Array<{ id: string }>
  if (!rows.length) return NextResponse.json({ error: "Not found or already reviewed" }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const rows = await sql`delete from portfolio_kpi_extractions where id = ${id}::uuid returning id` as Array<{ id: string }>
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}

function camel(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}
