/**
 * /api/orchestration/actions — the n8n ↔ Anker seam for the outreach engine.
 *
 * n8n (the "brain") owns timing + sequence branching; Anker owns the record +
 * the approval gate. n8n calls here to enqueue the next action in a sequence
 * and to read action state so it can branch (accepted? replied? failed?).
 *
 * Auth: ORCHESTRATION_API_KEY (service key). Because the caller acts across
 * users, every request must name the `userId` it acts for.
 *
 *   POST  { userId, actionType, targetUrl, targetName?, senderId?, campaignId?,
 *           memberId?, crmEntryId?, payload?, scheduledFor?, autoApprove? }
 *     → { ok, action }
 *     Actions default to 'pending_approval' (the approval gate holds). Full-auto
 *     campaigns pass autoApprove:true to enqueue straight to 'queued' — an
 *     explicit, per-request opt-in, never the default.
 *
 *   GET   ?userId=…&status=…&campaignId=…&senderId=…&limit=…
 *     → { ok, actions, counts }   sequence state for branching.
 */
import { NextRequest, NextResponse } from "next/server"
import { authenticateOrchestration } from "@/lib/orchestration/auth"
import { enqueueAction, listActions, actionCounts } from "@/lib/linkedin/action-queue"
import type { ActionStatus } from "@/lib/linkedin/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const auth = authenticateOrchestration(req)
  if (!auth.ok) return auth.response

  const body = await req.json().catch(() => ({}))
  const userId = typeof body.userId === "string" ? body.userId.trim() : ""
  if (!userId) return NextResponse.json({ ok: false, error: "userId is required" }, { status: 400 })

  try {
    const action = await enqueueAction(userId, {
      actionType: body.actionType,
      targetUrl: body.targetUrl,
      targetName: body.targetName,
      senderId: body.senderId,
      campaignId: body.campaignId,
      memberId: body.memberId,
      crmEntryId: body.crmEntryId,
      payload: body.payload,
      scheduledFor: body.scheduledFor,
      autoApprove: body.autoApprove === true, // explicit opt-in only
      approvedBy: body.autoApprove === true ? "n8n:auto" : null,
    })
    return NextResponse.json({ ok: true, action })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to enqueue" }, { status: 400 })
  }
}

export async function GET(req: NextRequest) {
  const auth = authenticateOrchestration(req)
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const userId = (url.searchParams.get("userId") || "").trim()
  if (!userId) return NextResponse.json({ ok: false, error: "userId is required" }, { status: 400 })

  const statusParam = url.searchParams.get("status")
  const status = statusParam ? (statusParam.split(",") as ActionStatus[]) : undefined
  const senderId = url.searchParams.get("senderId") || undefined
  const campaignId = url.searchParams.get("campaignId") || undefined
  const limit = Number(url.searchParams.get("limit")) || undefined

  const [actions, counts] = await Promise.all([
    listActions(userId, { status, senderId, campaignId, limit }),
    actionCounts(userId),
  ])
  return NextResponse.json({ ok: true, actions, counts })
}
