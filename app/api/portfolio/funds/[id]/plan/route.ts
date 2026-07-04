/**
 * GET /api/portfolio/funds/[id]/plan
 *   → getPlanVsActual(fundId): plan rows vs record actuals + reserve.
 *   ?check=<amount> additionally returns a reserve check for a proposed
 *   check size (used by the deal workroom at close time).
 * PUT /api/portfolio/funds/[id]/plan
 *   Body: VcFundModelInputs — saved into funds.metadata.plan.
 * Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import {
  getPlanVsActual, savePlan, checkProposedAllocation,
} from "@/lib/portfolio/plan-actual"

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

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  try {
    const planVsActual = await getPlanVsActual(fundId)
    const checkRaw = new URL(req.url).searchParams.get("check")
    const check = checkRaw != null && Number.isFinite(Number(checkRaw)) && Number(checkRaw) > 0
      ? await checkProposedAllocation(fundId, Number(checkRaw))
      : null
    return NextResponse.json({ planVsActual, check })
  } catch (e: any) {
    console.error("[plan GET]", e)
    return NextResponse.json({ error: e?.message ?? "Read failed" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  try {
    const body = await req.json()
    const fundSize = Number(body?.fundSizeUsd)
    if (!Number.isFinite(fundSize) || fundSize <= 0) {
      return NextResponse.json({ error: "fundSizeUsd must be a positive number" }, { status: 400 })
    }
    await savePlan(fundId, {
      fundSizeUsd: fundSize,
      fundLifeYears: body.fundLifeYears != null ? Number(body.fundLifeYears) : undefined,
      investmentPeriodYears: body.investmentPeriodYears != null ? Number(body.investmentPeriodYears) : undefined,
      reservePeriodYears: body.reservePeriodYears != null ? Number(body.reservePeriodYears) : undefined,
      reserveRatio: body.reserveRatio != null ? Number(body.reserveRatio) : undefined,
      numInitialInvestments: body.numInitialInvestments != null ? Number(body.numInitialInvestments) : undefined,
      followOnMultipleOnInitial: body.followOnMultipleOnInitial != null ? Number(body.followOnMultipleOnInitial) : undefined,
      followOnHitRate: body.followOnHitRate != null ? Number(body.followOnHitRate) : undefined,
      firstExitYear: body.firstExitYear != null ? Number(body.firstExitYear) : undefined,
      annualExitFraction: body.annualExitFraction != null ? Number(body.annualExitFraction) : undefined,
      avgExitMultiple: body.avgExitMultiple != null ? Number(body.avgExitMultiple) : undefined,
      annualMarkupRate: body.annualMarkupRate != null ? Number(body.annualMarkupRate) : undefined,
      mgmtFeePct: body.mgmtFeePct != null ? Number(body.mgmtFeePct) : undefined,
      carriedInterestPct: body.carriedInterestPct != null ? Number(body.carriedInterestPct) : undefined,
    })
    const planVsActual = await getPlanVsActual(fundId)
    return NextResponse.json({ planVsActual })
  } catch (e: any) {
    console.error("[plan PUT]", e)
    return NextResponse.json({ error: e?.message ?? "Save failed" }, { status: 500 })
  }
}
