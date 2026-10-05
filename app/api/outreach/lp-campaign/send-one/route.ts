/**
 * POST /api/outreach/lp-campaign/send-one
 *
 * Send a single LP Campaign email (no outreach_messages row required —
 * the LP Campaign pipeline keeps results in React state, not the DB).
 *
 * Body: { to, toName, subject, body }
 *
 * Uses Resend via lib/email/resend.ts (same path as all other outreach).
 *
 * Not a stored draft, so the send itself is the only record: it requires the workspace's sending permission (as send-email does), refuses placeholder and
 * unattended addresses, and writes an audit event with who sent what to whom (docs/architecture/46 §1.3, gap 6).
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sendEmail, isResendConfigured } from "@/lib/email/resend"
import { randomUUID } from "node:crypto"
import { crmWorkspaceResponse } from "@/lib/crm/workspace"
import { checkDeliverability } from "@/lib/outreach/send-gate"
import { recordChange } from "@/lib/audit/record-change"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const scope = await crmWorkspaceResponse(true, true)
    if (scope instanceof NextResponse) return scope

    const body = await req.json().catch(() => ({}))
    const { to, toName, subject, body: emailBody } = body as {
      to?: string
      toName?: string
      subject?: string
      body?: string
    }

    if (!to)         return NextResponse.json({ error: "to is required" }, { status: 400 })
    if (!subject)    return NextResponse.json({ error: "subject is required" }, { status: 400 })
    if (!emailBody)  return NextResponse.json({ error: "body is required" }, { status: 400 })

    const addr = checkDeliverability(to)
    if (!addr.ok) return NextResponse.json({ error: addr.reason }, { status: 400 })

    const trackingId = randomUUID()
    const result = await sendEmail({
      purpose: "outreach",
      senderUserId: user.id,
      to: to.trim(),
      subject: subject.trim(),
      text: emailBody,
      trackingId,
    })

    await recordChange({
      actor: { userId: user.id, email: user.email ?? null }, scope: { type: "org", id: scope.orgId }, action: "outreach.email_sent_single",
      target: { type: "email", id: result.messageId, label: to.trim() }, before: null,
      after: { to: to.trim(), subject: subject.trim(), chars: emailBody.length, resendId: result.resendId }, context: { via: "lp-campaign/send-one" },
    })
    return NextResponse.json({
      ok: true,
      resendId: result.resendId,
      messageId: result.messageId,
      trackingId: result.trackingId,
      providerConfigured: isResendConfigured(),
    })
  } catch (e: any) {
    console.error("[lp-campaign/send-one]", e)
    return NextResponse.json({ error: e?.message ?? "Send failed" }, { status: 500 })
  }
}
