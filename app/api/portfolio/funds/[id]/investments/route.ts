/**
 * GET  /api/portfolio/funds/[id]/investments   → { rows, nav }
 * POST /api/portfolio/funds/[id]/investments
 *   Body: { companyName, costBasis, companyId?, investmentKind?,
 *           securityType?, roundName?, investedAt?, shareCount?,
 *           fullyDilutedPct?, roundValuation?, notes?, seedValuationAtCost? }
 *
 * Admin-gated. [id] accepts either UUID or slug.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import {
  listInvestments, createInvestment, getFundNav, hasInvestmentsTables,
} from "@/lib/portfolio/investments"

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
  try {
    const [rows, nav] = await Promise.all([listInvestments(fundId), getFundNav(fundId)])
    return NextResponse.json({ rows, nav, total: rows.length })
  } catch (e: any) {
    console.error("[investments GET]", e)
    return NextResponse.json({ error: e?.message ?? "Read failed" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const admin = guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  if (!(await hasInvestmentsTables())) {
    return NextResponse.json(
      { error: "investments tables missing — run scripts/oneshot/run-investments-tables.mjs first." },
      { status: 503 },
    )
  }
  try {
    const body = await req.json()
    if (!body?.companyName?.trim()) {
      return NextResponse.json({ error: "companyName required" }, { status: 400 })
    }
    const costBasis = Number(body.costBasis)
    if (!Number.isFinite(costBasis) || costBasis < 0) {
      return NextResponse.json({ error: "costBasis must be a non-negative number" }, { status: 400 })
    }
    const row = await createInvestment({
      fundId,
      companyId: body.companyId ?? null,
      companyName: body.companyName,
      investmentKind: body.investmentKind,
      securityType: body.securityType,
      roundName: body.roundName ?? null,
      investedAt: body.investedAt ?? null,
      costBasis,
      shareCount: body.shareCount ?? null,
      fullyDilutedPct: body.fullyDilutedPct ?? null,
      roundValuation: body.roundValuation ?? null,
      notes: body.notes ?? null,
      seedValuationAtCost: body.seedValuationAtCost,
      createdBy: admin.email ?? admin.id ?? null,
    })
    return NextResponse.json(row, { status: 201 })
  } catch (e: any) {
    console.error("[investments POST]", e)
    return NextResponse.json({ error: e?.message ?? "Create failed" }, { status: 500 })
  }
}
