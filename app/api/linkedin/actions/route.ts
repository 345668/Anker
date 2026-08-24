/**
 * /api/linkedin/actions — list + enqueue outbound actions (dashboard-facing).
 *
 *   GET  ?status=pending_approval&senderId=…  → { ok, actions, counts }
 *   POST → { ok, action }   enqueue an action (born pending_approval; see §4a)
 *          { actionType, targetUrl, targetName?, senderId?, payload?, campaignId? }
 *
 * Enqueue never auto-approves from this route — approval is a separate, gated
 * step at /api/linkedin/actions/decision. Full-auto (Phase 2) enqueues via the
 * orchestration API, not here.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/require-user"
import { listActions, enqueueAction, actionCounts } from "@/lib/linkedin/action-queue"
import type { ActionStatus } from "@/lib/linkedin/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const url = new URL(req.url)
  const statusParam = url.searchParams.get("status")
  const status = statusParam ? (statusParam.split(",") as ActionStatus[]) : undefined
  const senderId = url.searchParams.get("senderId") || undefined
  const campaignId = url.searchParams.get("campaignId") || undefined
  const [actions, counts] = await Promise.all([
    listActions(auth.id, { status, senderId, campaignId }),
    actionCounts(auth.id),
  ])
  return NextResponse.json({ ok: true, actions, counts })
}

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const body = await req.json().catch(() => ({}))
  try {
    const action = await enqueueAction(auth.id, {
      actionType: body.actionType,
      targetUrl: body.targetUrl,
      targetName: body.targetName,
      senderId: body.senderId,
      campaignId: body.campaignId,
      memberId: body.memberId,
      crmEntryId: body.crmEntryId,
      payload: body.payload,
      scheduledFor: body.scheduledFor,
      // autoApprove intentionally not honoured from the dashboard enqueue path.
    })
    return NextResponse.json({ ok: true, action })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to enqueue" }, { status: 400 })
  }
}
