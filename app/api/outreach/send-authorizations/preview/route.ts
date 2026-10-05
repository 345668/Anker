/** POST /api/outreach/send-authorizations/preview { messageIds, provider?, accountId?, sendAfter? } — what would be sent, to whom, from where, and what is refused. Writes nothing. */
import { NextRequest, NextResponse } from "next/server"
import { requireSender } from "@/lib/outreach/send-auth/session"
import { buildPreview } from "@/lib/outreach/send-auth/preview"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const who = await requireSender()
  if (who instanceof NextResponse) return who
  const b = await req.json().catch(() => ({}))
  if (!Array.isArray(b?.messageIds) || !b.messageIds.every((x: unknown) => typeof x === "string")) return NextResponse.json({ error: "messageIds must be a list of message ids." }, { status: 400 })
  const sendAfter = typeof b.sendAfter === "string" && b.sendAfter ? new Date(b.sendAfter) : null
  if (sendAfter && Number.isNaN(sendAfter.getTime())) return NextResponse.json({ error: "sendAfter is not a valid date." }, { status: 400 })
  const p = await buildPreview({ orgId: who.orgId, userId: who.userId, messageIds: b.messageIds, provider: b.provider === "gmail" ? "gmail" : b.provider === "resend" ? "resend" : undefined, accountId: typeof b.accountId === "string" ? b.accountId : null, sendAfter: sendAfter?.toISOString() ?? null, sequence: b.sequence === true })
  // The first message in full, a sample of the rest: enough to read, not a copy of the whole batch.
  return NextResponse.json({ ...p, items: p.items.map((i, n) => ({ ...i, body: n === 0 ? i.body : i.body.slice(0, 280) })), sendable: undefined, blocked: undefined, sendableCount: p.sendable.length, blockedCount: p.blocked.length })
}
