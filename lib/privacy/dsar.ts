import "server-only"
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto"
import { sql } from "@/lib/db"
import { encryptSecret, decryptSecret } from "@/lib/db/secrets"
import { hashEmail, hashKey, hashLinkedIn, linkedinSlug, normEmail } from "@/lib/directory/identity"

/**
 * Data-subject requests for people in the shared investor directory (docs/architecture/54, D3).
 * A request is made on a public page, confirmed through a link sent to the address it names (so nobody can act for someone else), and handled by an operator in SAIL.
 * An objection from a confirmed address needs no judgement and is carried out at once. Erasure is carried out by D4.
 */
export const KINDS = ["access", "rectification", "erasure", "restriction", "objection"] as const
export type Kind = (typeof KINDS)[number]
export const DUE_DAYS = 30, VERIFY_DAYS = 14, MAX_EXTENSION_DAYS = 60, WIPE_AFTER_CLOSE_DAYS = 30, KEEP_COUNTS_YEARS = 3
/** Where privacy mail is read and replies go. vc@ until a dedicated privacy@ mailbox is switched on. */
export const PRIVACY_ADDRESS = process.env.PRIVACY_CONTACT_EMAIL || "vc@an-ker.de"
export class DsarError extends Error { constructor(message: string, readonly status = 400) { super(message); this.name = "DsarError" } }

const sha = (s: string) => createHash("sha256").update(s).digest("hex")
const base = () => (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.an-ker.de").replace(/\/$/, "")
const OPEN = ["verifying", "verified", "in_progress"]
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The signed time stamp on the public form: a bot that posts without loading the page, or within seconds of loading it, is turned away. */
export function makeFormToken(now = Date.now()): string {
  const p = now.toString(36)
  return `${p}.${createHmac("sha256", hashKey()).update(`dsar-form:${p}`).digest("base64url")}`
}
export function formTokenOk(token: string, now = Date.now()): boolean {
  const [p, sig] = String(token ?? "").split(".")
  if (!p || !sig) return false
  const want = createHmac("sha256", hashKey()).update(`dsar-form:${p}`).digest("base64url")
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return false
  const age = now - parseInt(p, 36)
  return age >= 3000 && age <= 2 * 3600_000
}

interface Details { email: string; linkedin: string | null; note: string | null }
const seal = (d: Details) => { if (!process.env.SECRET_KEY) throw new Error("SECRET_KEY is required to store a privacy request"); return encryptSecret(JSON.stringify(d)) }
const open = (s: string | null): Details | null => { try { const t = decryptSecret(s); return t ? JSON.parse(t) : null } catch { return null } }
const mask = (e: string) => e.replace(/^(.).*(@.*)$/, "$1***$2")

async function send(to: string, subject: string, text: string): Promise<void> {
  const { sendEmail } = await import("@/lib/email/resend")
  await sendEmail({ to, subject, text, noTracking: true, purpose: "transactional", via: "privacy-request", replyTo: PRIVACY_ADDRESS })
}
const phrase: Record<Kind, string> = { access: "send you a copy of the data we hold about you", rectification: "correct data we hold about you", erasure: "erase the data we hold about you", restriction: "restrict how we use the data we hold about you", objection: "stop using your data and contact you" }

export async function createRequest(i: { kind: string; email: string; linkedin?: string | null; note?: string | null }): Promise<{ created: boolean; id?: string }> {
  if (!(KINDS as readonly string[]).includes(i.kind)) throw new DsarError("Choose what you would like us to do.")
  const email = normEmail(i.email)
  if (!EMAIL_RE.test(email) || email.length > 200) throw new DsarError("Enter a valid email address.")
  const linkedin = (i.linkedin ?? "").trim() || null
  if (linkedin && !linkedinSlug(linkedin)) throw new DsarError("Enter the address of your LinkedIn profile (linkedin.com/in/...), or leave it empty.")
  const note = (i.note ?? "").trim().slice(0, 1000) || null
  const eh = hashEmail(email)!
  const [dup] = (await sql`SELECT id FROM dsar_requests WHERE requester_email_hash = ${eh} AND kind = ${i.kind} AND closed_at IS NULL AND status = ANY(${OPEN}::text[]) LIMIT 1`) as any[]
  if (dup) return { created: false }
  const token = randomBytes(32).toString("base64url"), id = randomUUID()
  await sql`INSERT INTO dsar_requests (id, kind, status, requester_email_hash, details_enc, verify_token_hash, verify_expires_at, due_at)
    VALUES (${id}, ${i.kind}, 'verifying', ${eh}, ${seal({ email, linkedin, note })}, ${sha(token)}, now() + make_interval(days => ${VERIFY_DAYS}), now() + make_interval(days => ${DUE_DAYS}))`
  try {
    await send(email, "Please confirm your privacy request to Anker",
      `Someone, hopefully you, asked Anker to ${phrase[i.kind as Kind]} for this email address.\n\nTo confirm it was you, open this link and press the button:\n${base()}/api/public/privacy-request/verify?t=${token}\n\n` +
      `The link works for ${VERIFY_DAYS} days. If this was not you, ignore this email and nothing will happen.\n\nQuestions: ${PRIVACY_ADDRESS}`)
  } catch (e) {
    await sql`DELETE FROM dsar_requests WHERE id = ${id}`
    throw e
  }
  return { created: true, id }
}

/** Confirms a request from its emailed token. An objection from a confirmed address is carried out at once. */
export async function verifyRequest(token: string): Promise<{ ok: boolean; reason?: "invalid" | "expired"; kind?: Kind }> {
  if (!token || token.length < 20) return { ok: false, reason: "invalid" }
  const [r] = (await sql`SELECT id, kind, status, verify_expires_at FROM dsar_requests WHERE verify_token_hash = ${sha(token)}`) as any[]
  if (!r || r.status !== "verifying") return { ok: false, reason: "invalid" }
  if (new Date(r.verify_expires_at).getTime() < Date.now()) { await expireRequests(); return { ok: false, reason: "expired" } }
  await sql`UPDATE dsar_requests SET status = 'verified', verified_at = now(), verify_token_hash = NULL WHERE id = ${r.id} AND status = 'verifying'`
  if (r.kind === "objection") await carryOutObjection(r.id)
  return { ok: true, kind: r.kind }
}

/** Global tombstones for an email address and the LinkedIn profiles on the rows found at it, so the person is not imported or contacted again. Returns how many were new. */
export async function tombstoneIdentity(requestId: string, reason: "objection" | "erasure", email: string, rows: Array<{ linkedin_url?: string | null; person_linkedin_url?: string | null }>): Promise<number> {
  const eh = hashEmail(email)!
  const lis = [...new Set(rows.flatMap((x) => [hashLinkedIn(x.linkedin_url), hashLinkedIn(x.person_linkedin_url)]).filter((x): x is string => !!x))]
  let n = ((await sql`INSERT INTO directory_tombstones (email_hash, reason, request_id) SELECT ${eh}, ${reason}, ${requestId} WHERE NOT EXISTS (SELECT 1 FROM directory_tombstones WHERE email_hash = ${eh} AND source IS NULL) RETURNING id`) as any[]).length
  for (const l of lis) n += ((await sql`INSERT INTO directory_tombstones (linkedin_hash, reason, request_id) SELECT ${l}, ${reason}, ${requestId} WHERE NOT EXISTS (SELECT 1 FROM directory_tombstones WHERE linkedin_hash = ${l} AND source IS NULL) RETURNING id`) as any[]).length
  return n
}

/** Global do-not-contact on every channel, and a tombstone so the person is not imported again; the sweep then removes their directory rows. */
async function carryOutObjection(id: string): Promise<void> {
  const [r] = (await sql`SELECT details_enc FROM dsar_requests WHERE id = ${id}`) as any[]
  const d = open(r?.details_enc); if (!d) return
  const { suppressEverywhere } = await import("@/lib/compliance/suppression")
  const s = await suppressEverywhere({ email: d.email, reason: "objection", source: "dsar" })
  const rows = (await sql`SELECT linkedin_url, person_linkedin_url FROM investors WHERE lower(email) = ${normEmail(d.email)}`) as any[]
  const tombstones = await tombstoneIdentity(id, "objection", d.email, rows)
  await sql`UPDATE dsar_requests SET status = 'done', closed_at = now(), handled_by = 'system:confirmed-address', outcome = ${JSON.stringify({ suppressedEmails: s.emails, suppressedLinkedIn: s.linkedin, tombstones, directoryRows: rows.length })}::jsonb WHERE id = ${id}`
  try { await send(d.email, "Your objection to Anker has been recorded", `We have stopped contacting this address and removed it from our investor directory. The record is deleted within about an hour; we keep only an irreversible code so you are not added again.\n\nQuestions: ${PRIVACY_ADDRESS}`) } catch { /* the request is done either way */ }
}

// ───────────── operator side (called through the staff portal) ─────────────
export interface RequestSummary { id: string; kind: Kind; status: string; email: string; created_at: string; due_at: string; verified_at: string | null; closed_at: string | null; overdue: boolean; outcome: any }

export async function listRequests(): Promise<RequestSummary[]> {
  const rows = (await sql`SELECT * FROM dsar_requests ORDER BY (closed_at IS NULL) DESC, COALESCE(extended_to, due_at) ASC LIMIT 300`) as any[]
  return rows.map((r) => ({ id: r.id, kind: r.kind, status: r.status, email: r.details_enc ? mask(open(r.details_enc)?.email ?? "") : "(wiped)", created_at: new Date(r.created_at).toISOString(), due_at: new Date(r.extended_to ?? r.due_at).toISOString(), verified_at: r.verified_at ? new Date(r.verified_at).toISOString() : null, closed_at: r.closed_at ? new Date(r.closed_at).toISOString() : null, overdue: !r.closed_at && new Date(r.extended_to ?? r.due_at).getTime() < Date.now(), outcome: r.outcome }))
}

const PERSON_COLS = "id, first_name, last_name, title, email, linkedin_url, person_linkedin_url, source, restricted_at, is_active"
export interface Found { byEmail: any[]; byLinkedIn: any[] }

export async function getRequest(id: string) {
  const [r] = (await sql`SELECT * FROM dsar_requests WHERE id = ${id}`) as any[]
  if (!r) throw new DsarError("Unknown request.", 404)
  const d = open(r.details_enc)
  let found: Found = { byEmail: [], byLinkedIn: [] }
  if (d && r.verified_at) {
    found.byEmail = (await sql.unsafe(`SELECT ${PERSON_COLS} FROM investors WHERE lower(email) = $1 ORDER BY id`, [normEmail(d.email)])) as any[]
    const slug = linkedinSlug(d.linkedin)
    if (slug) {
      const like = `%linkedin.com/in/${slug.slice(3)}%`
      found.byLinkedIn = ((await sql.unsafe(`SELECT ${PERSON_COLS} FROM investors WHERE lower(linkedin_url) LIKE $1 OR lower(person_linkedin_url) LIKE $1 ORDER BY id`, [like])) as any[]).filter((x) => !found.byEmail.some((e) => e.id === x.id))
    }
  }
  return { request: { id: r.id, kind: r.kind as Kind, status: r.status, created_at: new Date(r.created_at).toISOString(), due_at: new Date(r.due_at).toISOString(), extended_to: r.extended_to ? new Date(r.extended_to).toISOString() : null, extension_reason: r.extension_reason, verified_at: r.verified_at ? new Date(r.verified_at).toISOString() : null, closed_at: r.closed_at ? new Date(r.closed_at).toISOString() : null, handled_by: r.handled_by, outcome: r.outcome, refusal_reason: r.refusal_reason }, details: d, found }
}

export async function loadHandled(id: string) {
  const [r] = (await sql`SELECT * FROM dsar_requests WHERE id = ${id}`) as any[]
  if (!r) throw new DsarError("Unknown request.", 404)
  if (!r.verified_at) throw new DsarError("The requester has not confirmed their address yet.", 409)
  if (r.closed_at) throw new DsarError("This request is closed.", 409)
  const d = open(r.details_enc); if (!d) throw new DsarError("The request details have been wiped.", 410)
  return { r, d }
}
/** The ids an operator may act on: every row at the confirmed address, plus LinkedIn candidates the operator explicitly ticked. */
export async function allowedIds(d: Details, ids: string[]): Promise<string[]> {
  const byEmail = ((await sql`SELECT id FROM investors WHERE lower(email) = ${normEmail(d.email)}`) as any[]).map((x) => x.id as string)
  const slug = linkedinSlug(d.linkedin)
  let cand: string[] = []
  if (slug) { const like = `%linkedin.com/in/${slug.slice(3)}%`; cand = ((await sql`SELECT id FROM investors WHERE lower(linkedin_url) LIKE ${like} OR lower(person_linkedin_url) LIKE ${like}`) as any[]).map((x) => x.id as string) }
  const picked = ids.filter((x) => cand.includes(x))
  return [...new Set([...byEmail, ...picked])]
}
const need = (cond: unknown, msg: string) => { if (!cond) throw new DsarError(msg) }
const why = (t: string) => { const v = (t ?? "").trim(); need(v.length >= 10, "A reason of at least 10 characters is required."); return v.slice(0, 500) }
const close = (id: string, status: "done" | "refused", op: string, outcome: object, refusal?: string) =>
  sql`UPDATE dsar_requests SET status = ${status}, closed_at = now(), handled_by = ${op}, outcome = ${JSON.stringify(outcome)}::jsonb, refusal_reason = ${refusal ?? null} WHERE id = ${id}`

export async function accessReport(ids: string[]) {
  if (!ids.length) return { people: [] as any[], note: "We found no record under this address." }
  const people = (await sql.unsafe(`SELECT i.id, i.first_name, i.last_name, i.title, i.email, i.phone, i.linkedin_url, i.person_linkedin_url, i.twitter_url, i.location, i.bio, i.investor_type, i.source, s.label AS source_label, s.acquired_at AS source_acquired
    FROM investors i LEFT JOIN directory_sources s ON s.source = COALESCE(NULLIF(TRIM(i.source), ''), 'unknown') WHERE i.id = ANY($1::text[]) ORDER BY i.id`, [ids])) as any[]
  let workspaces: number | null = null
  try { workspaces = Number(((await sql.unsafe(`SELECT count(DISTINCT org_id)::int AS n FROM crm_people WHERE investor_id = ANY($1::text[])`, [ids])) as any[])[0]?.n ?? 0) } catch { workspaces = null }
  return { people, copiesHeldByWorkspaces: workspaces, note: "Workspaces of Anker customers may keep their own copy of a contact. We do not name them." }
}

export async function sendAccess(id: string, op: string, ids: string[] = []) {
  const { r, d } = await loadHandled(id); need(r.kind === "access", "This is not an access request.")
  const use = await allowedIds(d, ids), rep = await accessReport(use)
  await send(d.email, "Your Anker data access report", `This is the data Anker holds about the email address ${d.email} in its investor directory, as of today.\n\n${JSON.stringify(rep, null, 2)}\n\nYou can ask us to correct, restrict or erase it at ${PRIVACY_ADDRESS}.`)
  await close(id, "done", op, { access: { rows: use.length } })
  return { rows: use.length }
}

const EDITABLE = ["first_name", "last_name", "title", "email", "phone", "linkedin_url", "person_linkedin_url", "location"] as const
export async function rectify(id: string, op: string, ids: string[], changes: Record<string, string>) {
  const { r, d } = await loadHandled(id); need(r.kind === "rectification", "This is not a rectification request.")
  const keys = Object.keys(changes ?? {}).filter((k) => (EDITABLE as readonly string[]).includes(k))
  need(keys.length, "Name at least one field to change.")
  need(!("first_name" in changes) || String(changes.first_name).trim(), "The first name cannot be empty.")
  const use = await allowedIds(d, ids); need(use.length, "No directory record found to correct.")
  for (const k of keys) {
    const v = String(changes[k]).trim() || null
    // Changing an address or profile invalidates its hashes; the maintenance job computes them again.
    const rehash = k === "email" || k.endsWith("linkedin_url") ? "hashed_at = NULL, " : ""
    await sql.unsafe(`UPDATE investors SET ${k} = $1, ${rehash}updated_at = now() WHERE id = ANY($2::text[])`, [v, use])
  }
  await close(id, "done", op, { rectified: { rows: use.length, fields: keys } })
  try { await send(d.email, "Your Anker data has been corrected", `We have corrected the data we hold about this address in our investor directory (${keys.join(", ").replace(/_/g, " ")}).\n\nQuestions: ${PRIVACY_ADDRESS}`) } catch { /* done either way */ }
  return { rows: use.length }
}

export async function restrict(id: string, op: string, ids: string[]) {
  const { r, d } = await loadHandled(id); need(r.kind === "restriction", "This is not a restriction request.")
  const use = await allowedIds(d, ids); need(use.length, "No directory record found to restrict.")
  await sql`UPDATE investors SET restricted_at = now(), is_active = false, updated_at = now() WHERE id = ANY(${use}::text[])`
  await close(id, "done", op, { restricted: { rows: use.length } })
  try { await send(d.email, "Your Anker data is restricted", `We keep the data we hold about this address in our investor directory but no longer use it for matching, display or contact.\n\nQuestions: ${PRIVACY_ADDRESS}`) } catch { /* done either way */ }
  return { rows: use.length }
}

export async function refuse(id: string, op: string, reason: string) {
  const { d } = await loadHandled(id); const why_ = why(reason)
  await close(id, "refused", op, {}, why_)
  try { await send(d.email, "About your privacy request to Anker", `We could not carry out your request: ${why_}\n\nYou can contact us at ${PRIVACY_ADDRESS} and you have the right to complain to your data protection authority.`) } catch { /* recorded either way */ }
}

export async function extend(id: string, op: string, days: number, reason: string) {
  const { r, d } = await loadHandled(id)
  const n = Math.floor(Number(days)); need(n >= 1 && n <= MAX_EXTENSION_DAYS, `An extension is 1 to ${MAX_EXTENSION_DAYS} days.`)
  need(!r.extended_to, "This request has already been extended.")
  const why_ = why(reason)
  await sql`UPDATE dsar_requests SET extended_to = due_at + make_interval(days => ${n}), extension_reason = ${why_}, handled_by = ${op} WHERE id = ${id}`
  try { await send(d.email, "Your Anker privacy request needs more time", `We need up to ${n} more days for your request: ${why_}\n\nQuestions: ${PRIVACY_ADDRESS}`) } catch { /* recorded either way */ }
}

/** Erasure (docs/architecture/54, D4): a preview of the counts, then the erasure itself. */
export async function erasePreview(id: string, ids: string[] = []) { return (await import("./erasure")).previewErasure(id, ids) }
export async function erase(id: string, op: string, ids: string[], confirm: boolean) { return (await import("./erasure")).carryOutErasure(id, op, ids, confirm) }

// ───────────── housekeeping (run by the directory-maintenance job) ─────────────
export async function expireRequests(): Promise<{ expired: number; wiped: number; deleted: number }> {
  const e = (await sql`UPDATE dsar_requests SET status = 'expired', closed_at = now(), details_enc = NULL, verify_token_hash = NULL, details_wiped_at = now() WHERE status = 'verifying' AND verify_expires_at < now() RETURNING id`) as any[]
  const w = (await sql`UPDATE dsar_requests SET details_enc = NULL, details_wiped_at = now() WHERE closed_at IS NOT NULL AND details_enc IS NOT NULL AND closed_at < now() - make_interval(days => ${WIPE_AFTER_CLOSE_DAYS}) RETURNING id`) as any[]
  // After three years even the counts go (docs/architecture/54 section 8).
  const d = (await sql`DELETE FROM dsar_requests WHERE closed_at IS NOT NULL AND closed_at < now() - make_interval(years => ${KEEP_COUNTS_YEARS}) RETURNING id`) as any[]
  return { expired: e.length, wiped: w.length, deleted: d.length }
}

/** One mail a day to the privacy address when a request is due within 7 days or overdue. */
export async function dueDigest(now = new Date()): Promise<{ sent: boolean; count: number }> {
  const rows = (await sql`SELECT id, kind, COALESCE(extended_to, due_at) AS due FROM dsar_requests WHERE closed_at IS NULL AND status <> 'verifying' AND COALESCE(extended_to, due_at) < now() + interval '7 days' ORDER BY 3`) as any[]
  if (!rows.length) return { sent: false, count: 0 }
  const day = now.toISOString().slice(0, 10)
  const [m] = (await sql`INSERT INTO directory_hash_meta (k, v) VALUES ('dsar_digest_day', ${day}) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v WHERE directory_hash_meta.v <> EXCLUDED.v RETURNING v`) as any[]
  if (!m) return { sent: false, count: rows.length }
  await send(PRIVACY_ADDRESS, `${rows.length} privacy request(s) due soon or overdue`, rows.map((r) => `${r.kind}  due ${new Date(r.due).toISOString().slice(0, 10)}${new Date(r.due) < now ? "  OVERDUE" : ""}`).join("\n") + "\n\nOpen the staff portal, Privacy requests.")
  return { sent: true, count: rows.length }
}
