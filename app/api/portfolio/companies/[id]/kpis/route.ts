/**
 * GET  /api/portfolio/companies/[id]/kpis?limit=24
 *   List KPI snapshots for a company, most-recent first.
 *
 * POST /api/portfolio/companies/[id]/kpis
 *   Upsert a single month's snapshot.
 *   Body: { monthEnd, cashBalance?, monthlyBurn?, monthlyRevenue?, ... }
 *
 *   The (company_id, month_end) UNIQUE constraint plus the upsert in
 *   lib/portfolio/queries.ts means re-POSTing the same month overwrites
 *   instead of erroring.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import {
  listKpis, upsertKpiSnapshot,
  KPI_SOURCES, type KpiSource,
} from "@/lib/portfolio/queries"

export const runtime = "nodejs"

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const url = new URL(req.url)
  const limit = clampInt(url.searchParams.get("limit"), 1, 120, 24)
  const rows = await listKpis(id, limit)
  return NextResponse.json({ rows, total: rows.length })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const admin = guard
  const { id } = await ctx.params
  try {
    const body = await req.json()
    if (!body?.monthEnd) {
      return NextResponse.json({ error: "monthEnd required (YYYY-MM-DD)" }, { status: 400 })
    }
    const snapshot = await upsertKpiSnapshot({
      companyId: id,
      monthEnd: String(body.monthEnd),
      cashBalance: numOrNull(body.cashBalance),
      monthlyBurn: numOrNull(body.monthlyBurn),
      runwayMonths: numOrNull(body.runwayMonths),
      monthlyRevenue: numOrNull(body.monthlyRevenue),
      revenueGrowthMom: numOrNull(body.revenueGrowthMom),
      grossMarginPct: numOrNull(body.grossMarginPct),
      headcount: typeof body.headcount === "number" ? body.headcount : null,
      customers: typeof body.customers === "number" ? body.customers : null,
      arr: numOrNull(body.arr),
      notes: body.notes ?? null,
      source: parseSource(body.source),
      createdBy: admin.email ?? admin.id,
    })
    return NextResponse.json({ snapshot }, { status: 201 })
  } catch (e: any) {
    console.error("[portfolio kpis POST]", e)
    return NextResponse.json({ error: e?.message ?? "Upsert failed" }, { status: 500 })
  }
}

function parseSource(s: any): KpiSource {
  if (typeof s === "string" && (KPI_SOURCES as readonly string[]).includes(s)) {
    return s as KpiSource
  }
  return "manual"
}
function clampInt(s: string | null | undefined, min: number, max: number, fallback: number) {
  const n = Number(s)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(n)))
}
function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
