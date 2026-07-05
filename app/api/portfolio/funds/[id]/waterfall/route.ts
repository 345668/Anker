/**
 * GET  /api/portfolio/funds/[id]/waterfall   → { runs }
 * POST /api/portfolio/funds/[id]/waterfall
 *   Body: { grossAmount, hurdlePct?, carryPct?, catchUpPct?, save? }
 *   Computes the European waterfall against the record; when save=true
 *   the run is frozen into waterfall_runs.
 * PATCH /api/portfolio/funds/[id]/waterfall
 *   Body: { runId } → pre-fills a distribution draft from a saved run.
 * Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import {
  computeWaterfall, listRuns, saveRun, createDistributionFromRun, hasWaterfallTable,
} from "@/lib/portfolio/waterfall"

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
  const runs = await listRuns(fundId)
  return NextResponse.json({ runs })
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
    const gross = Number(body?.grossAmount)
    if (!Number.isFinite(gross) || gross <= 0) {
      return NextResponse.json({ error: "grossAmount must be a positive number" }, { status: 400 })
    }
    const result = await computeWaterfall(fundId, {
      grossAmount: gross,
      hurdlePct: Number(body?.hurdlePct) || 0,
      carryPct: body?.carryPct != null ? Number(body.carryPct) : 0.20,
      catchUpPct: body?.catchUpPct != null ? Number(body.catchUpPct) : 1.0,
    })
    let run = null
    if (body?.save === true) {
      if (!(await hasWaterfallTable())) {
        return NextResponse.json(
          { error: "waterfall_runs missing — run scripts/oneshot/run-fees-waterfall-tables.mjs first." },
          { status: 503 },
        )
      }
      run = await saveRun(fundId, result, admin.email ?? admin.id ?? null)
    }
    return NextResponse.json({ result, run })
  } catch (e: any) {
    console.error("[waterfall POST]", e)
    return NextResponse.json({ error: e?.message ?? "Compute failed" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const admin = guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  try {
    const body = await req.json()
    if (!body?.runId) return NextResponse.json({ error: "runId required" }, { status: 400 })
    const { run, distributionId } = await createDistributionFromRun(
      body.runId, admin.email ?? admin.id ?? null,
    )
    if (run.fund_id !== fundId) {
      return NextResponse.json({ error: "Run belongs to a different fund" }, { status: 404 })
    }
    return NextResponse.json({ run, distributionId }, { status: 201 })
  } catch (e: any) {
    console.error("[waterfall PATCH]", e)
    return NextResponse.json({ error: e?.message ?? "Pre-fill failed" }, { status: 500 })
  }
}
