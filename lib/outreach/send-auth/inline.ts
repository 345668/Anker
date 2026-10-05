/**
 * Authorizations for the sends that happen inline: a click that sends at once and has no stored draft to approve (a one-off email, a reply, an investor update, a
 * platform campaign wave). The person's click, or the platform owner's standing setting, is the approval; this records it (who, the exact recipients and a hash of the
 * text, the mailbox, when) BEFORE anything is sent, and puts the sending code under `withSendAuthorization`, so the provider can tell the send is authorized and
 * enforcement can later refuse every send that is not. docs/architecture/46 §17. If the record cannot be written, nothing is sent.
 */
import { randomUUID } from "node:crypto"
import { sql } from "@/lib/db"
import { recordChange } from "@/lib/audit/record-change"
import { classifySendError } from "@/lib/email/send-errors"
import { withSendAuthorization } from "./context"
import { contentHash, digestOf, type Provider } from "./model"

export type InlineSource = "direct" | "reply" | "platform_wave" | "investor_update" | "manual_single" | "linkedin"
export interface InlineItem { ref: string; to: string; cc?: string[]; bcc?: string[]; subject: string; body: string; entryId?: string | null }
export interface Opened { id: string; reused: boolean }
export interface Settle { status: "sent" | "blocked" | "skipped" | "failed"; reason?: string | null; providerId?: string | null; providerMessageId?: string | null }

const hashOf = (i: InlineItem, provider: Provider, accountId: string | null, sender: string) =>
  contentHash({ to: i.to, cc: i.cc ?? [], bcc: i.bcc ?? [], subject: i.subject, body: i.body, provider, accountId, senderUserId: sender })

/**
 * Record an approval. `key` makes it reusable (an investor update retried over several requests keeps one authorization); `itemStatus` is `sending` for a send that
 * starts now and `approved` for items a loop will claim one by one. Throws if the record cannot be written.
 */
export async function openAuthorization(o: { orgId: string; senderUserId: string; approvedBy: string; source: InlineSource; provider?: Provider; accountId?: string | null; items: InlineItem[]; key?: string; expiresHours?: number; itemStatus?: "sending" | "approved"; summary?: Record<string, unknown>; actor?: { userId: string; email?: string | null } }): Promise<Opened> {
  const provider = o.provider ?? "resend", accountId = o.accountId ?? null
  if (o.key) {
    const [ex] = (await sql`SELECT id FROM send_authorizations WHERE source = ${o.source} AND proposal_id = ${o.key} AND org_id = ${o.orgId} AND status = 'active' AND expires_at > now() LIMIT 1`) as any[]
    if (ex) return { id: ex.id, reused: true }
  }
  const id = randomUUID()
  const hashes = o.items.map((i) => ({ messageId: i.ref, contentHash: hashOf(i, provider, accountId, o.senderUserId) }))
  const expires = new Date(Date.now() + (o.expiresHours ?? 24) * 3_600_000).toISOString()
  await sql`INSERT INTO send_authorizations (id, org_id, sender_user_id, provider, account_id, source, proposal_id, approved_by, expires_at, digest, summary)
    VALUES (${id}, ${o.orgId}, ${o.senderUserId}, ${provider}, ${accountId}, ${o.source}, ${o.key ?? null}, ${o.approvedBy}, ${expires}, ${digestOf(hashes, { provider, accountId, mode: "send", sendAfter: null })}, ${JSON.stringify({ count: o.items.length, ...(o.summary ?? {}) })}::jsonb)`
  for (let n = 0; n < o.items.length; n++) {
    const i = o.items[n], status = o.itemStatus ?? "sending"
    await sql`INSERT INTO send_items (authorization_id, org_id, message_id, crm_entry_id, recipients, content_hash, status, claimed_at, idempotency_key)
      VALUES (${id}, ${o.orgId}, ${i.ref}, ${i.entryId ?? null}, ${JSON.stringify({ to: i.to, cc: i.cc ?? [], bcc: i.bcc ?? [] })}::jsonb, ${hashes[n].contentHash}, ${status}, ${status === "sending" ? new Date().toISOString() : null}, ${`anker-inline/${id}/${i.ref}`})`
  }
  if (o.actor) await recordChange({ actor: o.actor, scope: { type: "org", id: o.orgId }, action: "send_authorization.approved", target: { type: "send_authorization", id, label: `${o.items.length} message${o.items.length === 1 ? "" : "s"} (${o.source})` },
    before: null, after: { source: o.source, count: o.items.length, provider }, context: { via: o.source } })
  return { id, reused: false }
}

export async function markSending(authorizationId: string, ref: string): Promise<boolean> {
  const rows = (await sql`UPDATE send_items SET status = 'sending', claimed_at = now(), attempts = attempts + 1 WHERE authorization_id = ${authorizationId} AND message_id = ${ref} AND status IN ('approved','failed') RETURNING id`) as any[]
  return rows.length > 0
}

export async function settleItem(authorizationId: string, ref: string, s: Settle): Promise<void> {
  await sql`UPDATE send_items SET status = ${s.status}, reason = ${s.reason ?? null}, provider_id = ${s.providerId ?? null}, provider_message_id = COALESCE(${s.providerMessageId ?? null}, provider_message_id), sent_at = ${s.status === "sent" ? new Date().toISOString() : null}::timestamptz
    WHERE authorization_id = ${authorizationId} AND message_id = ${ref}`
}

/** Close the authorization once nothing in it is waiting or being sent. */
export async function closeAuthorization(authorizationId: string): Promise<void> {
  await sql`UPDATE send_authorizations SET status = 'completed' WHERE id = ${authorizationId} AND status = 'active'
    AND NOT EXISTS (SELECT 1 FROM send_items WHERE authorization_id = ${authorizationId} AND status IN ('approved','sending'))`
}

export interface InlineOutcome<T> { ref: string; status: "sent" | "blocked" | "failed"; error?: unknown; value?: T }

/** Approve and send, one item at a time, under the authorization. The original error of a failed item is returned so the caller can report it as before. */
export async function sendUnderAuthorization<T>(o: Parameters<typeof openAuthorization>[0] & { send: (item: InlineItem, authorizationId: string) => Promise<T & { providerId?: string | null; providerMessageId?: string | null; note?: string | null }> }): Promise<{ authorizationId: string; outcomes: Array<InlineOutcome<T>> }> {
  const { id } = await openAuthorization({ ...o, itemStatus: "sending" })
  const outcomes: Array<InlineOutcome<T>> = []
  for (const item of o.items) {
    try {
      const value = await withSendAuthorization(id, () => o.send(item, id))
      await settleItem(id, item.ref, { status: "sent", providerId: (value as any)?.providerId ?? null, providerMessageId: (value as any)?.providerMessageId ?? null, reason: (value as any)?.note ?? null })
      outcomes.push({ ref: item.ref, status: "sent", value })
    } catch (error) {
      const c = classifySendError(error)
      const status = c.kind === "skip" ? "blocked" : "failed"
      await settleItem(id, item.ref, { status, reason: (c.kind === "fail" ? c.message : c.reason).slice(0, 400) }).catch(() => {})
      outcomes.push({ ref: item.ref, status, error })
    }
  }
  await closeAuthorization(id).catch(() => {})
  return { authorizationId: id, outcomes }
}
