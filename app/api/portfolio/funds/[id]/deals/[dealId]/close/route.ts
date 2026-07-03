/**
 * POST /api/portfolio/funds/[id]/deals/[dealId]/close
 *   Body: { investedAt?, costBasis?, securityType?, fullyDilutedPct? }
 *
 * THE close action (FUND_OPS_DESIGN.md §3.1): creates the investments
 * row seeded at cost (Phase 1 spine) and flips the deal to closed with
 * the investment linked. Only committed deals can close. Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { getDealById, closeDeal, DealTransitionError } from "@/lib/portfolio/deal-pipeline"
import { hasInvestmentsTables } from "@/lib/portfolio/investments"

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

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; dealId: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const admin = guard
  const { id, dealId } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  const deal = await getDealById(dealId)
  if (!deal || deal.fund_id !== fundId) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 })
  }
  if (!(await hasInvestmentsTables())) {
    return NextResponse.json(
      { error: "investments tables missing — run scripts/oneshot/run-investments-tables.mjs first." },
      { status: 503 },
    )
  }
  try {
    const body = await req.json().catch(() => ({}))
    const result = await closeDeal({
      dealId,
      investedAt: typeof body.investedAt === "string" ? body.investedAt : null,
      costBasis: body.costBasis != null ? Number(body.costBasis) : null,
      securityType: body.securityType ?? null,
      fullyDilutedPct: body.fullyDilutedPct != null ? Number(body.fullyDilutedPct) : null,
      by: admin.email ?? admin.id ?? null,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (e: any) {
    if (e instanceof DealTransitionError) {
      const status = e.code === "invalid_transition" ? 409
        : e.code === "missing_check" ? 422
        : 400
      return NextResponse.json({ error: e.message, code: e.code }, { status })
    }
    console.error("[deal close POST]", e)
    return NextResponse.json({ error: e?.message ?? "Close failed" }, { status: 500 })
  }
}
