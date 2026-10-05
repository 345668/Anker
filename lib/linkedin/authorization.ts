/**
 * LinkedIn actions under the same send-authorization record as email (docs/architecture/46 §18). The queue's hard SQL gate is unchanged (the extension claims only
 * `queued` rows); this adds the record: who approved which exact action (target, kind, text, sender), when, with an expiry, a way to revoke, the platform pause, and
 * the settled outcome from the extension's report. One item per action; the item reference is the action id. The extension is the executor, so nothing here sends.
 */
import { sql } from "@/lib/db"
import { contentHash } from "@/lib/outreach/send-auth/model"
import { openAuthorization, settleItem, closeAuthorization } from "@/lib/outreach/send-auth/inline"

const EXPIRY_HOURS = 7 * 24
export interface ApprovedAction { id: string; user_id?: string; crm_entry_id: string | null; sender_id: string | null; target_url: string; action_type: string; payload: any; approved_by?: string | null }

/** What the person approved: the target, the kind of action, the text and the LinkedIn account it goes from. A different hash at claim time means it does not go. */
export const actionHash = (a: Pick<ApprovedAction, "target_url" | "action_type" | "sender_id" | "payload">, userId: string) =>
  contentHash({ to: a.target_url, cc: [], bcc: [], subject: `${a.action_type}|${a.sender_id ?? ""}`, body: String(a.payload?.message ?? ""), provider: "linkedin", accountId: null, senderUserId: userId })

/** Record approvals (a person's, or a campaign's auto-approve rule) before the actions become claimable. Throws if the record cannot be written. */
export async function recordLinkedInApprovals(userId: string, actions: ApprovedAction[], approvedBy: string, fallbackApprover?: string): Promise<void> {
  if (!actions.length) return
  const entries = actions.map((a) => a.crm_entry_id).filter(Boolean) as string[]
  const orgOf = new Map<string, string>()
  if (entries.length) for (const r of (await sql`SELECT id, org_id FROM crm_entries WHERE id = ANY(${entries})`) as any[]) if (r.org_id) orgOf.set(r.id, r.org_id)
  const groups = new Map<string, ApprovedAction[]>()
  for (const a of actions) { const k = `${(a.crm_entry_id && orgOf.get(a.crm_entry_id)) || `linkedin:${userId}`}\u0000${a.approved_by ?? approvedBy ?? fallbackApprover ?? userId}`; groups.set(k, [...(groups.get(k) ?? []), a]) }
  for (const [k, list] of groups) {
    const [orgId, by] = k.split("\u0000")
    await openAuthorization({ orgId, senderUserId: userId, approvedBy: by, source: "linkedin", provider: "linkedin", itemStatus: "approved", expiresHours: EXPIRY_HOURS, summary: { channel: "linkedin" },
      items: list.map((a) => ({ ref: a.id, to: a.target_url, subject: `${a.action_type}|${a.sender_id ?? ""}`, body: String(a.payload?.message ?? ""), entryId: a.crm_entry_id })) })
  }
}

/** Actions queued before P4 have no record: write it from their own approval columns, so the claim rule can hold for every queued action. */
export async function backfillQueued(userId: string): Promise<number> {
  const rows = (await sql`SELECT id, crm_entry_id, sender_id, target_url, action_type, payload, approved_by FROM li_action_queue q
    WHERE user_id = ${userId} AND status = 'queued'
      AND NOT EXISTS (SELECT 1 FROM send_items i WHERE i.message_id = q.id AND i.status IN ('approved','sending'))
    LIMIT 200`) as any[]
  await recordLinkedInApprovals(userId, rows, userId)
  return rows.length
}

export async function sendingPaused(): Promise<boolean> {
  try { return ((await sql`SELECT 1 FROM platform_flags WHERE key IN ('outreach_sending_paused','maintenance') AND enabled = true LIMIT 1`) as any[]).length > 0 } catch { return false }
}

/** Items follow the action: claimed → sending. */
export async function markClaimed(ids: string[]): Promise<void> {
  if (ids.length) await sql`UPDATE send_items SET status = 'sending', claimed_at = now(), attempts = attempts + 1 WHERE message_id = ANY(${ids}) AND status = 'approved' AND authorization_id IN (SELECT id FROM send_authorizations WHERE source = 'linkedin')`
}

/** The extension's report (or a stale claim being recovered) settles the item. */
export async function settleActions(ids: string[], s: { status: "sent" | "failed" | "approved"; reason?: string | null }): Promise<void> {
  if (!ids.length) return
  const items = (await sql`SELECT i.authorization_id, i.message_id FROM send_items i JOIN send_authorizations a ON a.id = i.authorization_id WHERE i.message_id = ANY(${ids}) AND i.status = 'sending' AND a.source = 'linkedin'`) as any[]
  for (const it of items) {
    if (s.status === "approved") await sql`UPDATE send_items SET status = 'approved', reason = ${s.reason ?? null} WHERE authorization_id = ${it.authorization_id} AND message_id = ${it.message_id}`
    else await settleItem(it.authorization_id, it.message_id, { status: s.status, reason: s.reason ?? null })
    await closeAuthorization(it.authorization_id).catch(() => {})
  }
}

/** Revoked or expired authorizations: their still-queued actions go back to waiting for approval, so the extension cannot claim them. */
export async function returnToApproval(actionIds: string[]): Promise<void> {
  if (actionIds.length) await sql`UPDATE li_action_queue SET status = 'pending_approval', approved_by = NULL, approved_at = NULL, updated_at = now() WHERE id = ANY(${actionIds}) AND status = 'queued'`
}
