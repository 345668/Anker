/**
 * Deliverability — bounce/complaint handling + the email suppression list.
 * P1-7 of docs/founder-outreach-audit.md.
 *
 *   • suppressEmail / isEmailSuppressed — the do-not-send list
 *   • stopSequenceForEntry — hard-stop a CRM entry's sequence on a bad event
 *   • syncMessageEvent — pull one message's Resend status, fold it in, and
 *     apply bounce/complaint actions. Shared by the manual sync route and the
 *     system deliverability cron.
 */
import "server-only"
import { sql } from "@/lib/db"
import { getResendEmail } from "@/lib/email/resend"

export async function suppressEmail(
  userId: string | null,
  email: string,
  reason: string,
  source = "resend",
): Promise<void> {
  const e = (email || "").trim().toLowerCase()
  if (!e) return
  try {
    await sql`
      INSERT INTO email_suppressions (user_id, email, reason, source, created_at)
      VALUES (${userId}, ${e}, ${reason}, ${source}, NOW())
      ON CONFLICT (user_id, lower(email)) DO NOTHING
    `
  } catch {
    /* table may not exist in some environments — never block a send path on it */
  }
}

/** Is this address on the do-not-send list (user-scoped or global)? */
export async function isEmailSuppressed(userId: string | null, email: string): Promise<boolean> {
  const e = (email || "").trim().toLowerCase()
  if (!e) return false
  try {
    const rows = (await sql`
      SELECT 1 FROM email_suppressions
      WHERE lower(email) = ${e} AND (user_id = ${userId} OR user_id IS NULL)
      LIMIT 1
    `) as any[]
    return rows.length > 0
  } catch {
    return false
  }
}

/** Hard-stop a sequence: cancel unsent steps and clear pending follow-ups. */
export async function stopSequenceForEntry(userId: string, crmEntryId: string): Promise<void> {
  await sql`
    UPDATE outreach_messages SET status = 'cancelled', updated_at = NOW()
    WHERE user_id = ${userId} AND crm_entry_id = ${crmEntryId} AND status IN ('draft','queued')
  `
  await sql`
    UPDATE outreach_messages SET needs_followup = false, followup_due_at = NULL, updated_at = NOW()
    WHERE user_id = ${userId} AND crm_entry_id = ${crmEntryId}
      AND (needs_followup = true OR followup_due_at IS NOT NULL)
  `
}

/** Bounce/complaint → suppress the address + stop the entry's sequence. No-op otherwise. */
export async function applyDeliverabilityEvent(
  userId: string | null,
  crmEntryId: string | null,
  email: string,
  event: string | null,
): Promise<void> {
  if (event !== "bounced" && event !== "complained") return
  await suppressEmail(userId, email, event)
  if (userId && crmEntryId) await stopSequenceForEntry(userId, crmEntryId)
}

export interface SyncRow {
  id: string
  resendId: string
  userId: string | null
  crmEntryId: string | null
  emailTo: string | null
}

/**
 * Pull one message's latest Resend event, fold it into outreach_messages, and
 * apply bounce/complaint actions. Returns the event string (or null).
 */
export async function syncMessageEvent(row: SyncRow): Promise<string | null> {
  const status = await getResendEmail(row.resendId)
  const ev = status?.lastEvent ?? null
  await sql`
    UPDATE outreach_messages SET
      resend_last_event = coalesce(${ev}, resend_last_event),
      delivered_at = case
        when ${ev === "delivered" || ev === "opened" || ev === "clicked"} and delivered_at is null
        then now() else delivered_at end,
      opens = case
        when ${ev === "opened" || ev === "clicked"} then greatest(coalesce(opens, 0), 1)
        else opens end,
      clicks = case
        when ${ev === "clicked"} then greatest(coalesce(clicks, 0), 1)
        else clicks end,
      bounced_at = case
        when ${ev === "bounced"} and bounced_at is null then now() else bounced_at end,
      failed_reason = case
        when ${ev === "bounced"} and failed_reason is null then 'bounced (resend)'
        else failed_reason end,
      complained_at = case
        when ${ev === "complained"} and complained_at is null then now() else complained_at end,
      last_resend_sync_at = now(),
      updated_at = now()
    WHERE id = ${row.id}
  `
  if (ev === "bounced" || ev === "complained") {
    await applyDeliverabilityEvent(row.userId, row.crmEntryId, row.emailTo ?? "", ev).catch(() => {})
  }
  return ev
}
