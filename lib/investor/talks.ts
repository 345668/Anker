/**
 * Talks between an investor and a fund (docs/architecture/65): a plain-text thread per relationship, open only once the fund has accepted, with mute and block,
 * notifications that carry no content, and the daily nudges. A side reads only its own relationships' threads.
 */
import { sql } from "@/lib/db"
import { EMAILS } from "./legal"
import { InvestorError, relationshipEntityIds, type Need } from "./profile"
import { checkFiles, MAX_TOTAL_BYTES, type UploadedFile } from "./attachments"
import { enforceScan, scanningActive } from "./scan"
import { decryptBytes, encryptBytes } from "@/lib/db/secrets"

export const MESSAGE_MAX = 4000, MESSAGES_PER_HOUR = 30, NOTIFY_EVERY_MIN = 60
export const WRITABLE = ["in_talks", "invited_to_onboard", "onboarding", "active"] as const
export type Side = "investor" | "fund"

export interface AttachmentView { id: string; filename: string; sizeBytes: number; contentType: string }
export interface MessageView { id: string; from: Side; body: string; at: string; read: boolean; attachments: AttachmentView[] }
export interface ThreadView { scanning: boolean; relationshipId: string; stage: string; writable: boolean; muted: boolean; blocked: boolean; messages: MessageView[] }

const appUrl = () => (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.an-ker.de").replace(/\/$/, "")
const notFound = () => new InvestorError("That conversation was not found.", 404, "not_found")

/** The relationship, if this side owns it. */
export async function own(side: Side, who: { userId?: string; fundId?: string }, relId: string, need: Need = "view"): Promise<any> {
  const ids = side === "investor" ? await relationshipEntityIds(who.userId ?? "", need) : []
  const [r] = (side === "investor"
    ? await sql`SELECT * FROM fund_relationships WHERE id::text = ${relId} AND entity_id::text = ANY(${ids}::text[])`
    : await sql`SELECT * FROM fund_relationships WHERE id::text = ${relId} AND fund_id = ${who.fundId ?? ""}`) as any[]
  if (!r) {
    if (side === "investor" && need !== "view" && (await sql`SELECT 1 AS x FROM fund_relationships WHERE id::text = ${relId} AND entity_id::text = ANY(${await relationshipEntityIds(who.userId ?? "")}::text[])` as any[]).length) throw new InvestorError("Your role on this entity is view only.", 403, "view_only")
    throw notFound()
  }
  return r
}
const mutedBy = (side: Side, r: any) => (side === "investor" ? !!r.investor_muted : !!r.fund_muted)

/** The thread, and marks the other side's messages as read. */
export async function readThread(side: Side, who: { userId?: string; fundId?: string }, relId: string): Promise<ThreadView> {
  const r = await own(side, who, relId)
  const other: Side = side === "investor" ? "fund" : "investor"
  await sql`UPDATE relationship_messages SET read_at = now() WHERE relationship_id = ${r.id} AND sender = ${other} AND read_at IS NULL`
  const rows = (await sql`SELECT id, sender, body, created_at, read_at FROM relationship_messages WHERE relationship_id = ${r.id} ORDER BY created_at ASC LIMIT 500`) as any[]
  const att = (await sql`SELECT id, message_id, filename, size_bytes, content_type FROM relationship_attachments WHERE relationship_id = ${r.id} ORDER BY created_at`) as any[]
  const files = new Map<string, AttachmentView[]>()
  for (const a of att) files.set(String(a.message_id), [...(files.get(String(a.message_id)) ?? []), { id: String(a.id), filename: a.filename, sizeBytes: Number(a.size_bytes), contentType: a.content_type }])
  return { scanning: scanningActive(), relationshipId: String(r.id), stage: r.stage, writable: !r.blocked_by && (WRITABLE as readonly string[]).includes(r.stage), muted: mutedBy(side, r), blocked: !!r.blocked_by,
    messages: rows.map((m) => ({ id: String(m.id), from: m.sender, body: m.body, at: new Date(m.created_at).toISOString(), read: !!m.read_at, attachments: (files.get(String(m.id)) ?? []) })) }
}

/** Unread counts per relationship for one side. */
export async function unreadCounts(side: Side, who: { userId?: string; fundId?: string }): Promise<Record<string, number>> {
  const other: Side = side === "investor" ? "fund" : "investor"
  const rows = (side === "investor"
    ? await sql`SELECT m.relationship_id AS id, count(*)::int n FROM relationship_messages m JOIN fund_relationships r ON r.id = m.relationship_id WHERE r.entity_id::text = ANY(${await relationshipEntityIds(who.userId ?? "")}::text[]) AND m.sender = ${other} AND m.read_at IS NULL GROUP BY 1`
    : await sql`SELECT relationship_id AS id, count(*)::int n FROM relationship_messages WHERE fund_id = ${who.fundId ?? ""} AND sender = ${other} AND read_at IS NULL GROUP BY 1`) as any[]
  return Object.fromEntries(rows.map((r) => [String(r.id), Number(r.n)]))
}

export type SendEmail = (m: { to: string; subject: string; text: string }) => Promise<void>
export const defaultSend: SendEmail = async (m) => {
  const { isResendConfigured, sendEmail } = await import("@/lib/email/resend")
  if (!isResendConfigured()) return
  await sendEmail({ ...m, noTracking: true })
}
async function fundPeople(fundId: string) {
  return (await sql`SELECT m.user_id::text AS id, m.org_id FROM organizations o JOIN memberships m ON m.org_id = o.id WHERE o.fund_id = ${fundId} AND m.org_role IN ('workspace_owner', 'admin')`) as any[]
}
/** Where the investor side is written to: the entity's owner and the people who can act on it. */
async function investorEmails(entityId: string): Promise<string[]> {
  const rows = (await sql`SELECT DISTINCT p.email FROM profiles p WHERE p.email IS NOT NULL AND p.id::text IN (SELECT user_id FROM investor_entities WHERE id = ${entityId} UNION SELECT user_id FROM investor_entity_members WHERE entity_id = ${entityId} AND role = 'can_act')`) as any[]
  return rows.map((r) => String(r.email))
}
/** Tell the other side something is waiting, never what. At most one a hour per side per relationship, and not at all to a side that muted it. */
export async function notifyOther(from: Side, r: any, send: SendEmail) {
  const to: Side = from === "investor" ? "fund" : "investor", col = to === "investor" ? "investor_notified_at" : "fund_notified_at"
  if (mutedBy(to, r)) return
  const [claimed] = (await sql.unsafe(`UPDATE fund_relationships SET ${col} = now() WHERE id = $1 AND (${col} IS NULL OR ${col} < now() - interval '${NOTIFY_EVERY_MIN} minutes') RETURNING id`, [r.id])) as any[]
  if (!claimed) return
  if (to === "fund") {
    const { createNotification } = await import("@/lib/notifications/store")
    for (const p of await fundPeople(r.fund_id)) await createNotification({ userId: p.id, orgId: p.org_id, kind: "investor_message", title: "Something new from an investor", body: "Open the investor requests to see it.", href: "/dashboard/investor-requests", dedupeKey: `invmsg:${r.id}:${new Date().toISOString().slice(0, 13)}` })
  } else {
    for (const email of await investorEmails(r.entity_id)) await send({ to: email, ...EMAILS.newMessage({ url: appUrl() }) })
  }
}

export async function sendMessage(side: Side, who: { userId?: string; fundId?: string; senderId: string }, relId: string, body: unknown, send: SendEmail = defaultSend, uploads: UploadedFile[] = []): Promise<MessageView> {
  const r = await own(side, who, relId, "act")
  const text = String(body ?? "").replace(/\r\n/g, "\n").trim()
  if (!text && !uploads.length) throw new InvestorError("Write a message or attach a file first.")
  if (text.length > MESSAGE_MAX) throw new InvestorError(`Keep a message to ${MESSAGE_MAX} characters.`)
  if (r.blocked_by) throw new InvestorError("This conversation is closed.", 409, "closed")
  if (!(WRITABLE as readonly string[]).includes(r.stage)) throw new InvestorError(r.stage === "interested" ? "You can write once the fund has accepted." : "This conversation is closed.", 409, "closed")
  const [n] = (await sql`SELECT count(*)::int n FROM relationship_messages WHERE relationship_id = ${r.id} AND sender = ${side} AND created_at > now() - interval '1 hour'`) as any[]
  if (Number(n.n) >= MESSAGES_PER_HOUR) throw new InvestorError("You are sending messages too fast. Try again in a while.", 429, "rate")
  const checked = checkFiles(uploads)
  await enforceScan(checked)
  if (checked.length) {
    const [used] = (await sql`SELECT COALESCE(sum(size_bytes), 0)::bigint AS n FROM relationship_attachments WHERE relationship_id = ${r.id}`) as any[]
    if (Number(used.n) + checked.reduce((a, f) => a + f.bytes.length, 0) > MAX_TOTAL_BYTES) throw new InvestorError(`This conversation has reached its limit of ${MAX_TOTAL_BYTES / 1024 / 1024} MB of attachments.`, 413, "total")
  }
  const encrypted: Buffer[] = []
  for (const f of checked) { try { encrypted.push(encryptBytes(f.bytes)) } catch { throw new InvestorError("Files cannot be stored securely right now. Please try again later.", 503, "no_key") } }
  const [m] = (await sql`INSERT INTO relationship_messages (relationship_id, fund_id, sender, sender_user_id, body) VALUES (${r.id}, ${r.fund_id}, ${side}, ${who.senderId}, ${text}) RETURNING id, created_at`) as any[]
  const saved: AttachmentView[] = []
  for (let i = 0; i < checked.length; i++) {
    const f = checked[i]
    const [a] = (await sql`INSERT INTO relationship_attachments (message_id, relationship_id, fund_id, filename, content_type, size_bytes, sha256, content_enc) VALUES (${m.id}, ${r.id}, ${r.fund_id}, ${f.filename}, ${f.contentType}, ${f.bytes.length}, ${f.sha256}, ${encrypted[i]}) RETURNING id`) as any[]
    saved.push({ id: String(a.id), filename: f.filename, sizeBytes: f.bytes.length, contentType: f.contentType })
  }
  await sql`UPDATE fund_relationships SET last_message_at = now(), updated_at = now() WHERE id = ${r.id}`
  await notifyOther(side, r, send).catch((e) => console.warn("[investor-talks] notify failed:", e?.message))
  return { id: String(m.id), from: side, body: text, at: new Date(m.created_at).toISOString(), read: false, attachments: saved }
}

/** One attachment for a person who belongs to the conversation (either side; viewers may read). */
export async function attachmentFor(side: Side, who: { userId?: string; fundId?: string }, relId: string, attachmentId: string): Promise<{ filename: string; contentType: string; bytes: Buffer }> {
  const r = await own(side, who, relId)
  const [a] = (await sql`SELECT filename, content_type, content_enc FROM relationship_attachments WHERE id::text = ${attachmentId} AND relationship_id = ${r.id}`) as any[]
  const bytes = a ? decryptBytes(Buffer.from(a.content_enc)) : null
  if (!a || !bytes) throw new InvestorError("That file was not found.", 404, "not_found")
  return { filename: a.filename, contentType: a.content_type, bytes }
}

/** Mute or unmute this side's notifications, or block: the fund's block declines and stops that person asking again; the investor's withdraws. */
export async function setPrefs(side: Side, who: { userId?: string; fundId?: string }, relId: string, action: "mute" | "unmute" | "block"): Promise<{ stage: string; muted: boolean }> {
  const r = await own(side, who, relId, "act")
  if (action === "block") {
    const stage = side === "fund" ? "declined" : "withdrawn"
    await sql`UPDATE fund_relationships SET blocked_by = ${side}, stage = ${stage}, decided_at = COALESCE(decided_at, now()), updated_at = now() WHERE id = ${r.id}`
    return { stage, muted: mutedBy(side, r) }
  }
  const v = action === "mute"
  if (side === "investor") await sql`UPDATE fund_relationships SET investor_muted = ${v}, updated_at = now() WHERE id = ${r.id}`
  else await sql`UPDATE fund_relationships SET fund_muted = ${v}, updated_at = now() WHERE id = ${r.id}`
  return { stage: r.stage, muted: v }
}

/** Has this fund blocked this person? Used before a new request is accepted. */
export async function blockedByFund(userId: string, fundId: string): Promise<boolean> {
  const [r] = (await sql`SELECT 1 AS x FROM fund_relationships WHERE user_id = ${userId} AND fund_id = ${fundId} AND blocked_by = 'fund' LIMIT 1`) as any[]
  return !!r
}

/** The daily nudges (doc 65 section 2). Nothing is declined by this. */
export async function sendNudges(send: SendEmail = defaultSend): Promise<{ reminded: number; asked: number }> {
  const { createNotification } = await import("@/lib/notifications/store")
  let reminded = 0, asked = 0
  const waiting = (await sql`UPDATE fund_relationships SET nudged_at = now() WHERE stage = 'interested' AND nudged_at IS NULL AND created_at < now() - interval '7 days' AND fund_muted = false RETURNING id, fund_id`) as any[]
  for (const r of waiting) {
    for (const p of await fundPeople(r.fund_id)) await createNotification({ userId: p.id, orgId: p.org_id, kind: "investor_request", title: "An investor request has waited a week", body: "Open the requests to answer it.", href: "/dashboard/investor-requests", dedupeKey: `invnudge:${r.id}` })
    reminded++
  }
  const quiet = (await sql`UPDATE fund_relationships SET quiet_asked_at = now() WHERE stage = 'in_talks' AND COALESCE(last_message_at, decided_at, created_at) < now() - interval '30 days' AND (quiet_asked_at IS NULL OR quiet_asked_at < now() - interval '30 days') RETURNING id, fund_id, entity_id, user_id, investor_muted, fund_muted`) as any[]
  for (const r of quiet) {
    if (!r.fund_muted) for (const p of await fundPeople(r.fund_id)) await createNotification({ userId: p.id, orgId: p.org_id, kind: "investor_request", title: "A conversation with an investor has gone quiet", body: "Open the requests to continue or close it.", href: "/dashboard/investor-requests", dedupeKey: `invquiet:${r.id}:${new Date().toISOString().slice(0, 7)}` })
    if (!r.investor_muted) { for (const email of await investorEmails(r.entity_id)) await send({ to: email, ...EMAILS.quiet({ url: appUrl() }) }) }
    asked++
  }
  return { reminded, asked }
}
