/**
 * Deliver an approved reply draft as a real threaded email.
 *
 * P0-4 of docs/founder-outreach-audit.md: approving a reply must actually send
 * it, not just flip a flag. This enqueues the draft as a first-class
 * outreach_messages row (kind='reply') and sends it via Resend, threaded to the
 * original message so it lands in the same conversation. Approval-gated by
 * design: the caller only invokes this when a human approves.
 */
import "server-only"
import { sql } from "@/lib/db"
import { sendEmail, isResendConfigured } from "@/lib/email/resend"
import { syncCrmStageFromOutreach } from "@/lib/agents/crm-sync"
import { randomUUID } from "node:crypto"

export interface DeliverReplyInput {
  userId: string
  crmEntryId: string
  draft: string
  inReplyToMessageId?: string | null
}

export interface DeliverReplyResult {
  ok: boolean
  sent: boolean
  messageId?: string
  outreachMessageId?: string
  reason?: string
}

export async function deliverApprovedReply(input: DeliverReplyInput): Promise<DeliverReplyResult> {
  const { userId, crmEntryId } = input
  const draft = (input.draft ?? "").trim()
  if (!draft) return { ok: false, sent: false, reason: "no draft to send" }

  const [entry] = (await sql`
    SELECT display_email, display_name FROM crm_entries
    WHERE id = ${crmEntryId} AND user_id = ${userId} LIMIT 1
  `) as any[]

  let toEmail = String(entry?.display_email ?? "").trim()
  let emailFrom: string | null = null
  let subject = "Re: your note"
  let inReplyTo: string | undefined = undefined

  // Prefer threading to the exact message they replied to.
  if (input.inReplyToMessageId) {
    const [orig] = (await sql`
      SELECT email_to, email_from, subject, email_message_id
      FROM outreach_messages WHERE id = ${input.inReplyToMessageId} AND user_id = ${userId} LIMIT 1
    `) as any[]
    if (orig) {
      if (!toEmail) toEmail = String(orig.email_to ?? "").trim()
      emailFrom = orig.email_from ?? null
      if (orig.subject) {
        subject = String(orig.subject).startsWith("Re:") ? String(orig.subject) : `Re: ${orig.subject}`
      }
      inReplyTo = orig.email_message_id || undefined
    }
  }
  // Fall back to the connection_request thread if we still have no anchor.
  if (!inReplyTo) {
    const [parent] = (await sql`
      SELECT email_message_id FROM outreach_messages
      WHERE crm_entry_id = ${crmEntryId} AND user_id = ${userId}
        AND kind = 'connection_request' AND email_message_id IS NOT NULL
      LIMIT 1
    `) as any[]
    if (parent) inReplyTo = parent.email_message_id || undefined
  }

  if (!toEmail) return { ok: false, sent: false, reason: "no recipient email on CRM entry or original message" }

  // Enqueue the reply as a first-class outbound message.
  const trackingId = randomUUID()
  const [msg] = (await sql`
    INSERT INTO outreach_messages (
      user_id, crm_entry_id, kind, step_number, channel, body, status,
      subject, email_from, email_to, tracking_id, scheduled_for, created_at, updated_at
    ) VALUES (
      ${userId}, ${crmEntryId}, 'reply', 4, 'email', ${draft}, 'queued',
      ${subject}, ${emailFrom}, ${toEmail}, ${trackingId}, NOW(), NOW(), NOW()
    ) RETURNING id
  `) as any[]
  const outreachMessageId = msg?.id as string

  if (!isResendConfigured()) {
    return { ok: true, sent: false, outreachMessageId, reason: "Resend not configured — reply queued for send" }
  }

  try {
    const result = await sendEmail({ to: toEmail, subject, text: draft, trackingId, inReplyTo })
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
        generated_by     = COALESCE(generated_by, 'auto:reply'),
        updated_at       = NOW()
      WHERE id = ${outreachMessageId}
    `
    try { await syncCrmStageFromOutreach(crmEntryId) } catch {}
    return { ok: true, sent: true, messageId: result.messageId, outreachMessageId }
  } catch (e: any) {
    // Leave the row 'queued' so it can be retried; surface the reason.
    return { ok: false, sent: false, outreachMessageId, reason: e?.message ?? "send failed" }
  }
}
