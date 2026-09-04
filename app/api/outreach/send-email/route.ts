/**
 * POST /api/outreach/send-email
 *
 * Send one outreach_messages row as an email via Resend.
 *
 * Body: { messageId: string }
 *   - The outreach_messages.id to send.  The row's body becomes the
 *     email body.  Subject must be set (use the email-personalizer to
 *     populate before calling).
 *   - For threaded follow-ups (kind != 'connection_request'), we look
 *     up the prior connection_request email_message_id on the same
 *     crm_entry and use it as In-Reply-To.
 *
 * Side effects:
 *   - Calls Resend
 *   - Updates outreach_messages: tracking_id, resend_id, email_message_id,
 *     email_from, email_to, status='sent', sent_at, body=rewritten HTML/text
 *   - Triggers syncCrmStageFromOutreach so the CRM stage flips forward
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { sendEmail, isResendConfigured } from "@/lib/email/resend"
import { sendGmail, loadGmailAccount, isGmailOAuthConfigured } from "@/lib/email/gmail"
import { syncCrmStageFromOutreach } from "@/lib/agents/crm-sync"
import { isEmailSuppressed } from "@/lib/outreach/deliverability"
import { randomUUID } from "node:crypto"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const messageId = String(body?.messageId ?? "")
    if (!messageId) return NextResponse.json({ error: "messageId required" }, { status: 400 })
    const sendVia: "resend" | "gmail" = body?.provider === "gmail" ? "gmail" : "resend"
    const gmailAccountId = body?.accountId ? String(body.accountId) : undefined

    const [row] = await sql`
      SELECT m.*, e.user_id AS entry_user_id, e.display_email, e.display_name
      FROM outreach_messages m
      JOIN crm_entries e ON e.id = m.crm_entry_id
      WHERE m.id = ${messageId}
      LIMIT 1
    `
    if (!row) return NextResponse.json({ error: "Message not found" }, { status: 404 })

    // Owner check (admin can send anyone's)
    const meta = (user.user_metadata ?? {}) as Record<string, any>
    const isAdmin = meta.role === "admin"
    if (!isAdmin && (row as any).entry_user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if ((row as any).channel !== "email") {
      return NextResponse.json({ error: `Message is channel=${(row as any).channel}, expected email` }, { status: 400 })
    }
    const toEmail = String((row as any).email_to ?? (row as any).display_email ?? "").trim()
    if (!toEmail) return NextResponse.json({ error: "No recipient email on message or CRM entry" }, { status: 400 })
    // Never send to a bounced/complained/unsubscribed address.
    if (await isEmailSuppressed((row as any).entry_user_id ?? user.id, toEmail)) {
      return NextResponse.json({ error: "Recipient is on the suppression list (bounced/complained/unsubscribed)" }, { status: 409 })
    }
    const subject = String((row as any).subject ?? "").trim()
    if (!subject) return NextResponse.json({ error: "Message has no subject — run the email personalizer first" }, { status: 400 })
    if (!(row as any).body) return NextResponse.json({ error: "Message has no body" }, { status: 400 })

    // Threading: if this is a follow-up, find the connection_request on
    // the same entry and reuse its message-id for In-Reply-To.
    let inReplyTo: string | undefined = undefined
    if ((row as any).kind !== "connection_request") {
      const [parent] = await sql`
        SELECT email_message_id FROM outreach_messages
        WHERE crm_entry_id = ${(row as any).crm_entry_id}
          AND kind = 'connection_request'
          AND email_message_id IS NOT NULL
        LIMIT 1
      `
      if (parent) inReplyTo = (parent as any).email_message_id || undefined
    }

    // Pull cc/bcc from any campaign(s) this CRM entry is enrolled in (typically one).
    // Union the lists so a CRM entry that's in multiple campaigns honours all configured CCs.
    const ccRows = await sql`
      SELECT DISTINCT jsonb_array_elements_text(c.cc_emails)  AS email
      FROM outreach_campaign_members m
      JOIN outreach_campaigns c ON c.id = m.campaign_id
      WHERE m.crm_entry_id = ${(row as any).crm_entry_id}
        AND m.user_id      = ${user.id}
    ` as any[]
    const bccRows = await sql`
      SELECT DISTINCT jsonb_array_elements_text(c.bcc_emails) AS email
      FROM outreach_campaign_members m
      JOIN outreach_campaigns c ON c.id = m.campaign_id
      WHERE m.crm_entry_id = ${(row as any).crm_entry_id}
        AND m.user_id      = ${user.id}
    ` as any[]
    const cc  = ccRows.map((r: any) => r.email).filter(Boolean)
    const bcc = bccRows.map((r: any) => r.email).filter(Boolean)

    const trackingId = (row as any).tracking_id ?? randomUUID()
    let result: {
      resendId: string; messageId: string; trackingId: string;
      finalFrom: string; finalReplyTo: string; finalSubject: string;
      finalHtml: string; finalText: string; finalCc: string[]; finalBcc: string[];
    }

    if (sendVia === "gmail") {
      if (!isGmailOAuthConfigured()) return NextResponse.json({ error: "Gmail OAuth not configured on this server" }, { status: 503 })
      // Resolve the account: explicit accountId > campaign default > user default
      let acct = gmailAccountId ? await loadGmailAccount({ accountId: gmailAccountId }) : null
      if (!acct) {
        // Try the campaign's default account
        const [camp] = await sql`
          SELECT c.default_send_account_id FROM outreach_campaign_members m
          JOIN outreach_campaigns c ON c.id = m.campaign_id
          WHERE m.crm_entry_id = ${(row as any).crm_entry_id}
            AND m.user_id = ${user.id}
            AND c.default_send_provider = 'gmail'
            AND c.default_send_account_id IS NOT NULL
          LIMIT 1
        ` as any[]
        if (camp?.default_send_account_id) acct = await loadGmailAccount({ accountId: camp.default_send_account_id })
      }
      if (!acct) acct = await loadGmailAccount({ userId: user.id })
      if (!acct) return NextResponse.json({ error: "No Gmail account connected. Connect one via Settings → Email." }, { status: 400 })
      if (acct.user_id !== user.id) return NextResponse.json({ error: "Forbidden — account belongs to another user" }, { status: 403 })

      const gmail = await sendGmail({
        account: acct,
        to: toEmail,
        subject,
        text: (row as any).body,
        cc,
        bcc,
        inReplyTo,
        trackingId,
      })
      if (!gmail.ok) return NextResponse.json({ error: `Gmail send failed: ${gmail.error}` }, { status: 502 })
      result = {
        resendId: `gmail:${gmail.result.gmailId}`,
        messageId: gmail.result.messageId,
        trackingId: gmail.result.trackingId,
        finalFrom: gmail.result.finalFrom,
        finalReplyTo: gmail.result.finalFrom,
        finalSubject: gmail.result.finalSubject,
        finalHtml: gmail.result.finalHtml,
        finalText: gmail.result.finalText,
        finalCc: gmail.result.finalCc,
        finalBcc: gmail.result.finalBcc,
      }
    } else {
      result = await sendEmail({
        to: toEmail,
        subject,
        text: (row as any).body,
        trackingId,
        inReplyTo,
        cc,
        bcc,
      })
    }

    await sql`
      UPDATE outreach_messages SET
        tracking_id      = ${result.trackingId},
        resend_id        = ${result.resendId},
        email_message_id = ${result.messageId},
        email_from       = ${result.finalFrom},
        email_to         = ${toEmail},
        subject          = ${result.finalSubject},
        status           = 'sent',
        sent_at          = NOW(),
        generated_by     = COALESCE(generated_by, 'manual'),
        updated_at       = NOW()
      WHERE id = ${messageId}
    `

    // Sync CRM stage forward — the connection_request 'sent' transition
    // takes 'queued' → 'contacted'. Also stamp last_contacted_at: the CRM's
    // stale detection and "last contact" column read it.
    try { await syncCrmStageFromOutreach((row as any).crm_entry_id) } catch {}
    try {
      await sql`UPDATE crm_entries SET last_contacted_at = NOW(), updated_at = NOW()
                WHERE id = ${(row as any).crm_entry_id}`
    } catch {}

    return NextResponse.json({
      ok: true,
      provider: sendVia,
      resendId: result.resendId,
      messageId: result.messageId,
      trackingId: result.trackingId,
      from: result.finalFrom,
      providerConfigured: sendVia === "gmail" ? isGmailOAuthConfigured() : isResendConfigured(),
    })
  } catch (e: any) {
    console.error("[outreach/send-email] error:", e)
    return NextResponse.json({ error: e?.message ?? "Send failed" }, { status: 500 })
  }
}
