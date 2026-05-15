/**
 * Reply-inbox admin helpers.
 *
 * The inbox view answers: "what inbound replies need attention right
 * now?"  Three buckets:
 *
 *   pending     — classification IS NULL (raw text dropped, not classified yet)
 *   classified  — classification IS NOT NULL AND approved = false AND sent_at IS NULL
 *   actioned    — approved = true OR sent_at IS NOT NULL
 *
 * All queries join crm_entries so the UI can show "who" without an
 * extra round-trip per row.
 *
 * NOTE: our `sql` template tag (pg-driver / pglite) doesn't support
 * nested fragment composition — every branch is its own template
 * literal.
 */

import { sql } from "@/lib/db"
import { classifyAndDraftReply, type ReplyContext, STAGE_FOR_CLASS } from "@/lib/ai/reply-handler"
import { resolveProvider } from "@/lib/ai/provider"
import { syncCrmStageFromOutreach } from "@/lib/agents/crm-sync"

export type InboxStatus = "pending" | "classified" | "actioned" | "all"

export interface InboxRow {
  id: string
  crmEntryId: string
  partnerName: string | null
  partnerFirm: string | null
  partnerTitle: string | null
  partnerLinkedin: string | null
  inboundText: string
  classification: string | null
  draftResponse: string | null
  recommendedStage: string | null
  reengageOn: string | null
  approved: boolean
  sentAt: string | null
  generatedBy: string | null
  notes: string | null
  receivedAt: string | null
  inReplyToMessageId: string | null
  inReplyToBody: string | null
  status: "pending" | "classified" | "actioned"
}

/** List inbox rows, newest first. */
export async function listInbox(opts: {
  status?: InboxStatus
  limit?: number
  userId?: string
} = {}): Promise<InboxRow[]> {
  const status = opts.status ?? "all"
  const cap = Math.max(1, Math.min(500, opts.limit ?? 100))
  const uid = opts.userId ?? null

  let rows: any[]
  if (status === "pending") {
    rows = uid
      ? await sql`
          SELECT r.*, e.display_name, e.display_type, e.display_title, e.display_linkedin,
                 m.body AS orig_dm_body
          FROM outreach_replies r
          JOIN crm_entries e ON e.id = r.crm_entry_id
          LEFT JOIN outreach_messages m ON m.id = r.in_reply_to_message_id
          WHERE r.classification IS NULL AND r.user_id = ${uid}
          ORDER BY r.received_at DESC
          LIMIT ${cap}`
      : await sql`
          SELECT r.*, e.display_name, e.display_type, e.display_title, e.display_linkedin,
                 m.body AS orig_dm_body
          FROM outreach_replies r
          JOIN crm_entries e ON e.id = r.crm_entry_id
          LEFT JOIN outreach_messages m ON m.id = r.in_reply_to_message_id
          WHERE r.classification IS NULL
          ORDER BY r.received_at DESC
          LIMIT ${cap}`
  } else if (status === "classified") {
    rows = uid
      ? await sql`
          SELECT r.*, e.display_name, e.display_type, e.display_title, e.display_linkedin,
                 m.body AS orig_dm_body
          FROM outreach_replies r
          JOIN crm_entries e ON e.id = r.crm_entry_id
          LEFT JOIN outreach_messages m ON m.id = r.in_reply_to_message_id
          WHERE r.classification IS NOT NULL AND r.approved = false
                AND r.sent_at IS NULL AND r.user_id = ${uid}
          ORDER BY r.received_at DESC
          LIMIT ${cap}`
      : await sql`
          SELECT r.*, e.display_name, e.display_type, e.display_title, e.display_linkedin,
                 m.body AS orig_dm_body
          FROM outreach_replies r
          JOIN crm_entries e ON e.id = r.crm_entry_id
          LEFT JOIN outreach_messages m ON m.id = r.in_reply_to_message_id
          WHERE r.classification IS NOT NULL AND r.approved = false AND r.sent_at IS NULL
          ORDER BY r.received_at DESC
          LIMIT ${cap}`
  } else if (status === "actioned") {
    rows = uid
      ? await sql`
          SELECT r.*, e.display_name, e.display_type, e.display_title, e.display_linkedin,
                 m.body AS orig_dm_body
          FROM outreach_replies r
          JOIN crm_entries e ON e.id = r.crm_entry_id
          LEFT JOIN outreach_messages m ON m.id = r.in_reply_to_message_id
          WHERE (r.approved = true OR r.sent_at IS NOT NULL) AND r.user_id = ${uid}
          ORDER BY r.received_at DESC
          LIMIT ${cap}`
      : await sql`
          SELECT r.*, e.display_name, e.display_type, e.display_title, e.display_linkedin,
                 m.body AS orig_dm_body
          FROM outreach_replies r
          JOIN crm_entries e ON e.id = r.crm_entry_id
          LEFT JOIN outreach_messages m ON m.id = r.in_reply_to_message_id
          WHERE r.approved = true OR r.sent_at IS NOT NULL
          ORDER BY r.received_at DESC
          LIMIT ${cap}`
  } else {
    rows = uid
      ? await sql`
          SELECT r.*, e.display_name, e.display_type, e.display_title, e.display_linkedin,
                 m.body AS orig_dm_body
          FROM outreach_replies r
          JOIN crm_entries e ON e.id = r.crm_entry_id
          LEFT JOIN outreach_messages m ON m.id = r.in_reply_to_message_id
          WHERE r.user_id = ${uid}
          ORDER BY r.received_at DESC
          LIMIT ${cap}`
      : await sql`
          SELECT r.*, e.display_name, e.display_type, e.display_title, e.display_linkedin,
                 m.body AS orig_dm_body
          FROM outreach_replies r
          JOIN crm_entries e ON e.id = r.crm_entry_id
          LEFT JOIN outreach_messages m ON m.id = r.in_reply_to_message_id
          ORDER BY r.received_at DESC
          LIMIT ${cap}`
  }

  return rows.map(serialize)
}

/** Counts per bucket for the inbox header. */
export async function inboxCounts(opts: { userId?: string } = {}): Promise<{
  pending: number; classified: number; actioned: number; total: number
}> {
  const uid = opts.userId ?? null
  const rows = uid
    ? await sql`
        SELECT
          count(*) FILTER (WHERE classification IS NULL)                            AS pending,
          count(*) FILTER (WHERE classification IS NOT NULL AND approved = false
                           AND sent_at IS NULL)                                     AS classified,
          count(*) FILTER (WHERE approved = true OR sent_at IS NOT NULL)            AS actioned,
          count(*)                                                                  AS total
        FROM outreach_replies
        WHERE user_id = ${uid}`
    : await sql`
        SELECT
          count(*) FILTER (WHERE classification IS NULL)                            AS pending,
          count(*) FILTER (WHERE classification IS NOT NULL AND approved = false
                           AND sent_at IS NULL)                                     AS classified,
          count(*) FILTER (WHERE approved = true OR sent_at IS NOT NULL)            AS actioned,
          count(*)                                                                  AS total
        FROM outreach_replies`
  const r = rows[0] as any
  return {
    pending: Number(r?.pending) || 0,
    classified: Number(r?.classified) || 0,
    actioned: Number(r?.actioned) || 0,
    total: Number(r?.total) || 0,
  }
}

/** Classify (or re-classify) a single inbox row.  Returns the updated row. */
export async function classifyInboxRow(
  replyId: string,
  founder: ReplyContext["founder"],
): Promise<InboxRow> {
  const [row] = await sql`
    SELECT r.*, e.display_name, e.display_type, e.display_title, e.display_linkedin,
           m.body AS orig_dm_body
    FROM outreach_replies r
    JOIN crm_entries e ON e.id = r.crm_entry_id
    LEFT JOIN outreach_messages m ON m.id = r.in_reply_to_message_id
    WHERE r.id = ${replyId}
    LIMIT 1`
  if (!row) throw new Error("Reply not found")
  const r = row as any

  const provider = await resolveProvider()
  const generatedBy = provider === "anthropic" ? "anthropic:claude-haiku-4-5"
    : provider === "ollama" ? `ollama:${process.env.OLLAMA_MODEL ?? "default"}`
    : "heuristic"

  const result = await classifyAndDraftReply({
    partnerName: r.display_name,
    partnerFirm: r.display_type ?? "their fund",
    partnerTitle: r.display_title ?? undefined,
    ourOriginalDm: r.orig_dm_body ?? "",
    theirReply: r.inbound_text,
    founder,
  })

  const [updated] = await sql`
    UPDATE outreach_replies SET
      classification     = ${result.classification},
      draft_response     = ${result.draft},
      recommended_stage  = ${result.recommendedStage},
      reengage_on        = ${result.reengageOnIso ?? null}::date,
      generated_by       = ${generatedBy},
      notes              = ${result.notes ?? null},
      updated_at         = NOW()
    WHERE id = ${replyId}
    RETURNING *`

  return serialize({
    ...(updated as any),
    display_name: r.display_name,
    display_type: r.display_type,
    display_title: r.display_title,
    display_linkedin: r.display_linkedin,
    orig_dm_body: r.orig_dm_body,
  })
}

/** Edit-in-place: update the draft response (and optionally
 *  classification / recommended_stage) on a row.  No AI call. */
export async function updateInboxDraft(
  replyId: string,
  patch: {
    draft?: string
    classification?: string
    recommendedStage?: string
    notes?: string
  },
): Promise<InboxRow> {
  const [updated] = await sql`
    UPDATE outreach_replies SET
      draft_response     = COALESCE(${patch.draft ?? null}, draft_response),
      classification     = COALESCE(${patch.classification ?? null}, classification),
      recommended_stage  = COALESCE(${patch.recommendedStage ?? null}, recommended_stage),
      notes              = COALESCE(${patch.notes ?? null}, notes),
      updated_at         = NOW()
    WHERE id = ${replyId}
    RETURNING *`
  return await hydrate(updated as any)
}

/** Mark a row approved + (optionally) sent.  When approved we advance
 *  the CRM stage via the shared sync layer. */
export async function approveInboxRow(replyId: string, opts: {
  markSent?: boolean
} = {}): Promise<InboxRow> {
  const [updated] = opts.markSent
    ? await sql`
        UPDATE outreach_replies SET
          approved   = true,
          sent_at    = COALESCE(sent_at, NOW()),
          updated_at = NOW()
        WHERE id = ${replyId}
        RETURNING *`
    : await sql`
        UPDATE outreach_replies SET
          approved   = true,
          updated_at = NOW()
        WHERE id = ${replyId}
        RETURNING *`
  const r = updated as any
  // Sync stage forward — uses canAdvance so we never auto-regress.
  try { await syncCrmStageFromOutreach(r.crm_entry_id) } catch {}
  return await hydrate(r)
}

// ─── helpers ───────────────────────────────────────────────────────────
async function hydrate(r: any): Promise<InboxRow> {
  const [entry] = await sql`SELECT display_name, display_type, display_title, display_linkedin FROM crm_entries WHERE id = ${r.crm_entry_id} LIMIT 1`
  const orig = r.in_reply_to_message_id
    ? (await sql`SELECT body FROM outreach_messages WHERE id = ${r.in_reply_to_message_id} LIMIT 1`)[0]
    : null
  return serialize({
    ...r,
    display_name: (entry as any)?.display_name ?? null,
    display_type: (entry as any)?.display_type ?? null,
    display_title: (entry as any)?.display_title ?? null,
    display_linkedin: (entry as any)?.display_linkedin ?? null,
    orig_dm_body: (orig as any)?.body ?? null,
  })
}

function serialize(r: any): InboxRow {
  const bucket: InboxRow["status"] =
    r.classification == null ? "pending"
    : (r.approved || r.sent_at) ? "actioned"
    : "classified"
  return {
    id: r.id,
    crmEntryId: r.crm_entry_id,
    partnerName: r.display_name ?? null,
    partnerFirm: r.display_type ?? null,
    partnerTitle: r.display_title ?? null,
    partnerLinkedin: r.display_linkedin ?? null,
    inboundText: r.inbound_text,
    classification: r.classification ?? null,
    draftResponse: r.draft_response ?? null,
    recommendedStage: r.recommended_stage ?? null,
    reengageOn: r.reengage_on ? new Date(r.reengage_on).toISOString().slice(0, 10) : null,
    approved: !!r.approved,
    sentAt: r.sent_at ? new Date(r.sent_at).toISOString() : null,
    generatedBy: r.generated_by ?? null,
    notes: r.notes ?? null,
    receivedAt: r.received_at ? new Date(r.received_at).toISOString() : null,
    inReplyToMessageId: r.in_reply_to_message_id ?? null,
    inReplyToBody: r.orig_dm_body ?? null,
    status: bucket,
  }
}

export { STAGE_FOR_CLASS }
