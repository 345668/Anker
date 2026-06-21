/**
 * GET  /api/portfolio/funds/[id]/distributions
 *   Lists distributions + DPI rollup.
 *
 * POST /api/portfolio/funds/[id]/distributions
 *   Body: { title, source?, sourceCompanyId?, grossAmount?, mgmtFeeDeduction?,
 *           carryDeduction?, netAmount?, paymentDate? }
 *   Creates the distribution + a per-LP line item pro-rata against ownership_pct.
 *
 * Admin-gated. [id] accepts either UUID or slug.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import {
  listDistributions, createDistribution, getFundDistributionRollup,
} from "@/lib/portfolio/distributions"

export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveFundId(slugOrId: string): Promise<string | null> {
  const trimmed = slugOrId.trim()
  if (!trimmed) return null
  const fund = UUID_RE.test(trimmed)
    ? (await getFundById(trimmed)) ?? (await getFundBySlug(trimmed))
    : await getFundBySlug(trimmed)
  return fund?.id ?? null
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  const [rows, rollup] = await Promise.all([
    listDistributions(fundId),
    getFundDistributionRollup(fundId),
  ])
  return NextResponse.json({ rows, total: rows.length, rollup })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const admin = guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  try {
    const body = await req.json()
    if (!body?.title?.trim()) {
      return NextResponse.json({ error: "title required" }, { status: 400 })
    }
    const result = await createDistribution({
      fundId,
      title: String(body.title),
      source: body.source ?? null,
      sourceCompanyId: body.sourceCompanyId ?? null,
      grossAmount: numOrNull(body.grossAmount),
      mgmtFeeDeduction: numOrNull(body.mgmtFeeDeduction),
      carryDeduction: numOrNull(body.carryDeduction),
      netAmount: numOrNull(body.netAmount),
      paymentDate: body.paymentDate ?? null,
      createdBy: admin.email ?? admin.id,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (e: any) {
    console.error("[distributions POST]", e)
    return NextResponse.json({ error: e?.message ?? "Create failed" }, { status: 500 })
  }
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
