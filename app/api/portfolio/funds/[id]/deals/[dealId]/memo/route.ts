/**
 * POST /api/portfolio/funds/[id]/deals/[dealId]/memo
 *   Generates (or regenerates) the AI IC memo. Stores the memo Markdown
 *   plus the frozen context it was generated against. Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { getDealById, generateDealMemo } from "@/lib/portfolio/deal-pipeline"

export const runtime = "nodejs"
export const maxDuration = 120

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveFundId(slugOrId: string): Promise<string | null> {
  const trimmed = slugOrId.trim()
  if (!trimmed) return null
  const fund = UUID_RE.test(trimmed)
    ? (await getFundById(trimmed)) ?? (await getFundBySlug(trimmed))
    : await getFundBySlug(trimmed)
  return fund?.id ?? null
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string; dealId: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id, dealId } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  const deal = await getDealById(dealId)
  if (!deal || deal.fund_id !== fundId) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 })
  }
  try {
    const updated = await generateDealMemo(dealId)
    return NextResponse.json(updated)
  } catch (e: any) {
    console.error("[deal memo POST]", e)
    return NextResponse.json({ error: e?.message ?? "Memo generation failed" }, { status: 500 })
  }
}
