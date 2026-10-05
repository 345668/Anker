/** Confirm, revoke and list send authorizations. docs/architecture/46 §4. The approval is the person's: the approver must be the sender. */
import { randomUUID } from "node:crypto"
import { sql } from "@/lib/db"
import { recordChange } from "@/lib/audit/record-change"
import { buildPreview, type Preview, type PreviewInput } from "./preview"
import { AUTH_EXPIRY_DAYS, TYPED_COUNT_ABOVE, VERDICT_TEXT } from "./model"

export class AuthorizationError extends Error { constructor(message: string, readonly status = 409) { super(message) } }
export interface Approver { userId: string; email?: string | null }

export interface ConfirmInput extends PreviewInput {
  /** The digest from the preview the person looked at. */
  digest: string
  /** Required when more than TYPED_COUNT_ABOVE messages: the number, typed by the person. */
  typedCount?: number
  source?: "manual_single" | "manual_batch" | "proposal"
  proposalId?: string | null
}

/**
 * Authorize exactly what the digest names. Recomputes the preview and refuses if the set changed since it was shown. Writes the authorization and its items
 * (blocked ones recorded as blocked, with the reason, so the person can see what was left out), queues the messages, and audits the approval.
 */
export async function confirmAuthorization(input: ConfirmInput, by: Approver): Promise<{ authorizationId: string; preview: Preview; authorized: number; blocked: number }> {
  if (by.userId !== input.userId) throw new AuthorizationError("Only the sender can approve sending from their own mailbox.", 403)
  const preview = await buildPreview({ ...input, mode: "send" })
  if (preview.error) throw new AuthorizationError(preview.error)
  if (preview.digest !== input.digest) throw new AuthorizationError("This batch changed since you looked at it. Review it again before approving.")
  if (!preview.sendable.length) throw new AuthorizationError("Nothing in this batch can be sent. " + (preview.blocked[0] ? `${preview.blocked[0].name}: ${VERDICT_TEXT[preview.blocked[0].verdict.code]}.` : ""))
  if (preview.requiresTypedCount && input.typedCount !== preview.count) throw new AuthorizationError(`To approve more than ${TYPED_COUNT_ABOVE} messages, type the number (${preview.count}) to confirm.`)

  const id = randomUUID()
  const expires = new Date(Date.now() + AUTH_EXPIRY_DAYS * 86_400_000).toISOString()
  const sendAfter = input.sendAfter ? new Date(input.sendAfter).toISOString() : new Date().toISOString()
  const summary = { count: preview.count, blocked: preview.blocked.length, countries: preview.countries, provider: preview.provider, accountEmail: preview.accountEmail, days: preview.cap.days }
  await sql`INSERT INTO send_authorizations (id, org_id, sender_user_id, provider, account_id, source, proposal_id, approved_by, expires_at, digest, summary)
    VALUES (${id}, ${input.orgId}, ${input.userId}, ${preview.provider}, ${preview.accountId}, ${input.source ?? (preview.count === 1 ? "manual_single" : "manual_batch")}, ${input.proposalId ?? null}, ${by.userId}, ${expires}, ${preview.digest}, ${JSON.stringify(summary)}::jsonb)`
  try {
    for (const i of preview.sendable) {
      await sql`INSERT INTO send_items (authorization_id, org_id, message_id, crm_entry_id, recipients, recipient_country, content_hash, send_after, idempotency_key)
        VALUES (${id}, ${input.orgId}, ${i.messageId}, ${i.entryId}, ${JSON.stringify({ to: i.to, cc: i.cc, bcc: i.bcc })}::jsonb, ${i.country}, ${i.contentHash}, ${sendAfter}, ${`anker-send/${id}/${i.messageId}`})`
    }
  } catch (e) {
    // A message got into another live authorization between the preview and now (the unique live index): nothing of this one stands.
    await sql`UPDATE send_authorizations SET status = 'revoked', revoked_at = now(), revoked_by = ${by.userId}, revoke_reason = 'could not be completed' WHERE id = ${id}`
    await sql`UPDATE send_items SET status = 'revoked' WHERE authorization_id = ${id} AND status = 'approved'`
    throw new AuthorizationError("A message in this batch was approved elsewhere at the same moment. Review it again.")
  }
  for (const i of preview.blocked) {
    if (!i.entryId) continue
    await sql`INSERT INTO send_items (authorization_id, org_id, message_id, crm_entry_id, recipients, content_hash, send_after, status, reason, idempotency_key)
      VALUES (${id}, ${input.orgId}, ${i.messageId}, ${i.entryId}, ${JSON.stringify({ to: i.to, cc: i.cc, bcc: i.bcc })}::jsonb, ${i.contentHash || "none"}, ${sendAfter}, 'blocked', ${VERDICT_TEXT[i.verdict.code] + (i.verdict.detail ? ` (${i.verdict.detail})` : "")}, ${`anker-send/${id}/${i.messageId}`})
      ON CONFLICT (authorization_id, message_id) DO NOTHING`
  }
  const ids = preview.sendable.map((i) => i.messageId)
  await sql`UPDATE outreach_messages SET status = 'queued', scheduled_for = ${sendAfter}, updated_at = now() WHERE id = ANY(${ids}) AND user_id = ${input.userId} AND status IN ('draft','approved','failed','queued')`
  await recordChange({ actor: by, scope: { type: "org", id: input.orgId }, action: "send_authorization.approved", target: { type: "send_authorization", id, label: `${preview.count} message${preview.count === 1 ? "" : "s"}` },
    before: null, after: { ...summary, expiresAt: expires, sendAfter }, context: { digest: preview.digest, typedCount: input.typedCount ?? null } })
  return { authorizationId: id, preview, authorized: preview.sendable.length, blocked: preview.blocked.length }
}

/** Stop what has not gone. The approver, a workspace owner or admin, or staff in an incident may revoke. Sent mail is never touched or claimed undone. */
export async function revokeAuthorization(orgId: string, id: string, by: Approver, reason: string): Promise<{ revoked: number; alreadySent: number; inFlight: number }> {
  const [a] = (await sql`SELECT id, status FROM send_authorizations WHERE id = ${id} AND org_id = ${orgId}`) as any[]
  if (!a) throw new AuthorizationError("Authorization not found.", 404)
  const items = (await sql`UPDATE send_items SET status = 'revoked', reason = ${reason.slice(0, 200) || "revoked"} WHERE authorization_id = ${id} AND status = 'approved' RETURNING message_id`) as any[]
  if (items.length) await sql`UPDATE outreach_messages SET status = 'draft', scheduled_for = NULL, updated_at = now() WHERE id = ANY(${items.map((i) => i.message_id)}) AND status = 'queued'`
  const [c] = (await sql`SELECT count(*) FILTER (WHERE status = 'sent')::int AS sent, count(*) FILTER (WHERE status IN ('sending','unknown'))::int AS flight FROM send_items WHERE authorization_id = ${id}`) as any[]
  if (a.status === "active") await sql`UPDATE send_authorizations SET status = 'revoked', revoked_by = ${by.userId}, revoked_at = now(), revoke_reason = ${reason.slice(0, 200) || null} WHERE id = ${id}`
  await recordChange({ actor: by, scope: { type: "org", id: orgId }, action: "send_authorization.revoked", target: { type: "send_authorization", id }, before: { status: a.status }, after: { status: "revoked", revokedUnsent: items.length, alreadySent: Number(c.sent) }, context: { reason } })
  return { revoked: items.length, alreadySent: Number(c.sent), inFlight: Number(c.flight) }
}

export async function listAuthorizations(orgId: string, opts: { senderUserId?: string; limit?: number } = {}) {
  const rows = (opts.senderUserId
    ? await sql`SELECT a.*, (SELECT count(*) FILTER (WHERE status = 'approved')::int FROM send_items WHERE authorization_id = a.id) AS waiting,
        (SELECT count(*) FILTER (WHERE status = 'sent')::int FROM send_items WHERE authorization_id = a.id) AS sent,
        (SELECT count(*) FILTER (WHERE status IN ('blocked','skipped','failed','unknown','revoked','expired'))::int FROM send_items WHERE authorization_id = a.id) AS not_sent
        FROM send_authorizations a WHERE a.org_id = ${orgId} AND a.sender_user_id = ${opts.senderUserId} ORDER BY a.approved_at DESC LIMIT ${opts.limit ?? 30}`
    : await sql`SELECT a.*, (SELECT count(*) FILTER (WHERE status = 'approved')::int FROM send_items WHERE authorization_id = a.id) AS waiting,
        (SELECT count(*) FILTER (WHERE status = 'sent')::int FROM send_items WHERE authorization_id = a.id) AS sent,
        (SELECT count(*) FILTER (WHERE status IN ('blocked','skipped','failed','unknown','revoked','expired'))::int FROM send_items WHERE authorization_id = a.id) AS not_sent
        FROM send_authorizations a WHERE a.org_id = ${orgId} ORDER BY a.approved_at DESC LIMIT ${opts.limit ?? 30}`) as any[]
  return rows.map((r) => ({ ...r, waiting: Number(r.waiting), sent: Number(r.sent), not_sent: Number(r.not_sent) }))
}

export async function authorizationItems(orgId: string, id: string) {
  return (await sql`SELECT i.id, i.message_id, i.status, i.reason, i.recipients, i.sent_at, i.send_after, i.attempts, m.subject FROM send_items i LEFT JOIN outreach_messages m ON m.id = i.message_id
    WHERE i.authorization_id = ${id} AND i.org_id = ${orgId} ORDER BY i.created_at LIMIT 500`) as any[]
}
