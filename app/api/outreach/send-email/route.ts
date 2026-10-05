import { crmWorkspaceResponse } from "@/lib/crm/workspace"
/**
 * POST /api/outreach/send-email
 *
 * Send one outreach_messages row as an email (Resend, or Gmail with provider: "gmail").
 *
 * Body: { messageId: string, provider?: "resend" | "gmail", accountId?: string }
 *
 * Since docs/architecture/46 this goes through the send authorization path: the click is the approval of exactly this message to exactly this recipient from this
 * mailbox, it is recorded, bound to the text, and sent by the same executor as every other send, so the same checks apply at the moment of sending
 * (opt-out, consent, the contact replying, the daily allowance). The response keeps its old shape.
 *
 * Side effects (done by the executor): the message becomes sent with its provider ids, the CRM stage syncs forward, last_contacted_at is stamped.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { resolveActingUser } from "@/lib/auth/acting-user"
import { isResendConfigured } from "@/lib/email/resend"
import { isGmailOAuthConfigured } from "@/lib/email/gmail"
import { describeDropped } from "@/lib/email/send-errors"
import { buildPreview } from "@/lib/outreach/send-auth/preview"
import { confirmAuthorization, AuthorizationError } from "@/lib/outreach/send-auth/store"
import { runExecutor } from "@/lib/outreach/send-auth/executor"
import { VERDICT_TEXT, type VerdictCode } from "@/lib/outreach/send-auth/model"

export const runtime = "nodejs"
export const maxDuration = 60

const STATUS: Partial<Record<VerdictCode, number>> = { not_found: 404, wrong_sender: 403, not_email: 400, no_recipient: 400, no_subject: 400, no_body: 400, suppressed: 409, country_gated: 409, bad_address: 400 }

export async function POST(req: NextRequest) {
  try {
    // Signed-in user, or the tenant user the staff portal is acting as (lib/auth/acting-user.ts: explicit, audited, that user's privileges only).
    const user = await resolveActingUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
    const crmScope = await crmWorkspaceResponse(true, true)
    if (crmScope instanceof NextResponse) return crmScope

    const body = await req.json().catch(() => ({}))
    const messageId = String(body?.messageId ?? "")
    if (!messageId) return NextResponse.json({ error: "messageId required" }, { status: 400 })
    const sendVia: "resend" | "gmail" = body?.provider === "gmail" ? "gmail" : "resend"
    if (sendVia === "gmail" && !isGmailOAuthConfigured()) return NextResponse.json({ error: "Gmail OAuth not configured on this server" }, { status: 503 })

    const preview = await buildPreview({ orgId: crmScope.orgId, userId: user.id, messageIds: [messageId], provider: sendVia, accountId: body?.accountId ? String(body.accountId) : null })
    if (preview.error) return NextResponse.json({ error: preview.error }, { status: /another user/.test(preview.error) ? 403 : 400 })
    const item = preview.items[0]
    if (!item || item.verdict.code !== "ok") {
      const code = (item?.verdict.code ?? "not_found") as VerdictCode
      return NextResponse.json({ error: `${VERDICT_TEXT[code]}${item?.verdict.detail ? ` (${item.verdict.detail})` : ""}` }, { status: STATUS[code] ?? 409 })
    }

    const conf = await confirmAuthorization({ orgId: crmScope.orgId, userId: user.id, messageIds: [messageId], provider: sendVia, accountId: body?.accountId ? String(body.accountId) : null, digest: preview.digest, source: "manual_single" }, { userId: user.id, email: (user as any).email ?? null })
    await runExecutor(undefined, { authorizationId: conf.authorizationId, max: 1 })

    const [res] = (await sql`SELECT i.status, i.reason, i.provider_id, i.provider_message_id, m.tracking_id, m.email_from FROM send_items i JOIN outreach_messages m ON m.id = i.message_id WHERE i.authorization_id = ${conf.authorizationId} AND i.message_id = ${messageId}`) as any[]
    if (res?.status !== "sent") {
      // Not sent: say why, and leave nothing waiting that the person did not expect.
      if (res?.status === "approved") await sql`UPDATE send_items SET status = 'revoked', reason = 'Not sent now; cancelled so nothing sends later unexpectedly.' WHERE authorization_id = ${conf.authorizationId} AND status = 'approved'`
      if (res?.status === "approved") await sql`UPDATE outreach_messages SET status = 'draft', scheduled_for = NULL WHERE id = ${messageId} AND status = 'queued'`
      return NextResponse.json({ error: res?.reason || "The message was not sent." }, { status: res?.status === "blocked" || res?.status === "skipped" ? 409 : 502 })
    }
    return NextResponse.json({
      ok: true, provider: sendVia, resendId: res.provider_id, messageId: res.provider_message_id, trackingId: res.tracking_id, from: res.email_from,
      providerConfigured: sendVia === "gmail" ? isGmailOAuthConfigured() : isResendConfigured(),
      authorizationId: conf.authorizationId,
      // The executor records any left-out cc/bcc on the item; the sender is told rather than left to assume the copy went.
      note: res.reason && /not copied/i.test(res.reason) ? res.reason : describeDropped(item.droppedSecondary),
      dropped: item.droppedSecondary,
    })
  } catch (e: any) {
    if (e instanceof AuthorizationError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error("[outreach/send-email] error:", e)
    return NextResponse.json({ error: e?.message ?? "Send failed" }, { status: 500 })
  }
}
