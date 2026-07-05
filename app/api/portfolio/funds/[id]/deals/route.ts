/**
 * GET  /api/portfolio/funds/[id]/deals    → { rows, rollup }
 * POST /api/portfolio/funds/[id]/deals    → create a sourced deal
 *
 * Admin-gated. [id] accepts either UUID or slug.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import {
  listDeals, createDeal, getPipelineRollup, hasDealTables,
} from "@/lib/portfolio/deal-pipeline"

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
    const [rows, rollup] = await Promise.all([listDeals(fundId), getPipelineRollup(fundId)])
    return NextResponse.json({ rows, rollup, total: rows.length })
  } catch (e: any) {
    console.error("[deals GET]", e)
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
  if (!(await hasDealTables())) {
    return NextResponse.json(
      { error: "deal pipeline tables missing — run scripts/oneshot/run-deal-pipeline-tables.mjs first." },
      { status: 503 },
    )
  }
  try {
    const body = await req.json()
    if (!body?.companyName?.trim()) {
      return NextResponse.json({ error: "companyName required" }, { status: 400 })
    }
    const row = await createDeal({
      fundId,
      companyName: body.companyName,
      website: body.website ?? null,
      oneLiner: body.oneLiner ?? null,
      sector: body.sector ?? null,
      geography: body.geography ?? null,
      roundName: body.roundName ?? null,
      raiseAmount: body.raiseAmount ?? null,
      preMoney: body.preMoney ?? null,
      proposedCheck: body.proposedCheck ?? null,
      source: body.source ?? null,
      ownerEmail: body.ownerEmail ?? null,
      notes: body.notes ?? null,
      createdBy: admin.email ?? admin.id ?? null,
    })
    return NextResponse.json(row, { status: 201 })
  } catch (e: any) {
    console.error("[deals POST]", e)
    return NextResponse.json({ error: e?.message ?? "Create failed" }, { status: 500 })
  }
}
