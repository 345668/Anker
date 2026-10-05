/**
 * The preview: everything a person must see before approving a send (docs/architecture/46 §4, principle 8). It evaluates every recipient, including cc and bcc,
 * through the same gates the sender will use, says what will be refused and why, and returns a digest of exactly the sendable set so a confirm can prove it is for
 * what was shown. It writes nothing.
 */
import { sql } from "@/lib/db"
import { checkDeliverability, waveCapRemaining, DAILY_CAP } from "@/lib/outreach/send-gate"
import { isGloballySuppressed } from "@/lib/email/unsubscribe"
import { GATED_COUNTRIES, hasConsent, resolveRecipientCountry } from "@/lib/email/send-gate"
import { isEmailSuppressed } from "@/lib/outreach/deliverability"
import { contentHash, daysNeeded, digestOf, needsTypedCount, MAX_AUTHORIZED_PER_BATCH, type Provider, type Verdict, type VerdictCode } from "./model"

export interface PreviewInput { orgId: string; userId: string; messageIds: string[]; provider?: Provider; accountId?: string | null; sendAfter?: string | null; mode?: "send" | "test" }
export interface PreviewItem {
  messageId: string; entryId: string | null; name: string; to: string; cc: string[]; bcc: string[]; subject: string; kind: string
  body: string; step: number; country: string | null; verdict: Verdict; contentHash: string
  /** cc and bcc addresses the providers will leave out when sending (opted out, or needing consent). */
  droppedSecondary: Array<{ email: string; field: "cc" | "bcc"; reason: "suppressed" | "country_gated" }>
}
export interface Preview {
  provider: Provider; accountId: string | null; accountEmail: string | null; mode: "send" | "test"; sendAfter: string | null
  items: PreviewItem[]; sendable: PreviewItem[]; blocked: PreviewItem[]
  countries: Record<string, number>
  cap: { daily: number; sentToday: number; remaining: number; days: number }
  digest: string; requiresTypedCount: boolean; count: number
  /** A reason the whole batch cannot be authorized (no mailbox, too many), or null. */
  error: string | null
}

const SENT = ["sent", "delivered", "replied", "accepted"]
const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : typeof v === "string" ? (() => { try { const j = JSON.parse(v); return Array.isArray(j) ? j.map(String) : [] } catch { return [] } })() : [])

/** The mailbox a batch goes through: an explicit choice, else the campaign's default, else the sender's own default Gmail, else Resend. */
export async function resolveMailbox(userId: string, provider: Provider | undefined, accountId: string | null | undefined, entryIds: string[]): Promise<{ provider: Provider; accountId: string | null; accountEmail: string | null; error: string | null }> {
  let prov: Provider = provider ?? "resend", acct: string | null = accountId ?? null
  if (!provider && entryIds.length) {
    const [camp] = (await sql`SELECT c.default_send_provider, c.default_send_account_id FROM outreach_campaign_members m JOIN outreach_campaigns c ON c.id = m.campaign_id
      WHERE m.crm_entry_id = ANY(${entryIds}) AND m.user_id = ${userId} AND c.default_send_provider = 'gmail' AND c.default_send_account_id IS NOT NULL LIMIT 1`) as any[]
    if (camp) { prov = "gmail"; acct = camp.default_send_account_id }
  }
  if (prov === "gmail" && !acct && entryIds.length) {
    const [camp] = (await sql`SELECT c.default_send_account_id FROM outreach_campaign_members m JOIN outreach_campaigns c ON c.id = m.campaign_id
      WHERE m.crm_entry_id = ANY(${entryIds}) AND m.user_id = ${userId} AND c.default_send_provider = 'gmail' AND c.default_send_account_id IS NOT NULL LIMIT 1`) as any[]
    if (camp) acct = camp.default_send_account_id
  }
  if (prov === "resend") return { provider: "resend", accountId: null, accountEmail: null, error: null }
  const [a] = (acct
    ? await sql`SELECT id, user_id, email, status FROM email_oauth_accounts WHERE id = ${acct} LIMIT 1`
    : await sql`SELECT id, user_id, email, status FROM email_oauth_accounts WHERE user_id = ${userId} AND is_default = true AND status = 'active' LIMIT 1`) as any[]
  if (!a) return { provider: "gmail", accountId: null, accountEmail: null, error: "No Gmail account connected. Connect one in Settings, or send through Resend." }
  if (a.user_id !== userId) return { provider: "gmail", accountId: a.id, accountEmail: a.email, error: "That mailbox belongs to another user." }
  if (a.status !== "active") return { provider: "gmail", accountId: a.id, accountEmail: a.email, error: `That mailbox needs reconnecting (status: ${a.status}).` }
  return { provider: "gmail", accountId: a.id, accountEmail: a.email, error: null }
}

export async function recipientVerdict(to: string, senderUserId: string): Promise<{ verdict: Verdict; country: string | null }> {
  const addr = checkDeliverability(to)
  if (!addr.ok) return { verdict: { code: "bad_address", detail: addr.reason }, country: null }
  if ((await isGloballySuppressed(to)) || (await isEmailSuppressed(senderUserId, to))) return { verdict: { code: "suppressed" }, country: null }
  const country = await resolveRecipientCountry(to)
  if ((process.env.OUTREACH_COUNTRY_GATE ?? "on").toLowerCase() !== "off" && country && GATED_COUNTRIES.has(country) && !(await hasConsent(senderUserId, to))) return { verdict: { code: "country_gated", detail: country }, country }
  return { verdict: { code: "ok" }, country }
}

export async function buildPreview(input: PreviewInput): Promise<Preview> {
  const mode = input.mode ?? "send", ids = [...new Set(input.messageIds)]
  const empty = (error: string, mb?: Awaited<ReturnType<typeof resolveMailbox>>): Preview => ({ provider: mb?.provider ?? input.provider ?? "resend", accountId: mb?.accountId ?? null, accountEmail: mb?.accountEmail ?? null, mode, sendAfter: input.sendAfter ?? null,
    items: [], sendable: [], blocked: [], countries: {}, cap: { daily: DAILY_CAP, sentToday: 0, remaining: DAILY_CAP, days: 0 }, digest: "", requiresTypedCount: false, count: 0, error })
  if (!ids.length) return empty("Choose at least one message.")
  if (ids.length > MAX_AUTHORIZED_PER_BATCH) return empty(`At most ${MAX_AUTHORIZED_PER_BATCH} messages per approval. Approve in batches.`)

  const rows = (await sql`SELECT m.id, m.user_id, m.crm_entry_id, m.kind, m.step_number, m.channel, m.status, m.subject, m.body, m.email_to, m.bounced_at, m.complained_at, e.display_email, e.display_name, e.stage
    FROM outreach_messages m JOIN crm_entries e ON e.id = m.crm_entry_id WHERE m.id = ANY(${ids}) AND e.org_id = ${input.orgId}`) as any[]
  const entryIds = rows.map((r) => r.crm_entry_id)
  const mb = await resolveMailbox(input.userId, input.provider, input.accountId, entryIds)
  if (mb.error) return empty(mb.error, mb)

  // Copies come from the campaigns each contact is enrolled in, as the old send routes did.
  const camps = entryIds.length ? (await sql`SELECT m.crm_entry_id, c.cc_emails, c.bcc_emails FROM outreach_campaign_members m JOIN outreach_campaigns c ON c.id = m.campaign_id
    WHERE m.crm_entry_id = ANY(${entryIds}) AND m.user_id = ${input.userId}`) as any[] : []
  const copies = (entry: string, f: "cc_emails" | "bcc_emails") => [...new Set(camps.filter((c) => c.crm_entry_id === entry).flatMap((c) => asList(c[f])))]
  const replied = new Set(entryIds.length ? ((await sql`SELECT DISTINCT crm_entry_id FROM outreach_replies WHERE crm_entry_id = ANY(${entryIds})`) as any[]).map((r) => r.crm_entry_id) : [])
  const live = new Set(((await sql`SELECT message_id FROM send_items WHERE message_id = ANY(${ids}) AND status IN ('approved','sending')`) as any[]).map((r) => r.message_id))
  const paused = new Set(entryIds.length ? ((await sql`SELECT entity_id FROM entity_memory WHERE org_id = ${input.orgId} AND entity_type = 'crm_entry' AND entity_id = ANY(${entryIds}) AND key = 'follow_up_paused' AND (valid_until IS NULL OR valid_until > now())`) as any[]).map((r) => r.entity_id) : [])

  const byId = new Map(rows.map((r) => [r.id, r]))
  const items: PreviewItem[] = []
  for (const id of ids) {
    const r = byId.get(id)
    if (!r) { items.push({ messageId: id, entryId: null, name: "Unknown", to: "", cc: [], bcc: [], subject: "", kind: "", body: "", step: 0, country: null, verdict: { code: "not_found" }, contentHash: "", droppedSecondary: [] }); continue }
    const to = String(r.email_to ?? r.display_email ?? "").trim(), subject = String(r.subject ?? "").trim(), body = String(r.body ?? "")
    const cc = copies(r.crm_entry_id, "cc_emails"), bcc = copies(r.crm_entry_id, "bcc_emails")
    let verdict: Verdict = { code: "ok" }, country: string | null = null
    const set = (code: VerdictCode, detail?: string) => { if (verdict.code === "ok") verdict = { code, detail } }
    if (r.user_id !== input.userId) set("wrong_sender")
    else if (r.channel !== "email") set("not_email")
    else if (r.status === "cancelled") set("cancelled")
    else if (SENT.includes(r.status) && !live.has(id)) set(r.status === "replied" ? "already_replied" : "already_sent")
    else if (live.has(id)) set("in_other_authorization")
    else if (!to) set("no_recipient")
    else if (!subject) set("no_subject")
    else if (!body.trim()) set("no_body")
    else if (r.bounced_at || r.complained_at) set("bounced")
    else if (r.kind !== "reply" && replied.has(r.crm_entry_id)) set("already_replied")
    else if (r.stage === "passed") set("stage_passed")
    else if (paused.has(r.crm_entry_id)) set("follow_ups_paused")
    if (verdict.code === "ok") { const g = await recipientVerdict(to, input.userId); country = g.country; if (g.verdict.code !== "ok") verdict = g.verdict }
    // What the providers will leave out of cc and bcc, so the person knows before it happens.
    let dropped: PreviewItem["droppedSecondary"] = []
    if (verdict.code === "ok" && (cc.length || bcc.length)) dropped = (await (await import("@/lib/email/send-gate")).filterSecondaryRecipients({ cc, bcc, senderUserId: input.userId })).dropped
    items.push({ messageId: id, entryId: r.crm_entry_id, name: r.display_name ?? to, to, cc, bcc, subject, kind: r.kind, body, step: Number(r.step_number ?? 0), country, verdict, droppedSecondary: dropped,
      contentHash: contentHash({ to, cc, bcc, subject, body, provider: mb.provider, accountId: mb.accountId, senderUserId: input.userId }) })
  }
  // One message per address per batch: the old bulk send blasted a contact's whole four-step sequence at once. The first step goes now; the rest wait for their own approval.
  const firstFor = new Map<string, PreviewItem>()
  for (const i of items.filter((x) => x.verdict.code === "ok")) { const k = i.to.toLowerCase(), cur = firstFor.get(k); if (!cur || i.step < cur.step) firstFor.set(k, i) }
  for (const i of items) if (i.verdict.code === "ok" && firstFor.get(i.to.toLowerCase()) !== i) i.verdict = { code: "duplicate_in_batch" }
  const sendable = items.filter((i) => i.verdict.code === "ok"), blocked = items.filter((i) => i.verdict.code !== "ok")
  const countries: Record<string, number> = {}
  for (const i of sendable) countries[i.country ?? "unknown"] = (countries[i.country ?? "unknown"] ?? 0) + 1
  const wave = await waveCapRemaining(input.userId)
  return { provider: mb.provider, accountId: mb.accountId, accountEmail: mb.accountEmail, mode, sendAfter: input.sendAfter ?? null, items, sendable, blocked, countries,
    cap: { daily: wave.cap, sentToday: wave.sentToday, remaining: wave.remaining, days: daysNeeded(sendable.length, wave.remaining, wave.cap) },
    digest: digestOf(sendable.map((i) => ({ messageId: i.messageId, contentHash: i.contentHash })), { provider: mb.provider, accountId: mb.accountId, mode, sendAfter: input.sendAfter ?? null }),
    requiresTypedCount: needsTypedCount(sendable.length), count: sendable.length, error: null }
}
