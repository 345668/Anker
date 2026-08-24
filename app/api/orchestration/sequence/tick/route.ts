/**
 * POST /api/orchestration/sequence/tick — advance campaign sequences.
 *
 * n8n owns the timing (calls this on a schedule); Anker owns the logic. Each
 * tick advances active members: enqueues due steps (respecting the approval
 * gate + sender caps/hours/warmup) and moves members whose in-flight action
 * completed. See lib/linkedin/sequencer.ts.
 *
 * Auth: ORCHESTRATION_API_KEY (service key).
 * Body: { userId, campaignId? }
 *   campaignId given → tick that one campaign; omitted → tick all active for the user.
 */
import { NextRequest, NextResponse } from "next/server"
import { authenticateOrchestration } from "@/lib/orchestration/auth"
import { tickCampaign, tickAllActive } from "@/lib/linkedin/sequencer"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const auth = authenticateOrchestration(req)
  if (!auth.ok) return auth.response

  const body = await req.json().catch(() => ({}))
  const userId = typeof body.userId === "string" ? body.userId.trim() : ""
  if (!userId) return NextResponse.json({ ok: false, error: "userId is required" }, { status: 400 })

  try {
    if (typeof body.campaignId === "string" && body.campaignId) {
      const result = await tickCampaign(userId, body.campaignId)
      return NextResponse.json({ ok: true, results: [result] })
    }
    const results = await tickAllActive(userId)
    return NextResponse.json({ ok: true, results })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "tick failed" }, { status: 500 })
  }
}
