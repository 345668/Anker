/**
 * POST /api/portfolio/funds/[id]/distributions/[distId]/draft-notice
 *
 * Generates the LP-facing distribution notice + email subject via the
 * deep tier, writes them to distributions.notice_md and notice_subject.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById } from "@/lib/portfolio/funds"
import {
  getDistributionById, listDistributionLineItems,
  generateDistributionNotice, updateDistribution,
} from "@/lib/portfolio/distributions"

export const runtime = "nodejs"
export const maxDuration = 240

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; distId: string }> },
) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { distId } = await ctx.params
  try {
    const dist = await getDistributionById(distId)
    if (!dist) return NextResponse.json({ error: "Distribution not found" }, { status: 404 })
    const fund = await getFundById(dist.fund_id)
    if (!fund) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
    const lines = await listDistributionLineItems(distId)
    if (lines.length === 0) {
      return NextResponse.json({ error: "Distribution has no line items to notice on" }, { status: 400 })
    }
    const draft = await generateDistributionNotice(fund, dist, lines)
    const updated = await updateDistribution(distId, {
      noticeMd: draft.noticeMd,
      noticeSubject: draft.subject,
    })
    return NextResponse.json({
      distribution: updated,
      generationMs: draft.generationMs,
    })
  } catch (e: any) {
    console.error("[distributions draft-notice]", e)
    return NextResponse.json({ error: e?.message ?? "Generation failed" }, { status: 500 })
  }
}
