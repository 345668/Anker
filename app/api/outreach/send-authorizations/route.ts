/**
 * GET  /api/outreach/send-authorizations                       — recent authorizations for this workspace (the sender's own, or all for an owner or admin)
 * POST /api/outreach/send-authorizations { messageIds, digest, typedCount?, provider?, accountId?, sendAfter?, now? } — approve exactly the previewed batch.
 *   `now: true` (the default when no sendAfter) also runs the executor for this batch immediately, within today's cap.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireSender, requireRevoker } from "@/lib/outreach/send-auth/session"
import { confirmAuthorization, listAuthorizations, AuthorizationError } from "@/lib/outreach/send-auth/store"
import { runExecutor } from "@/lib/outreach/send-auth/executor"

export const runtime = "nodejs"
export const maxDuration = 120

export async function GET() {
  const who = await requireRevoker()
  if (who instanceof NextResponse) return who
  const wide = ["workspace_owner", "admin"].includes(who.role)
  return NextResponse.json({ authorizations: await listAuthorizations(who.orgId, wide ? {} : { senderUserId: who.userId }), canRevokeAll: wide })
}

export async function POST(req: NextRequest) {
  const who = await requireSender()
  if (who instanceof NextResponse) return who
  const b = await req.json().catch(() => ({}))
  if (!Array.isArray(b?.messageIds) || typeof b?.digest !== "string") return NextResponse.json({ error: "messageIds and the digest from the preview are required." }, { status: 400 })
  const sendAfter = typeof b.sendAfter === "string" && b.sendAfter ? new Date(b.sendAfter) : null
  if (sendAfter && Number.isNaN(sendAfter.getTime())) return NextResponse.json({ error: "sendAfter is not a valid date." }, { status: 400 })
  try {
    const r = await confirmAuthorization({ orgId: who.orgId, userId: who.userId, messageIds: b.messageIds, digest: b.digest, typedCount: Number.isInteger(b.typedCount) ? b.typedCount : undefined,
      provider: b.provider === "gmail" ? "gmail" : b.provider === "resend" ? "resend" : undefined, accountId: typeof b.accountId === "string" ? b.accountId : null, sendAfter: sendAfter?.toISOString() ?? null, sequence: b.sequence === true }, { userId: who.userId, email: who.email })
    const sendNow = !sendAfter || sendAfter.getTime() <= Date.now()
    const stats = sendNow && b.now !== false ? await runExecutor(undefined, { authorizationId: r.authorizationId, max: 25 }) : null
    return NextResponse.json({ ok: true, authorizationId: r.authorizationId, authorized: r.authorized, blocked: r.blocked, sendNow: stats, days: r.preview.cap.days })
  } catch (e) {
    if (e instanceof AuthorizationError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
