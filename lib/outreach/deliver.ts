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
import { isEmailSuppressed } from "@/lib/outreach/deliverability"
import { randomUUID } from "node:crypto"

export interface DeliverReplyInput {
  userId: string
  crmEntryId: string
  draft: string
  inReplyToMessageId?: string | null
  /**
   * Outbound message kind. Defaults to 'reply'. Pass 'schedule' when the reply
   * is a booking ask (INTERESTED) so the interested→call step is measurable and
   * kept on its own UNIQUE (crm_entry_id, kind) slot.
   */
  kind?: "reply" | "schedule"
}

export interface DeliverReplyResult {
  ok: boolean
  sent: boolean
  messageId?: string
  outreachMessageId?: string
  reason?: string
}

type DeliveryStatus = "sending" | "sent" | "queued" | "failed"

/** Persist delivery state independently of the mutable outbound message row. */
async function recordDelivery(messageId: string | undefined, userId: string, draft: string, status: DeliveryStatus, lastError: string | null = null) {
  if (!messageId) return
  try {
    await sql`
      INSERT INTO outreach_reply_deliveries
        (reply_id, outreach_message_id, user_id, status, approved_draft, first_attempt_at, updated_at, last_error)
      VALUES
        (${randomUUID()}, ${messageId}, ${userId}, ${status}, ${draft}, NOW(), NOW(), ${lastError})
      ON CONFLICT (outreach_message_id) WHERE outreach_message_id IS NOT NULL DO UPDATE SET
        status = EXCLUDED.status,
        approved_draft = EXCLUDED.approved_draft,
        updated_at = NOW(),
        last_error = EXCLUDED.last_error
    `
  } catch (error) {
    // The outbound row remains the source of truth if the additive monitoring
    // migration has not reached an environment yet; never fail a delivery for
    // an observability-only write.
    console.error("[outreach] delivery monitor write failed", error)
  }
}

export async function deliverApprovedReply(input: DeliverReplyInput): Promise<DeliverReplyResult> {
  const { userId, crmEntryId } = input
  const kind = input.kind ?? "reply"
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

  // Never send to a bounced/complained/unsubscribed address.
  if (await isEmailSuppressed(userId, toEmail)) {
    return { ok: false, sent: false, reason: "recipient is on the suppression list" }
  }

  // Enqueue the reply as a first-class outbound message. There is a unique
  // (crm_entry_id, kind) index, so upsert: one 'reply' message per entry, kept
  // current with the latest approved draft.
  const trackingId = randomUUID()
  const [msg] = (await sql`
    INSERT INTO outreach_messages (
      user_id, crm_entry_id, kind, step_number, channel, body, status,
      subject, email_from, email_to, tracking_id, scheduled_for, created_at, updated_at
    ) VALUES (
      ${userId}, ${crmEntryId}, ${kind}, 4, 'email', ${draft}, 'queued',
      ${subject}, ${emailFrom}, ${toEmail}, ${trackingId}, NOW(), NOW(), NOW()
    )
    ON CONFLICT (crm_entry_id, kind) DO UPDATE SET
      body = EXCLUDED.body, subject = EXCLUDED.subject,
      email_from = EXCLUDED.email_from, email_to = EXCLUDED.email_to,
      status = 'queued', tracking_id = EXCLUDED.tracking_id, updated_at = NOW()
    RETURNING id
  `) as any[]
  const outreachMessageId = msg?.id as string
  await recordDelivery(outreachMessageId, userId, draft, "queued")

  // Claim the queued row before calling the provider. Concurrent approvals
  // share one outbound record; only the claimant may send it.
  const [claimed] = await sql`
    UPDATE outreach_messages SET status = 'sending', updated_at = NOW()
    WHERE id = ${outreachMessageId} AND status = 'queued'
    RETURNING id
  ` as any[]
  if (!claimed) {
    const [current] = await sql`SELECT status, email_message_id FROM outreach_messages WHERE id = ${outreachMessageId} LIMIT 1` as any[]
    if (current?.status === 'sent') return { ok: true, sent: true, messageId: current.email_message_id, outreachMessageId }
    return { ok: true, sent: false, outreachMessageId, reason: "Reply is already being delivered; retry after it finishes." }
  }
  await recordDelivery(outreachMessageId, userId, draft, "sending")

  if (!isResendConfigured()) {
    await recordDelivery(outreachMessageId, userId, draft, "queued")
    return { ok: true, sent: false, outreachMessageId, reason: "Resend not configured — reply queued for send" }
  }

  try {
    const result = await sendEmail({ to: toEmail, subject, text: draft, trackingId, inReplyTo, idempotencyKey: `anker-reply/${outreachMessageId}` })
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
    await recordDelivery(outreachMessageId, userId, draft, "sent")
    return { ok: true, sent: true, messageId: result.messageId, outreachMessageId }
  } catch (e: any) {
    // Leave the row 'queued' so it can be retried; surface the reason.
    await sql`UPDATE outreach_messages SET status = 'queued', updated_at = NOW() WHERE id = ${outreachMessageId} AND status = 'sending'`
    await recordDelivery(outreachMessageId, userId, draft, "failed", e?.message ?? "send failed")
    return { ok: false, sent: false, outreachMessageId, reason: e?.message ?? "send failed" }
  }
}
