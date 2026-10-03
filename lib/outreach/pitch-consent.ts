/**
 * The owner's side of the country send-gate for the pitch-us flow (docs/architecture/37 section 8.3).
 *
 * When Anker emails investors for a founder's submission, no Anker user is the sender, so a recipient in a gated
 * country (Germany and the other EU/EEA states) is blocked and the entry records why. The platform owner can attest,
 * per recipient, to prior express consent or an existing relationship; that is stored under the platform sender, audited,
 * and the blocked entries for that address go back in the queue.
 */
import "server-only"
import { sql } from "@/lib/db"
import { recordConsent, PLATFORM_SENDER_ID, resolveRecipientCountry } from "@/lib/email/send-gate"
import { normEmail } from "@/lib/email/unsubscribe"
import { logAudit } from "@/lib/audit/audit-log"

const BLOCKED = "Not sent: % recipients need prior express consent%"

export interface BlockedRecipient { email: string; name: string | null; country: string | null; entries: number }

export async function listBlockedPitchRecipients(): Promise<BlockedRecipient[]> {
  const rows = (await sql`SELECT lower(investor_email) AS email, max(investor_name) AS name, count(*)::int AS entries
    FROM campaign_crm_entries WHERE stage = 'queued' AND send_error LIKE ${BLOCKED} AND investor_email IS NOT NULL
    GROUP BY 1 ORDER BY 3 DESC, 1 LIMIT 200`) as any[]
  const out: BlockedRecipient[] = []
  for (const r of rows) out.push({ email: r.email, name: r.name ?? null, entries: r.entries, country: await resolveRecipientCountry(r.email) })
  return out
}

export async function attestPitchConsent(owner: { id: string | null; email: string | null }, email: string, basis: "prior_express_consent" | "existing_customer", note: string | null): Promise<{ requeued: number }> {
  const e = normEmail(email)
  await recordConsent(PLATFORM_SENDER_ID, e, basis, note ? `${note} (attested by ${owner.email ?? "owner"})` : `attested by ${owner.email ?? "owner"}`)
  const rows = (await sql`UPDATE campaign_crm_entries SET send_error = NULL, updated_at = NOW()
    WHERE stage = 'queued' AND lower(investor_email) = ${e} AND send_error LIKE ${BLOCKED} RETURNING id`) as any[]
  await logAudit({ actorId: owner.id, actorEmail: owner.email, action: "outreach.pitch_consent", targetType: "email", targetLabel: e, metadata: { basis, requeued: rows.length } })
  return { requeued: rows.length }
}
