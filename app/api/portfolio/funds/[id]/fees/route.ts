/**
 * GET /api/portfolio/funds/[id]/fees      → { schedule, accruals }
 * PUT /api/portfolio/funds/[id]/fees      → upsert the fee schedule
 *   Body: { annualFeePct, feeBase, startDate, termYears?,
 *           stepdownAfterYears?, stepdownFeePct?, notes? }
 * Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import {
  getFeeSchedule, upsertFeeSchedule, listAccruals, hasFeeTables,
} from "@/lib/portfolio/fund-fees"

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
  const [schedule, accruals] = await Promise.all([
    getFeeSchedule(fundId), listAccruals(fundId),
  ])
  return NextResponse.json({ schedule, accruals })
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  if (!(await hasFeeTables())) {
    return NextResponse.json(
      { error: "fee tables missing — run scripts/oneshot/run-fees-waterfall-tables.mjs first." },
      { status: 503 },
    )
  }
  try {
    const body = await req.json()
    const pct = Number(body?.annualFeePct)
    if (!Number.isFinite(pct) || pct < 0 || pct > 0.05) {
      return NextResponse.json({ error: "annualFeePct must be between 0 and 0.05" }, { status: 400 })
    }
    if (!["committed", "called", "invested"].includes(body?.feeBase)) {
      return NextResponse.json({ error: "feeBase must be committed | called | invested" }, { status: 400 })
    }
    if (typeof body?.startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.startDate)) {
      return NextResponse.json({ error: "startDate (YYYY-MM-DD) required" }, { status: 400 })
    }
    const schedule = await upsertFeeSchedule({
      fundId,
      annualFeePct: pct,
      feeBase: body.feeBase,
      startDate: body.startDate,
      termYears: body.termYears != null ? Number(body.termYears) : undefined,
      stepdownAfterYears: body.stepdownAfterYears != null ? Number(body.stepdownAfterYears) : undefined,
      stepdownFeePct: body.stepdownFeePct != null ? Number(body.stepdownFeePct) : null,
      notes: body.notes ?? null,
    })
    return NextResponse.json(schedule)
  } catch (e: any) {
    console.error("[fees PUT]", e)
    return NextResponse.json({ error: e?.message ?? "Save failed" }, { status: 500 })
  }
}
