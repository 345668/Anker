/**
 * The send executor. docs/architecture/46 §4. Sends authorized items within caps and pacing, re-checking at the moment of sending everything that can have changed
 * since the approval: the text, the recipient's status, the contact's state, the gates, the sender's workspace. It never decides to send; it only carries out what a
 * person approved, and it stops the moment that approval no longer holds.
 */
import { randomUUID } from "node:crypto"
import { sql } from "@/lib/db"
import { classifySendError, describeDropped } from "@/lib/email/send-errors"
import { withSendAuthorization } from "./context"
import { backoffMinutes, contentHash, IDEMPOTENCY_SAFE_MS, MAX_ATTEMPTS, PER_TICK, STALE_SENDING_MS, stopReason, type Provider } from "./model"

/** The authorizations the executor sends. The others (a click-to-send path, an investor update, a reply, a platform wave) send inline and only record here. */
export const EXECUTOR_SOURCES = ["manual_single", "manual_batch", "proposal"]

export interface ExecDeps {
  now: () => Date
  paused: () => Promise<boolean>
  waveRemaining: (userId: string) => Promise<number>
  assertAllowed: (to: string, senderUserId: string) => Promise<void>
  resend: (input: any) => Promise<any>
  gmail: (input: any) => Promise<{ ok: true; result: any } | { ok: false; error: string }>
  loadGmail: (accountId: string) => Promise<any | null>
  syncCrm: (entryId: string) => Promise<unknown>
}
export const defaultExecDeps: ExecDeps = {
  now: () => new Date(),
  async paused() { try { return ((await sql`SELECT 1 FROM platform_flags WHERE key IN ('outreach_sending_paused','maintenance') AND enabled = true LIMIT 1`) as any[]).length > 0 } catch { return false } },
  async waveRemaining(userId) { return (await (await import("@/lib/outreach/send-gate")).waveCapRemaining(userId)).remaining },
  async assertAllowed(to, senderUserId) { await (await import("@/lib/email/send-gate")).assertOutreachAllowed({ to, senderUserId }) },
  async resend(input) { return (await import("@/lib/email/resend")).sendEmail(input) },
  async gmail(input) { return (await import("@/lib/email/gmail")).sendGmail(input) },
  async loadGmail(id) { return (await import("@/lib/email/gmail")).loadGmailAccount({ accountId: id }) },
  async syncCrm(id) { return (await import("@/lib/agents/crm-sync")).syncCrmStageFromOutreach(id) },
}

export interface ExecStats { paused: boolean; sent: number; blocked: number; skipped: number; failed: number; deferred: number; expired: number; recovered: number; unknown: number; held: string[] }
const newStats = (): ExecStats => ({ paused: false, sent: 0, blocked: 0, skipped: 0, failed: 0, deferred: 0, expired: 0, recovered: 0, unknown: 0, held: [] })

async function expireOld(stats: ExecStats) {
  const old = (await sql`UPDATE send_authorizations SET status = 'expired' WHERE status = 'active' AND expires_at < now() RETURNING id`) as any[]
  for (const a of old) {
    const items = (await sql`UPDATE send_items SET status = 'expired', reason = 'The approval expired before this was sent. Approve it again to send.' WHERE authorization_id = ${a.id} AND status = 'approved' RETURNING message_id`) as any[]
    if (items.length) await sql`UPDATE outreach_messages SET status = 'draft', scheduled_for = NULL, updated_at = now() WHERE id = ANY(${items.map((i) => i.message_id)}) AND status = 'queued'`
    stats.expired += items.length
  }
}

/** An item still `sending` after ten minutes was claimed by a run that died. Resend's idempotency key makes a retry safe for 23 hours; anything else is `unknown`, never guessed. */
async function recoverStale(now: Date, stats: ExecStats) {
  const stale = (await sql`SELECT i.id, i.claimed_at, a.provider, a.source FROM send_items i JOIN send_authorizations a ON a.id = i.authorization_id WHERE i.status = 'sending' AND i.claimed_at < ${new Date(now.getTime() - STALE_SENDING_MS).toISOString()}::timestamptz`) as any[]
  for (const s of stale) {
    const safe = EXECUTOR_SOURCES.includes(s.source) && s.provider === "resend" && now.getTime() - new Date(s.claimed_at).getTime() < IDEMPOTENCY_SAFE_MS
    if (safe) { await sql`UPDATE send_items SET status = 'approved', reason = 'Retrying after an interrupted attempt (the provider will not send it twice).' WHERE id = ${s.id} AND status = 'sending'`; stats.recovered++ }
    else { await sql`UPDATE send_items SET status = 'unknown', reason = 'An attempt was interrupted, so this may or may not have been sent. Check your Sent mail before sending it again.' WHERE id = ${s.id} AND status = 'sending'`; stats.unknown++ }
  }
}

/** A message that did not go returns to draft, so it can be edited and approved again. */
const backToDraft = (id: string) => sql`UPDATE outreach_messages SET status = 'draft', scheduled_for = NULL, updated_at = now() WHERE id = ${id} AND status IN ('queued','approved')`

async function revokeSiblings(authorizationId: string, entryId: string | null, exceptItem: string, why: string) {
  if (!entryId) return
  const sib = (await sql`UPDATE send_items SET status = 'revoked', reason = ${why} WHERE authorization_id = ${authorizationId} AND crm_entry_id = ${entryId} AND status = 'approved' AND id <> ${exceptItem} RETURNING message_id`) as any[]
  if (sib.length) await sql`UPDATE outreach_messages SET status = 'draft', scheduled_for = NULL, updated_at = now() WHERE id = ANY(${sib.map((s) => s.message_id)}) AND status = 'queued'`
}

type Outcome = "sent" | "blocked" | "skipped" | "failed" | "deferred" | "held" | "gone"

async function processItem(it: any, deps: ExecDeps): Promise<{ outcome: Outcome; held?: string }> {
  const now = deps.now()
  const mid = it.provider_message_id ?? `<${randomUUID()}@an-ker.de>`
  const [item] = (await sql`UPDATE send_items SET status = 'sending', attempts = attempts + 1, claimed_at = now(), provider_message_id = COALESCE(provider_message_id, ${mid})
    WHERE id = ${it.id} AND status = 'approved' RETURNING *`) as any[]
  if (!item) return { outcome: "gone" }
  const finish = async (status: "blocked" | "skipped" | "failed", reason: string, message?: string) => {
    await sql`UPDATE send_items SET status = ${status}, reason = ${reason} WHERE id = ${item.id}`
    if (message) await backToDraft(message)
    return { outcome: status as Outcome }
  }
  // A held sender or an unavailable mailbox did not try, so it costs no attempt; a transient provider failure did try, so it keeps the count.
  const release = async (reason: string, delayMin = 0, keepAttempt = false) => {
    await sql`UPDATE send_items SET status = 'approved', attempts = ${keepAttempt ? item.attempts : Math.max(0, item.attempts - 1)}, reason = ${reason}, send_after = ${new Date(now.getTime() + delayMin * 60_000).toISOString()}::timestamptz WHERE id = ${item.id}`
  }
  const [m] = (await sql`SELECT m.*, e.display_email, e.stage, e.display_name FROM outreach_messages m LEFT JOIN crm_entries e ON e.id = m.crm_entry_id WHERE m.id = ${item.message_id}`) as any[]
  if (!m) return finish("skipped", "The message no longer exists.")
  const rec = item.recipients as { to: string; cc: string[]; bcc: string[] }
  const to = String(m.email_to ?? m.display_email ?? "").trim()

  // 1. The text, the recipient and the mailbox are what the person approved.
  const now_hash = contentHash({ to, cc: rec.cc ?? [], bcc: rec.bcc ?? [], subject: String(m.subject ?? ""), body: String(m.body ?? ""), provider: it.provider as Provider, accountId: it.account_id ?? null, senderUserId: it.sender_user_id })
  if (now_hash !== item.content_hash) return finish("skipped", "Edited after it was approved, so it was not sent. Review it and approve it again.", item.message_id)

  // 2. The contact's state: a reply, a bounce, a pass or a pause stops this and the rest of that contact's sequence.
  const [facts] = (await sql`SELECT
      EXISTS (SELECT 1 FROM outreach_replies r WHERE r.crm_entry_id = ${item.crm_entry_id}) OR EXISTS (SELECT 1 FROM outreach_messages x WHERE x.crm_entry_id = ${item.crm_entry_id} AND x.user_id = ${it.sender_user_id} AND x.status IN ('replied','accepted')) AS replied,
      EXISTS (SELECT 1 FROM entity_memory em WHERE em.org_id = ${item.org_id} AND em.entity_type = 'crm_entry' AND em.entity_id = ${item.crm_entry_id} AND em.key = 'follow_up_paused' AND (em.valid_until IS NULL OR em.valid_until > now())) AS paused,
      EXISTS (SELECT 1 FROM outreach_messages d WHERE d.id <> ${item.message_id} AND d.user_id = ${it.sender_user_id} AND lower(d.email_to) = ${to.toLowerCase()} AND d.sent_at > now() - interval '24 hours') AS dup`) as any[]
  const stop = stopReason({ entryMissing: !m.display_name && !m.display_email && !m.stage, replied: !!facts?.replied, bouncedOrComplained: !!(m.bounced_at || m.complained_at), stagePassed: m.stage === "passed", followUpsPaused: !!facts?.paused, duplicateRecent: !!facts?.dup, kind: m.kind })
  if (stop) {
    const r = await finish("skipped", stop.reason, item.message_id)
    if (["already_replied", "bounced", "stage_passed", "follow_ups_paused", "not_found"].includes(stop.code)) await revokeSiblings(item.authorization_id, item.crm_entry_id, item.id, stop.reason)
    return r
  }

  // 3. The gates again: the opt-out, the country rule, the sender's workspace.
  try { await deps.assertAllowed(to, it.sender_user_id) } catch (e) {
    const c = classifySendError(e)
    if (c.kind === "skip") return finish("blocked", c.reason, item.message_id)
    if (c.kind === "stop") { await release(c.reason, 0); return { outcome: "held", held: c.reason } }
    await release(c.message, backoffMinutes(item.attempts), true); return { outcome: "deferred" }
  }

  // 4. The mailbox: a batch approved for one mailbox never falls back to another.
  let account: any = null
  if (it.provider === "gmail") {
    account = it.account_id ? await deps.loadGmail(it.account_id) : null
    if (!account || account.status !== "active" || account.user_id !== it.sender_user_id) { await release("The Gmail account is not connected. It will send when it is reconnected.", 30); return { outcome: "held", held: "The Gmail account is not connected." } }
  }

  // 5. Send. Threading as the old routes did: follow-ups reply to the first message.
  let inReplyTo: string | undefined
  if (m.kind !== "connection_request" && m.kind !== "email_intro") {
    const [p] = (await sql`SELECT email_message_id FROM outreach_messages WHERE user_id = ${it.sender_user_id} AND crm_entry_id = ${item.crm_entry_id} AND kind = 'connection_request' AND email_message_id IS NOT NULL LIMIT 1`) as any[]
    inReplyTo = p?.email_message_id || undefined
  }
  const trackingId = m.tracking_id ?? randomUUID()
  try {
    const out = await withSendAuthorization(item.authorization_id, async () => {
      if (it.provider === "gmail") {
        const g = await deps.gmail({ account, to, subject: m.subject, text: m.body, cc: rec.cc ?? [], bcc: rec.bcc ?? [], inReplyTo, trackingId, messageId: item.provider_message_id, via: "send-executor" })
        if (!g.ok) throw new Error(`gmail send failed: ${g.error}`)
        return { providerId: `gmail:${g.result.gmailId}`, messageId: g.result.messageId, from: g.result.finalFrom, subject: g.result.finalSubject, dropped: g.result.droppedRecipients }
      }
      const r = await deps.resend({ purpose: "outreach", senderUserId: it.sender_user_id, to, subject: m.subject, text: m.body, trackingId, inReplyTo, cc: rec.cc ?? [], bcc: rec.bcc ?? [],
        messageId: item.provider_message_id, idempotencyKey: item.idempotency_key, via: "send-executor" })
      return { providerId: r.resendId, messageId: r.messageId, from: r.finalFrom, subject: r.finalSubject, dropped: r.droppedRecipients }
    })
    const note = describeDropped(out.dropped)
    await sql`UPDATE send_items SET status = 'sent', sent_at = now(), provider_id = ${out.providerId}, provider_message_id = ${out.messageId}, reason = ${note} WHERE id = ${item.id}`
    await sql`UPDATE outreach_messages SET tracking_id = ${trackingId}, resend_id = ${out.providerId}, email_message_id = ${out.messageId}, email_from = ${out.from}, email_to = ${to}, subject = ${out.subject},
      status = 'sent', sent_at = now(), generated_by = COALESCE(generated_by, 'manual'), updated_at = now() WHERE id = ${item.message_id}`
    try { await sql`UPDATE outreach_campaign_members SET status = 'sent', sent_at = now(), updated_at = now() WHERE crm_entry_id = ${item.crm_entry_id} AND user_id = ${it.sender_user_id} AND status IN ('drafted','planned')` } catch { /* campaign bookkeeping only */ }
    try { await deps.syncCrm(item.crm_entry_id) } catch { /* the CRM stage catches up on the next sync */ }
    try { await sql`UPDATE crm_entries SET last_contacted_at = now(), updated_at = now() WHERE org_id = ${item.org_id} AND id = ${item.crm_entry_id}` } catch { /* best effort */ }
    return { outcome: "sent" }
  } catch (e) {
    const c = classifySendError(e)
    if (c.kind === "skip") return finish("blocked", c.reason, item.message_id)
    if (c.kind === "stop") { await release(c.reason, 0); return { outcome: "held", held: c.reason } }
    if (item.attempts >= MAX_ATTEMPTS) return finish("failed", `Not sent after ${MAX_ATTEMPTS} attempts: ${c.message}`.slice(0, 400))
    await release(c.message.slice(0, 300), backoffMinutes(item.attempts), true); return { outcome: "deferred" }
  }
}

async function completeFinished() {
  const done = (await sql`UPDATE send_authorizations a SET status = 'completed' WHERE a.status = 'active' AND NOT EXISTS (SELECT 1 FROM send_items i WHERE i.authorization_id = a.id AND i.status IN ('approved','sending')) AND EXISTS (SELECT 1 FROM send_items i WHERE i.authorization_id = a.id) RETURNING id`) as any[]
  return done.length
}

export async function runExecutor(deps: ExecDeps = defaultExecDeps, opts: { authorizationId?: string; max?: number } = {}): Promise<ExecStats> {
  const stats = newStats(), now = deps.now()
  if (await deps.paused()) { stats.paused = true; return stats }
  await expireOld(stats); await recoverStale(now, stats)
  const due = (opts.authorizationId
    ? await sql`SELECT i.*, a.sender_user_id, a.provider, a.account_id FROM send_items i JOIN send_authorizations a ON a.id = i.authorization_id
        WHERE i.authorization_id = ${opts.authorizationId} AND i.status = 'approved' AND i.send_after <= ${now.toISOString()}::timestamptz AND a.status = 'active' AND a.expires_at > now() AND a.source = ANY(${EXECUTOR_SOURCES}) ORDER BY i.created_at LIMIT 500`
    : await sql`SELECT i.*, a.sender_user_id, a.provider, a.account_id FROM send_items i JOIN send_authorizations a ON a.id = i.authorization_id
        WHERE i.status = 'approved' AND i.send_after <= ${now.toISOString()}::timestamptz AND a.status = 'active' AND a.expires_at > now() AND a.source = ANY(${EXECUTOR_SOURCES}) ORDER BY a.approved_at, i.created_at LIMIT 500`) as any[]
  const bySender = new Map<string, any[]>()
  for (const d of due) bySender.set(d.sender_user_id, [...(bySender.get(d.sender_user_id) ?? []), d])
  for (const [sender, list] of bySender) {
    const room = Math.min(await deps.waveRemaining(sender), opts.max ?? PER_TICK)
    stats.deferred += Math.max(0, list.length - room) // beyond today's cap or this tick's pace: they wait, approved
    let held = false
    for (const it of list.slice(0, room)) {
      if (held) { stats.deferred++; continue }
      const r = await processItem(it, deps)
      if (r.outcome === "held") { held = true; stats.held.push(r.held ?? "held"); continue }
      if (r.outcome === "sent") stats.sent++; else if (r.outcome === "blocked") stats.blocked++; else if (r.outcome === "skipped") stats.skipped++; else if (r.outcome === "failed") stats.failed++; else if (r.outcome === "deferred") stats.deferred++
    }
  }
  await completeFinished()
  return stats
}
