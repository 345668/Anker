/**
 * POST /api/portfolio/funds/[id]/capital-calls/[callId]/draft-notice
 *
 * Generates the LP-facing call notice + email subject via the deep tier,
 * writes them to capital_calls.notice_md and notice_subject.
 *
 * Latency: 20-60s. maxDuration bumped accordingly.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById } from "@/lib/portfolio/funds"
import {
  getCallById, listLineItems, generateNoticeMarkdown, updateCall,
} from "@/lib/portfolio/capital-calls"

export const runtime = "nodejs"
export const maxDuration = 240

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; callId: string }> },
) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { callId } = await ctx.params
  try {
    const call = await getCallById(callId)
    if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 })
    const fund = await getFundById(call.fund_id)
    if (!fund) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
    const lines = await listLineItems(callId)
    if (lines.length === 0) {
      return NextResponse.json({ error: "Call has no line items to notice on" }, { status: 400 })
    }
    const draft = await generateNoticeMarkdown(fund, call, lines)
    const updated = await updateCall(callId, {
      noticeMd: draft.noticeMd,
      noticeSubject: draft.subject,
    })
    return NextResponse.json({
      call: updated,
      generationMs: draft.generationMs,
    })
  } catch (e: any) {
    console.error("[capital-calls draft-notice]", e)
    return NextResponse.json({ error: e?.message ?? "Generation failed" }, { status: 500 })
  }
}
