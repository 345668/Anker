/** POST /api/outreach/send-authorizations/test { messageId } — send the approver a copy of one message, marked as a test. Nothing goes to the recipient and nothing is marked sent. */
import { NextRequest, NextResponse } from "next/server"
import { requireSender } from "@/lib/outreach/send-auth/session"
import { buildPreview } from "@/lib/outreach/send-auth/preview"
import { sendEmail, isResendConfigured } from "@/lib/email/resend"
import { recordChange } from "@/lib/audit/record-change"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const who = await requireSender()
  if (who instanceof NextResponse) return who
  if (!who.email) return NextResponse.json({ error: "Your account has no email address to send the test to." }, { status: 400 })
  if (!isResendConfigured()) return NextResponse.json({ error: "Email delivery is unavailable." }, { status: 503 })
  const b = await req.json().catch(() => ({}))
  if (typeof b?.messageId !== "string") return NextResponse.json({ error: "messageId is required." }, { status: 400 })
  const p = await buildPreview({ orgId: who.orgId, userId: who.userId, messageIds: [b.messageId], mode: "test" })
  if (p.error) return NextResponse.json({ error: p.error }, { status: 409 })
  const item = p.items[0]
  if (!item || item.verdict.code === "not_found" || item.verdict.code === "wrong_sender") return NextResponse.json({ error: "Message not found." }, { status: 404 })
  // A test is mail to the approver, not to a third party: transactional, no footer, no recipient gate. The real recipient is named in the text only.
  await sendEmail({ purpose: "transactional", noTracking: true, to: who.email, subject: `[TEST] ${item.subject || "(no subject)"}`,
    text: `This is a test copy for you only. Nothing was sent to ${item.to || "the recipient"}${item.cc.length ? `, or copied to ${item.cc.join(", ")}` : ""}.\n${item.verdict.code !== "ok" ? `\nWhen you send this for real it would be refused: ${item.verdict.code}.\n` : ""}\n----\n\n${item.body}` })
  await recordChange({ actor: { userId: who.userId, email: who.email }, scope: { type: "org", id: who.orgId }, action: "send_authorization.test_sent", target: { type: "outreach_message", id: item.messageId }, before: null, after: { to: who.email } })
  return NextResponse.json({ ok: true, sentTo: who.email })
}
