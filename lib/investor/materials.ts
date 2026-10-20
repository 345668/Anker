/**
 * Materials a fund shares, the NDA step, and meeting requests (docs/architecture/68). All of it lives on a relationship and only while its thread is open.
 */
import { createHash } from "node:crypto"
import { sql } from "@/lib/db"
import { InvestorError } from "./profile"
import { own, notifyOther, defaultSend, WRITABLE, type Side, type SendEmail } from "./talks"
import { DEFAULT_RULES } from "./listing"

const sha = (s: string) => createHash("sha256").update(s).digest("hex")
type Who = { userId?: string; fundId?: string }
const closed = () => new InvestorError("This conversation is closed.", 409, "closed")
const isOpen = (r: any) => !r.blocked_by && (WRITABLE as readonly string[]).includes(r.stage)

async function rulesOf(fundId: string) {
  const [l] = (await sql`SELECT eligibility FROM fund_listings WHERE fund_id = ${fundId}`) as any[]
  const e = typeof l?.eligibility === "string" ? JSON.parse(l.eligibility) : l?.eligibility ?? {}
  return { ...DEFAULT_RULES, ...e } as typeof DEFAULT_RULES
}
export interface NdaView { required: boolean; accepted: boolean; acceptedAt: string | null; text: string | null }
async function ndaOf(r: any): Promise<NdaView> {
  const rules = await rulesOf(r.fund_id)
  const accepted = !!r.nda_accepted_at
  return { required: !!rules.ndaRequired, accepted, acceptedAt: accepted ? new Date(r.nda_accepted_at).toISOString() : null, text: rules.ndaRequired ? (accepted ? r.nda_text : rules.ndaText) ?? null : null }
}
const ndaMet = (n: NdaView) => !n.required || n.accepted

// ─── the NDA ─────────────────────────────────────────────────────────────────────

/** The investor accepts the fund's own NDA text. Once; the copy, its hash, the time, the address and a hash of the browser string are kept. */
export async function acceptNda(userId: string, relId: string, ip: string | null, userAgent: string | null): Promise<NdaView> {
  const r = await own("investor", { userId }, relId)
  if (!isOpen(r)) throw closed()
  const n = await ndaOf(r)
  if (!n.required) throw new InvestorError("This fund does not ask for an NDA.", 409, "no_nda")
  if (n.accepted) throw new InvestorError("You already accepted this NDA.", 409, "accepted")
  const rules = await rulesOf(r.fund_id)
  await sql`UPDATE fund_relationships SET nda_accepted_at = now(), nda_text = ${rules.ndaText}, nda_text_hash = ${sha(rules.ndaText)}, nda_ip = ${ip}, nda_agent_hash = ${userAgent ? sha(userAgent) : null}, updated_at = now() WHERE id = ${r.id}`
  return ndaOf(await own("investor", { userId }, relId))
}

// ─── materials ───────────────────────────────────────────────────────────────────

export interface MaterialItem { grantId: string; documentId: string; title: string; category: string; fileName: string | null; bytes: number | null; grantedAt: string }
export async function materialsForInvestor(userId: string, relId: string): Promise<{ open: boolean; nda: NdaView; items: MaterialItem[] }> {
  const r = await own("investor", { userId }, relId)
  const nda = await ndaOf(r)
  const rows = (await sql`SELECT m.id, m.document_id, m.granted_at, d.title, d.category, d.file_name, d.byte_size FROM relationship_materials m JOIN data_room_documents d ON d.id = m.document_id
    WHERE m.relationship_id = ${r.id} AND m.revoked_at IS NULL AND d.archived_at IS NULL ORDER BY m.granted_at DESC`) as any[]
  const open = isOpen(r)
  return { open, nda, items: open && ndaMet(nda) ? rows.map((x) => ({ grantId: String(x.id), documentId: String(x.document_id), title: x.title, category: x.category, fileName: x.file_name ?? null, bytes: x.byte_size == null ? null : Number(x.byte_size), grantedAt: new Date(x.granted_at).toISOString() })) : [] }
}

/** The address of a granted file, after every check, with the access written to the log. */
export async function openMaterial(userId: string, email: string | null, relId: string, documentId: string): Promise<string> {
  const r = await own("investor", { userId }, relId)
  if (!isOpen(r)) throw closed()
  const nda = await ndaOf(r)
  if (!ndaMet(nda)) throw new InvestorError("Accept the fund's NDA first.", 403, "nda")
  const [d] = (await sql`SELECT d.file_url FROM relationship_materials m JOIN data_room_documents d ON d.id = m.document_id WHERE m.relationship_id = ${r.id} AND m.document_id = ${documentId} AND m.revoked_at IS NULL AND d.archived_at IS NULL AND d.fund_id = ${r.fund_id}`) as any[]
  if (!d?.file_url) throw new InvestorError("That document is not available to you.", 404, "not_found")
  await sql`INSERT INTO data_room_document_views (document_id, fund_id, fund_lp_id, viewer_email, is_lp) VALUES (${documentId}, ${r.fund_id}, NULL, ${email}, false)`.catch(() => {})
  return String(d.file_url)
}

export interface FundMaterials { open: boolean; ndaRequired: boolean; ndaAccepted: boolean; granted: Array<{ grantId: string; documentId: string; title: string; category: string; grantedAt: string; opened: boolean }>; available: Array<{ id: string; title: string; category: string; fileName: string | null }> }
export async function materialsForFund(fundId: string, relId: string): Promise<FundMaterials> {
  const r = await own("fund", { fundId }, relId)
  const nda = await ndaOf(r)
  const [p] = (await sql`SELECT email FROM profiles WHERE id::text = ${r.user_id}`) as any[]
  const granted = (await sql`SELECT m.id, m.document_id, m.granted_at, d.title, d.category, EXISTS (SELECT 1 FROM data_room_document_views v WHERE v.document_id = m.document_id AND v.fund_id = m.fund_id AND lower(v.viewer_email) = lower(${p?.email ?? ""}) AND v.viewed_at >= m.granted_at) AS opened
    FROM relationship_materials m JOIN data_room_documents d ON d.id = m.document_id WHERE m.relationship_id = ${r.id} AND m.revoked_at IS NULL ORDER BY m.granted_at DESC`.catch(() => [])) as any[]
  const available = (await sql`SELECT id, title, category, file_name FROM data_room_documents WHERE fund_id = ${fundId} AND fund_lp_id IS NULL AND archived_at IS NULL
    AND id NOT IN (SELECT document_id FROM relationship_materials WHERE relationship_id = ${r.id} AND revoked_at IS NULL) ORDER BY created_at DESC LIMIT 200`) as any[]
  return { open: isOpen(r), ndaRequired: nda.required, ndaAccepted: nda.accepted,
    granted: granted.map((g) => ({ grantId: String(g.id), documentId: String(g.document_id), title: g.title, category: g.category, grantedAt: new Date(g.granted_at).toISOString(), opened: !!g.opened })),
    available: available.map((a) => ({ id: String(a.id), title: a.title, category: a.category, fileName: a.file_name ?? null })) }
}

export async function grantMaterial(fundId: string, relId: string, documentId: string, by: string, send: SendEmail = defaultSend): Promise<void> {
  const r = await own("fund", { fundId }, relId)
  if (!isOpen(r)) throw closed()
  const [d] = (await sql`SELECT id FROM data_room_documents WHERE id = ${documentId} AND fund_id = ${fundId} AND fund_lp_id IS NULL AND archived_at IS NULL`) as any[]
  if (!d) throw new InvestorError("Only your fund-wide documents can be shared this way.", 404, "not_found")
  try { await sql`INSERT INTO relationship_materials (relationship_id, fund_id, document_id, granted_by) VALUES (${r.id}, ${fundId}, ${documentId}, ${by})` }
  catch (e: any) { if (e?.code === "23505") throw new InvestorError("That document is already shared with this investor.", 409, "exists"); throw e }
  await notifyOther("fund", r, send).catch(() => {})
}
export async function revokeMaterial(fundId: string, relId: string, grantId: string): Promise<void> {
  const r = await own("fund", { fundId }, relId)
  const rows = (await sql`UPDATE relationship_materials SET revoked_at = now() WHERE id::text = ${grantId} AND relationship_id = ${r.id} AND revoked_at IS NULL RETURNING id`) as any[]
  if (!rows.length) throw new InvestorError("That share was not found.", 404, "not_found")
}

// ─── meeting requests ────────────────────────────────────────────────────────────

export const MEETINGS_OPEN_MAX = 3, MEETING_NOTE_MAX = 500
export interface MeetingView { id: string; by: Side; startsAt: string | null; link: string | null; note: string | null; status: string; createdAt: string; mine: boolean }
export async function listMeetings(side: Side, who: Who, relId: string): Promise<MeetingView[]> {
  const r = await own(side, who, relId)
  const rows = (await sql`SELECT * FROM relationship_meetings WHERE relationship_id = ${r.id} ORDER BY created_at DESC LIMIT 50`) as any[]
  return rows.map((m) => ({ id: String(m.id), by: m.proposed_by, startsAt: m.starts_at ? new Date(m.starts_at).toISOString() : null, link: m.link ?? null, note: m.note ?? null, status: m.status, createdAt: new Date(m.created_at).toISOString(), mine: m.proposed_by === side }))
}
export async function proposeMeeting(side: Side, who: Who, relId: string, input: { startsAt?: unknown; link?: unknown; note?: unknown }, send: SendEmail = defaultSend): Promise<void> {
  const r = await own(side, who, relId)
  if (!isOpen(r)) throw closed()
  const startsAt = input.startsAt ? new Date(String(input.startsAt)) : null
  if (startsAt && (Number.isNaN(startsAt.getTime()) || startsAt.getTime() < Date.now() - 60_000)) throw new InvestorError("Choose a time in the future.")
  let link: string | null = null
  if (input.link) {
    try { const u = new URL(String(input.link).trim()); if (u.protocol !== "https:") throw 0; link = u.toString().slice(0, 500) } catch { throw new InvestorError("The meeting link must start with https://.") }
  }
  if (!startsAt && !link) throw new InvestorError("Propose a time, a link, or both.")
  const note = String(input.note ?? "").trim().slice(0, MEETING_NOTE_MAX) || null
  const [n] = (await sql`SELECT count(*)::int n FROM relationship_meetings WHERE relationship_id = ${r.id} AND status = 'proposed'`) as any[]
  if (Number(n.n) >= MEETINGS_OPEN_MAX) throw new InvestorError("Too many proposals are waiting. Answer or cancel one first.", 429, "limit")
  await sql`INSERT INTO relationship_meetings (relationship_id, fund_id, proposed_by, starts_at, link, note) VALUES (${r.id}, ${r.fund_id}, ${side}, ${startsAt ? startsAt.toISOString() : null}, ${link}, ${note})`
  await notifyOther(side, r, send).catch(() => {})
}
/** The other side accepts or declines; the proposer cancels. */
export async function answerMeeting(side: Side, who: Who, relId: string, meetingId: string, action: "accept" | "decline" | "cancel", send: SendEmail = defaultSend): Promise<string> {
  const r = await own(side, who, relId)
  if (!isOpen(r)) throw closed()
  const [m] = (await sql`SELECT * FROM relationship_meetings WHERE id::text = ${meetingId} AND relationship_id = ${r.id}`) as any[]
  if (!m || m.status !== "proposed") throw new InvestorError("That proposal was not found, or it has already been answered.", 404, "not_found")
  const mine = m.proposed_by === side
  if (action === "cancel" && !mine) throw new InvestorError("Only the person who proposed it can cancel.", 403, "not_yours")
  if (action !== "cancel" && mine) throw new InvestorError("The other side answers your proposal.", 403, "not_yours")
  const status = action === "accept" ? "accepted" : action === "decline" ? "declined" : "cancelled"
  await sql`UPDATE relationship_meetings SET status = ${status}, answered_at = now() WHERE id = ${m.id}`
  if (action !== "cancel") await notifyOther(side, r, send).catch(() => {})
  return status
}
