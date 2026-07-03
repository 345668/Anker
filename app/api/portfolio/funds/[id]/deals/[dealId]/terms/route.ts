/**
 * POST /api/portfolio/funds/[id]/deals/[dealId]/terms
 *   Body: { securityType?, preMoney?, roundSize?, checkAmount?, proRata?,
 *           boardSeat?, liquidationPref?, otherTerms? }
 * Appends a new term-grid version (versions are immutable). Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { getDealById, addTermGrid } from "@/lib/portfolio/deal-pipeline"

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
  try {
    const body = await req.json()
    const rows = await addTermGrid({
      dealId,
      securityType: body.securityType ?? null,
      preMoney: body.preMoney ?? null,
      roundSize: body.roundSize ?? null,
      checkAmount: body.checkAmount ?? null,
      proRata: typeof body.proRata === "boolean" ? body.proRata : null,
      boardSeat: body.boardSeat ?? null,
      liquidationPref: body.liquidationPref ?? null,
      otherTerms: body.otherTerms ?? null,
      createdBy: admin.email ?? admin.id ?? null,
    })
    return NextResponse.json({ rows }, { status: 201 })
  } catch (e: any) {
    console.error("[deal terms POST]", e)
    return NextResponse.json({ error: e?.message ?? "Save failed" }, { status: 500 })
  }
}
