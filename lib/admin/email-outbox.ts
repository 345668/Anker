/**
 * Email-outbox admin helpers.
 *
 * Four buckets:
 *   drafts        — channel='email', status='draft'
 *   sent          — status IN ('sent','delivered','replied','accepted')
 *   needs_followup — needs_followup = true (subset of sent)
 *   failed        — status = 'failed'
 *
 * Each row joins crm_entries so the UI can show "who" + display_email
 * + display_type without extra round-trips.
 *
 * Note: the `sql` template tag doesn't support nested fragment
 * composition (see lib/admin/inbox.ts comment), so each bucket has its
 * own query.
 */

import { sql } from "@/lib/db"

export type EmailBucket = "drafts" | "sent" | "needs_followup" | "failed" | "all"

export interface EmailOutboxRow {
  id: string
  crmEntryId: string
  partnerName: string | null
  partnerEmail: string | null
  partnerFirm: string | null
  kind: string
  stepNumber: number
  subject: string | null
  body: string
  status: string
  charCount: number
  emailFrom: string | null
  emailTo: string | null
  emailMessageId: string | null
  trackingId: string | null
  opens: number
  clicks: number
  lastOpenedAt: string | null
  lastClickedAt: string | null
  needsFollowup: boolean
  followupDueAt: string | null
  sentAt: string | null
  createdAt: string | null
  updatedAt: string | null
  resendId: string | null
  failedReason: string | null
  generatedBy: string | null
  bucket: "drafts" | "sent" | "needs_followup" | "failed"
}

export interface OutboxCounts {
  drafts: number
  sent: number
  needs_followup: number
  failed: number
  total: number
}

const SELECT = `
  SELECT m.*, e.display_name, e.display_email AS entry_email, e.display_type
  FROM outreach_messages m
  JOIN crm_entries e ON e.id = m.crm_entry_id
`

export async function listOutbox(opts: {
  bucket?: EmailBucket
  limit?: number
} = {}): Promise<EmailOutboxRow[]> {
  const bucket = opts.bucket ?? "drafts"
  const cap = Math.max(1, Math.min(500, opts.limit ?? 100))
  let rows: any[]
  switch (bucket) {
    case "drafts":
      rows = await sql`
        SELECT m.*, e.display_name, e.display_email AS entry_email, e.display_type
        FROM outreach_messages m
        JOIN crm_entries e ON e.id = m.crm_entry_id
        WHERE m.channel = 'email' AND m.status = 'draft'
        ORDER BY m.crm_entry_id, m.step_number ASC
        LIMIT ${cap}`
      break
    case "sent":
      rows = await sql`
        SELECT m.*, e.display_name, e.display_email AS entry_email, e.display_type
        FROM outreach_messages m
        JOIN crm_entries e ON e.id = m.crm_entry_id
        WHERE m.channel = 'email' AND m.status IN ('sent','delivered','replied','accepted')
        ORDER BY m.sent_at DESC NULLS LAST
        LIMIT ${cap}`
      break
    case "needs_followup":
      rows = await sql`
        SELECT m.*, e.display_name, e.display_email AS entry_email, e.display_type
        FROM outreach_messages m
        JOIN crm_entries e ON e.id = m.crm_entry_id
        WHERE m.channel = 'email' AND m.needs_followup = true
        ORDER BY m.followup_due_at ASC NULLS LAST
        LIMIT ${cap}`
      break
    case "failed":
      rows = await sql`
        SELECT m.*, e.display_name, e.display_email AS entry_email, e.display_type
        FROM outreach_messages m
        JOIN crm_entries e ON e.id = m.crm_entry_id
        WHERE m.channel = 'email' AND m.status = 'failed'
        ORDER BY m.updated_at DESC
        LIMIT ${cap}`
      break
    case "all":
    default:
      rows = await sql`
        SELECT m.*, e.display_name, e.display_email AS entry_email, e.display_type
        FROM outreach_messages m
        JOIN crm_entries e ON e.id = m.crm_entry_id
        WHERE m.channel = 'email'
        ORDER BY m.updated_at DESC
        LIMIT ${cap}`
  }
  return rows.map(serialize)
}

export async function outboxCounts(): Promise<OutboxCounts> {
  const [row] = await sql`
    SELECT
      count(*) FILTER (WHERE status = 'draft')                                            AS drafts,
      count(*) FILTER (WHERE status IN ('sent','delivered','replied','accepted'))          AS sent,
      count(*) FILTER (WHERE needs_followup = true)                                        AS needs_followup,
      count(*) FILTER (WHERE status = 'failed')                                            AS failed,
      count(*)                                                                             AS total
    FROM outreach_messages
    WHERE channel = 'email'`
  const r = row as any
  return {
    drafts: Number(r?.drafts) || 0,
    sent: Number(r?.sent) || 0,
    needs_followup: Number(r?.needs_followup) || 0,
    failed: Number(r?.failed) || 0,
    total: Number(r?.total) || 0,
  }
}

function serialize(r: any): EmailOutboxRow {
  const bucket: EmailOutboxRow["bucket"] =
    r.status === "draft" ? "drafts"
    : r.status === "failed" ? "failed"
    : r.needs_followup ? "needs_followup"
    : "sent"
  return {
    id: r.id,
    crmEntryId: r.crm_entry_id,
    partnerName: r.display_name ?? null,
    partnerEmail: r.entry_email ?? r.email_to ?? null,
    partnerFirm: r.display_type ?? null,
    kind: r.kind,
    stepNumber: Number(r.step_number) || 0,
    subject: r.subject ?? null,
    body: r.body ?? "",
    status: r.status,
    charCount: Number(r.char_count) || (r.body ? String(r.body).length : 0),
    emailFrom: r.email_from ?? null,
    emailTo: r.email_to ?? null,
    emailMessageId: r.email_message_id ?? null,
    trackingId: r.tracking_id ?? null,
    opens: Number(r.opens) || 0,
    clicks: Number(r.clicks) || 0,
    lastOpenedAt: r.last_opened_at ? new Date(r.last_opened_at).toISOString() : null,
    lastClickedAt: r.last_clicked_at ? new Date(r.last_clicked_at).toISOString() : null,
    needsFollowup: !!r.needs_followup,
    followupDueAt: r.followup_due_at ? new Date(r.followup_due_at).toISOString() : null,
    sentAt: r.sent_at ? new Date(r.sent_at).toISOString() : null,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
    resendId: r.resend_id ?? null,
    failedReason: r.failed_reason ?? null,
    generatedBy: r.generated_by ?? null,
    bucket,
  }
}
