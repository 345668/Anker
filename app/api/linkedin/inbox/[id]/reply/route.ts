/**
 * POST /api/linkedin/inbox/[id]/reply — reply to a conversation from the platform.
 *
 * Consistent with the whole engine, a reply doesn't send directly: it enqueues a
 * 'message' action to the participant, which lands in the Review Queue (or auto-
 * approves only if you pass approve:true here — an explicit per-reply choice).
 * The extension then delivers it. Keeps one send path + one safety model.
 *
 * Body: { body: string, approve?: boolean }
 */
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/require-user"
import { getConversation } from "@/lib/linkedin/inbox"
import { enqueueAction } from "@/lib/linkedin/action-queue"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const text = typeof body.body === "string" ? body.body.trim() : ""
  if (!text) return NextResponse.json({ ok: false, error: "body is required" }, { status: 400 })

  const data = await getConversation(auth.id, id)
  if (!data) return NextResponse.json({ ok: false, error: "Conversation not found" }, { status: 404 })
  const { conversation } = data
  if (!conversation.participantUrl) {
    return NextResponse.json({ ok: false, error: "Conversation has no participant URL to message" }, { status: 400 })
  }

  const action = await enqueueAction(auth.id, {
    actionType: "message",
    targetUrl: conversation.participantUrl,
    targetName: conversation.participantName,
    senderId: conversation.senderId,
    campaignId: conversation.campaignId,
    memberId: conversation.memberId,
    payload: { message: text, conversationId: id },
    autoApprove: body.approve === true,
    approvedBy: body.approve === true ? auth.id : null,
  })
  return NextResponse.json({ ok: true, action, queued: action.status })
}
