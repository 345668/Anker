/**
 * CRM ↔ outreach sync layer.
 *
 * The platform has two state machines:
 *
 *   crm_entries.stage         — pipeline view
 *   outreach_messages.status  — per-DM lifecycle
 *   outreach_replies.*        — inbound classification
 *
 * Without a sync layer they drift.  This module centralises the rules
 * so every entry-point (UI, API, agent) writes consistent state.
 *
 *   Trigger                                   → CRM stage
 *   ───────────────────────────────────────────────────────
 *   connection_request status → 'sent'        → 'contacted'
 *   any message status → 'replied' AND        → reply.recommended_stage
 *     a reply row exists                        (defaults to 'responded')
 *   meeting booked (manually or via reply)    → 'meeting'
 *   in_diligence / committed / passed         → preserved (manual)
 *
 * Usage:
 *   await syncCrmStageFromOutreach(crmEntryId)
 *
 * Idempotent.  Safe to call after every mutation; pricing impact zero
 * (single SELECT + 1 UPDATE).  Use `recomputeAll()` for back-fill.
 */

import { sql } from "@/lib/db"

export type CrmStage =
  | "queued" | "contacted" | "responded" | "meeting"
  | "in_diligence" | "committed" | "passed"

const TERMINAL_OR_MANUAL: CrmStage[] = ["in_diligence", "committed", "passed", "meeting"]
/** Forward-progress order — lower index = earlier in the pipeline.
 *  We never auto-regress past `contacted`; once a reply has classified
 *  the lead as PASSED we honour that; otherwise we don't roll back. */
const STAGE_ORDER: CrmStage[] = [
  "queued", "contacted", "responded", "meeting", "in_diligence", "committed", "passed",
]

/** Recompute the CRM stage for one entry from its outreach + replies.  */
export async function syncCrmStageFromOutreach(crmEntryId: string): Promise<{
  before: CrmStage | null
  after: CrmStage | null
  changed: boolean
  reason: string
}> {
  const [entry] = await sql`SELECT id, user_id, stage FROM crm_entries WHERE id = ${crmEntryId} LIMIT 1`
  if (!entry) return { before: null, after: null, changed: false, reason: "not found" }
  const before = (entry as any).stage as CrmStage

  // If the user has explicitly progressed the lead past 'responded' we
  // don't auto-regress — those are manual stages.
  if (TERMINAL_OR_MANUAL.includes(before)) {
    return { before, after: before, changed: false, reason: "manual stage preserved" }
  }

  // Look at the most recent reply (if any) — its recommended_stage
  // wins.
  const [latestReply] = await sql`
    SELECT recommended_stage, classification, received_at
    FROM outreach_replies
    WHERE crm_entry_id = ${crmEntryId}
    ORDER BY received_at DESC
    LIMIT 1
  `
  if (latestReply) {
    const target = ((latestReply as any).recommended_stage as CrmStage | null) ?? "responded"
    if (canAdvance(before, target)) {
      await applyStage(crmEntryId, target, "auto: latest reply classification")
      return { before, after: target, changed: target !== before, reason: `reply → ${target}` }
    }
    return { before, after: before, changed: false, reason: "reply already reflected" }
  }

  // No reply yet — check messages.  Any sent connection_request takes
  // the lead to 'contacted'.
  const [sentConn] = await sql`
    SELECT id FROM outreach_messages
    WHERE crm_entry_id = ${crmEntryId}
      AND kind = 'connection_request'
      AND status IN ('sent', 'delivered')
    LIMIT 1
  `
  if (sentConn) {
    if (canAdvance(before, "contacted")) {
      await applyStage(crmEntryId, "contacted", "auto: connection request sent")
      return { before, after: "contacted", changed: before !== "contacted", reason: "conn request sent" }
    }
  }

  return { before, after: before, changed: false, reason: "no transitions" }
}

/** Bulk recompute — useful after schema changes or for an admin
 *  back-fill. */
export async function recomputeAll(opts: { userId?: string; limit?: number } = {}) {
  const cap = Math.max(1, Math.min(2000, opts.limit ?? 1000))
  const rows = opts.userId
    ? await sql`
        SELECT id FROM crm_entries
        WHERE user_id = ${opts.userId} AND stage NOT IN ('committed','passed','in_diligence')
        ORDER BY updated_at ASC LIMIT ${cap}
      `
    : await sql`
        SELECT id FROM crm_entries
        WHERE stage NOT IN ('committed','passed','in_diligence')
        ORDER BY updated_at ASC LIMIT ${cap}
      `
  const summary: Record<string, number> = {}
  for (const r of rows as any[]) {
    const s = await syncCrmStageFromOutreach(r.id)
    const k = s.changed ? `${s.before} → ${s.after}` : "no-op"
    summary[k] = (summary[k] ?? 0) + 1
  }
  return { processed: rows.length, summary }
}

// ─── helpers ───────────────────────────────────────────────────────────
function canAdvance(from: CrmStage, to: CrmStage): boolean {
  // Allow transitions to the same or later stage; allow PASSED jump from anywhere.
  if (to === "passed") return true
  return STAGE_ORDER.indexOf(to) >= STAGE_ORDER.indexOf(from)
}

async function applyStage(crmEntryId: string, stage: CrmStage, reason: string) {
  await sql`
    UPDATE crm_entries SET
      stage = ${stage},
      last_contacted_at = COALESCE(last_contacted_at, CASE WHEN ${stage === "contacted"} THEN NOW() ELSE last_contacted_at END),
      updated_at = NOW()
    WHERE id = ${crmEntryId}
  `
  // Optional: log an audit row if we have a notes column convention.
  // Keep it lightweight for now.
  void reason
}
