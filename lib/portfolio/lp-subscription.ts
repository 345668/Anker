import { createHash } from "node:crypto"
import { sql } from "@/lib/db"
import { LpError, advance, stateIndex } from "./lp-onboarding"

/**
 * The LP leg, slice L2 (docs/architecture/60 section 7): the fund's subscription package, what each LP is sent, the signed copy that comes back, and the fund's decision.
 * Honest limit: this records that a signed document came back and was accepted. It is not a legally validated electronic signature.
 * The existing fund_lps.subscription_status (prospective, invited, signed, countersigned) follows along, so the fundraise tiles keep working.
 */
export const MAX_PDF_BYTES = 4 * 1024 * 1024        // a serverless request body is limited to about 4.5 MB
export const MAX_PACKAGE_DOCS = 12

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex")

/** A real PDF of a sensible size. The check is on the content, not the name. */
export function checkPdf(name: string, bytes: Buffer): void {
  if (!bytes.length) throw new LpError("The file is empty.")
  if (bytes.length > MAX_PDF_BYTES) throw new LpError(`The file is larger than ${MAX_PDF_BYTES / 1024 / 1024} MB. Please send a smaller PDF (for example, scan in black and white).`, 413, "too_large")
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new LpError(`${name || "The file"} is not a PDF.`, 415, "not_pdf")
}
const cleanName = (n: string) => n.replace(/[\r\n"\\/]/g, " ").trim().slice(0, 120) || "document.pdf"

// ───────────── the fund's package ─────────────
export interface PackageDoc { id: string; title: string; filename: string; sizeBytes: number; sha256: string; createdAt: string }
export interface PackageView { current: { id: string; version: number; publishedAt: string | null; docs: PackageDoc[] } | null; draft: { id: string; version: number; docs: PackageDoc[] } | null }

const docsOf = async (packageId: string): Promise<PackageDoc[]> => ((await sql`SELECT id, title, filename, size_bytes, sha256, created_at FROM lp_subscription_files WHERE package_id = ${packageId}::uuid AND role = 'package_doc' ORDER BY created_at, filename`) as any[])
  .map((r) => ({ id: String(r.id), title: r.title ?? r.filename, filename: r.filename, sizeBytes: Number(r.size_bytes), sha256: r.sha256, createdAt: new Date(r.created_at).toISOString() }))

export async function packageView(fundId: string): Promise<PackageView> {
  const pk = (await sql`SELECT id, version, status, published_at FROM fund_subscription_packages WHERE fund_id = ${fundId} AND status IN ('draft', 'current')`) as any[]
  const cur = pk.find((p) => p.status === "current"), dr = pk.find((p) => p.status === "draft")
  return {
    current: cur ? { id: String(cur.id), version: Number(cur.version), publishedAt: cur.published_at ? new Date(cur.published_at).toISOString() : null, docs: await docsOf(String(cur.id)) } : null,
    draft: dr ? { id: String(dr.id), version: Number(dr.version), docs: await docsOf(String(dr.id)) } : null,
  }
}

/** Adds a PDF to the fund's draft package (starting a draft if there is none). */
export async function addPackageDoc(fundId: string, by: string, input: { title?: string; filename: string; bytes: Buffer }): Promise<PackageDoc> {
  checkPdf(input.filename, input.bytes)
  let [d] = (await sql`SELECT id FROM fund_subscription_packages WHERE fund_id = ${fundId} AND status = 'draft'`) as any[]
  if (!d) {
    const [v] = (await sql`SELECT COALESCE(max(version), 0) + 1 AS v FROM fund_subscription_packages WHERE fund_id = ${fundId}`) as any[]
    ;[d] = (await sql`INSERT INTO fund_subscription_packages (fund_id, version, status, created_by) VALUES (${fundId}, ${Number(v.v)}, 'draft', ${by}) RETURNING id`) as any[]
  }
  const [n] = (await sql`SELECT count(*)::int AS n FROM lp_subscription_files WHERE package_id = ${String(d.id)}::uuid AND role = 'package_doc'`) as any[]
  if (Number(n.n) >= MAX_PACKAGE_DOCS) throw new LpError(`A package can hold up to ${MAX_PACKAGE_DOCS} documents.`)
  const [f] = (await sql`INSERT INTO lp_subscription_files (fund_id, package_id, role, title, filename, size_bytes, sha256, content, uploaded_by)
    VALUES (${fundId}, ${String(d.id)}::uuid, 'package_doc', ${(input.title ?? "").trim().slice(0, 120) || null}, ${cleanName(input.filename)}, ${input.bytes.length}, ${sha256(input.bytes)}, ${input.bytes}, ${`gp:${by}`})
    RETURNING id, title, filename, size_bytes, sha256, created_at`) as any[]
  return { id: String(f.id), title: f.title ?? f.filename, filename: f.filename, sizeBytes: Number(f.size_bytes), sha256: f.sha256, createdAt: new Date(f.created_at).toISOString() }
}

/** Removes a document from the draft. A published package cannot be edited: publish a new version instead. */
export async function removePackageDoc(fundId: string, docId: string): Promise<boolean> {
  const rows = (await sql`DELETE FROM lp_subscription_files f USING fund_subscription_packages p WHERE f.id = ${docId}::uuid AND f.fund_id = ${fundId} AND f.package_id = p.id AND p.status = 'draft' AND f.role = 'package_doc' RETURNING f.id`) as any[]
  return rows.length > 0
}

/** Makes the draft the current package; the previous current becomes retired. LPs already sent the old version keep it. */
export async function publishPackage(fundId: string, by: string, title?: string): Promise<{ version: number }> {
  const [d] = (await sql`SELECT p.id, p.version, (SELECT count(*)::int FROM lp_subscription_files f WHERE f.package_id = p.id AND f.role = 'package_doc') AS n FROM fund_subscription_packages p WHERE p.fund_id = ${fundId} AND p.status = 'draft'`) as any[]
  if (!d || Number(d.n) === 0) throw new LpError("Add at least one document to the package before publishing it.", 409, "empty")
  await sql`UPDATE fund_subscription_packages SET status = 'retired' WHERE fund_id = ${fundId} AND status = 'current'`
  await sql`UPDATE fund_subscription_packages SET status = 'current', published_at = now(), title = COALESCE(${title?.trim().slice(0, 120) || null}, title), created_by = COALESCE(created_by, ${by}) WHERE id = ${String(d.id)}::uuid`
  return { version: Number(d.version) }
}

// ───────────── sending to one LP ─────────────
export const SEND_FROM_STATE = "terms_accepted"
export async function sendToLp(lpId: string, by: string, input: { shareClass?: unknown; date?: unknown }): Promise<void> {
  const [lp] = (await sql`SELECT fund_id, commitment_amount, onboarding_state FROM fund_lps WHERE id = ${lpId}`) as any[]
  if (!lp) throw new LpError("LP not found.", 404)
  if (stateIndex(lp.onboarding_state) < stateIndex(SEND_FROM_STATE)) throw new LpError("The investor has not finished the first steps yet (open the portal, confirm details, accept the terms).", 409, "not_ready")
  if (!(Number(lp.commitment_amount) > 0)) throw new LpError("Set this LP's commitment amount first.", 422, "no_commitment")
  const [pk] = (await sql`SELECT id FROM fund_subscription_packages WHERE fund_id = ${lp.fund_id} AND status = 'current'`) as any[]
  if (!pk) throw new LpError("Publish a subscription package first.", 409, "no_package")
  const [cur] = (await sql`SELECT status FROM lp_subscriptions WHERE lp_id = ${lpId}`) as any[]
  if (cur && !["rejected", "sent"].includes(cur.status)) throw new LpError(cur.status === "returned" ? "This investor has already returned their documents. Accept or reject them." : "This subscription is already countersigned.", 409, "state")
  const date = input.date ? String(input.date).slice(0, 10) : null
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new LpError("Enter the subscription date as YYYY-MM-DD.")
  const cls = input.shareClass ? String(input.shareClass).trim().slice(0, 60) : null
  await sql`INSERT INTO lp_subscriptions (lp_id, fund_id, package_id, commitment_amount, share_class, subscription_date, status, sent_by)
    VALUES (${lpId}, ${lp.fund_id}, ${String(pk.id)}::uuid, ${Number(lp.commitment_amount)}, ${cls}, ${date}::date, 'sent', ${by})
    ON CONFLICT (lp_id) DO UPDATE SET package_id = EXCLUDED.package_id, commitment_amount = EXCLUDED.commitment_amount, share_class = EXCLUDED.share_class, subscription_date = EXCLUDED.subscription_date,
      status = 'sent', sent_at = now(), sent_by = EXCLUDED.sent_by, returned_at = NULL, ack_name = NULL, ack_at = NULL, ack_ip = NULL, ack_hashes = NULL, decided_at = NULL, decided_by = NULL, rejection_reason = NULL`
  await sql`UPDATE fund_lps SET subscription_status = 'invited', updated_at = now() WHERE id = ${lpId} AND subscription_status IN ('prospective', 'invited')`
}

// ───────────── what the LP sees and does ─────────────
export interface LpSubscriptionView {
  status: "sent" | "returned" | "countersigned" | "rejected"
  commitment: number; shareClass: string | null; subscriptionDate: string | null; rejectionReason: string | null; returnedAt: string | null; decidedAt: string | null
  docs: Array<{ id: string; title: string; filename: string; sizeBytes: number }>
  signedCopy: { id: string; filename: string; sizeBytes: number } | null
  countersignedCopy: { id: string; filename: string; sizeBytes: number } | null
}
export async function lpSubscriptionView(lpId: string): Promise<LpSubscriptionView | null> {
  const [s] = (await sql`SELECT * FROM lp_subscriptions WHERE lp_id = ${lpId}`) as any[]
  if (!s) return null
  const files = (await sql`SELECT id, role, title, filename, size_bytes FROM lp_subscription_files WHERE superseded = false AND ((package_id = ${String(s.package_id)}::uuid AND role = 'package_doc') OR (lp_id = ${lpId} AND role IN ('signed_copy', 'countersigned_copy'))) ORDER BY created_at, filename`) as any[]
  const f = (r: any) => ({ id: String(r.id), filename: r.filename, sizeBytes: Number(r.size_bytes) })
  const d = (v: unknown) => (v ? new Date(v as string).toISOString().slice(0, 10) : null)
  return {
    status: s.status, commitment: Number(s.commitment_amount), shareClass: s.share_class ?? null, subscriptionDate: d(s.subscription_date), rejectionReason: s.rejection_reason ?? null, returnedAt: d(s.returned_at), decidedAt: d(s.decided_at),
    docs: files.filter((r) => r.role === "package_doc").map((r) => ({ ...f(r), title: r.title ?? r.filename })),
    signedCopy: files.filter((r) => r.role === "signed_copy").map(f).at(-1) ?? null,
    countersignedCopy: s.status === "countersigned" ? files.filter((r) => r.role === "countersigned_copy").map(f).at(-1) ?? null : null,
  }
}

/** A file the LP may download: a document of the package sent to them, or their own signed or countersigned copy. */
export async function fileForLp(lpId: string, fileId: string): Promise<{ filename: string; contentType: string; bytes: Buffer } | null> {
  const [r] = (await sql`SELECT f.filename, f.content_type, f.content FROM lp_subscription_files f JOIN lp_subscriptions s ON s.lp_id = ${lpId}
    WHERE f.id = ${fileId}::uuid AND ((f.role = 'package_doc' AND f.package_id = s.package_id) OR (f.lp_id = ${lpId} AND f.role = 'signed_copy') OR (f.lp_id = ${lpId} AND f.role = 'countersigned_copy' AND s.status = 'countersigned'))`) as any[]
  return r ? { filename: r.filename, contentType: r.content_type, bytes: Buffer.from(r.content) } : null
}

/**
 * The LP acknowledges the documents (typing their name) and returns the signed copy. The acknowledgement records the SHA-256 of every document of the package they were sent,
 * so it is clear exactly what they agreed to. Allowed when the documents were sent, or sent back after a rejection.
 */
export async function returnSigned(lpId: string, input: { ackName: unknown; agree: unknown; filename: string; bytes: Buffer }, ip: string | null): Promise<void> {
  const [s] = (await sql`SELECT status, package_id, fund_id FROM lp_subscriptions WHERE lp_id = ${lpId}`) as any[]
  if (!s) throw new LpError("No subscription documents have been sent to you yet.", 409, "not_sent")
  if (!["sent", "rejected"].includes(s.status)) throw new LpError(s.status === "returned" ? "You have already returned your documents. The fund will review them." : "Your subscription is already countersigned.", 409, "state")
  const name = String(input.ackName ?? "").replace(/\s+/g, " ").trim().slice(0, 160)
  if (name.length < 3) throw new LpError("Type your full name to confirm.")
  if (input.agree !== true && input.agree !== "true" && input.agree !== "on") throw new LpError("Please tick the box to confirm you have read the documents.")
  checkPdf(input.filename, input.bytes)
  const docs = (await sql`SELECT id, sha256 FROM lp_subscription_files WHERE package_id = ${String(s.package_id)}::uuid AND role = 'package_doc' ORDER BY created_at, filename`) as any[]
  await sql`UPDATE lp_subscription_files SET superseded = true WHERE lp_id = ${lpId} AND role = 'signed_copy' AND superseded = false`
  await sql`INSERT INTO lp_subscription_files (fund_id, package_id, lp_id, role, title, filename, size_bytes, sha256, content, uploaded_by)
    VALUES (${s.fund_id}, ${String(s.package_id)}::uuid, ${lpId}, 'signed_copy', 'Signed copy', ${cleanName(input.filename)}, ${input.bytes.length}, ${sha256(input.bytes)}, ${input.bytes}, 'lp')`
  await sql`UPDATE lp_subscriptions SET status = 'returned', returned_at = now(), ack_name = ${name}, ack_at = now(), ack_ip = ${ip}, ack_hashes = ${JSON.stringify(docs.map((d) => ({ id: String(d.id), sha256: d.sha256 })))}::jsonb, rejection_reason = NULL WHERE lp_id = ${lpId}`
  await sql`UPDATE fund_lps SET subscription_status = 'signed', updated_at = now() WHERE id = ${lpId} AND subscription_status IN ('prospective', 'invited', 'signed')`
  await advance(lpId, "subscription_returned")
}

// ───────────── the fund's decision ─────────────
export interface SubscriptionReview { lpId: string; status: string; commitment: number; shareClass: string | null; sentAt: string; returnedAt: string | null; ackName: string | null; rejectionReason: string | null; signedCopy: { id: string; filename: string; sizeBytes: number; sha256: string; scanned: boolean } | null }
export async function reviewsForFund(fundId: string): Promise<Record<string, SubscriptionReview>> {
  const rows = (await sql`SELECT s.*, f.id AS fid, f.filename, f.size_bytes, f.sha256, f.scanned FROM lp_subscriptions s
    LEFT JOIN LATERAL (SELECT * FROM lp_subscription_files x WHERE x.lp_id = s.lp_id AND x.role = 'signed_copy' AND x.superseded = false ORDER BY x.created_at DESC LIMIT 1) f ON true WHERE s.fund_id = ${fundId}`) as any[]
  return Object.fromEntries(rows.map((r) => [String(r.lp_id), { lpId: String(r.lp_id), status: r.status, commitment: Number(r.commitment_amount), shareClass: r.share_class ?? null, sentAt: new Date(r.sent_at).toISOString().slice(0, 10), returnedAt: r.returned_at ? new Date(r.returned_at).toISOString().slice(0, 10) : null, ackName: r.ack_name ?? null, rejectionReason: r.rejection_reason ?? null,
    signedCopy: r.fid ? { id: String(r.fid), filename: r.filename, sizeBytes: Number(r.size_bytes), sha256: r.sha256, scanned: !!r.scanned } : null }]))
}

export async function fileForFund(fundId: string, fileId: string): Promise<{ filename: string; contentType: string; bytes: Buffer } | null> {
  const [r] = (await sql`SELECT filename, content_type, content FROM lp_subscription_files WHERE id = ${fileId}::uuid AND fund_id = ${fundId}`) as any[]
  return r ? { filename: r.filename, contentType: r.content_type, bytes: Buffer.from(r.content) } : null
}

/** The fund accepts (countersigns) or rejects the returned documents. Only from 'returned'. Accepting makes the commitment active and may attach the fund's own countersigned PDF. */
export async function decide(lpId: string, by: string, input: { decision: "accept" | "reject"; reason?: unknown; countersigned?: { filename: string; bytes: Buffer } | null }): Promise<void> {
  const [s] = (await sql`SELECT status, fund_id FROM lp_subscriptions WHERE lp_id = ${lpId}`) as any[]
  if (!s) throw new LpError("No subscription has been sent to this LP.", 404)
  if (s.status !== "returned") throw new LpError("There is nothing returned to decide on.", 409, "state")
  if (input.decision === "reject") {
    const reason = String(input.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 500)
    if (reason.length < 5) throw new LpError("Say why, so the investor knows what to fix.")
    await sql`UPDATE lp_subscriptions SET status = 'rejected', decided_at = now(), decided_by = ${by}, rejection_reason = ${reason} WHERE lp_id = ${lpId}`
    await sql`UPDATE fund_lps SET subscription_status = 'invited', updated_at = now() WHERE id = ${lpId}`
    return
  }
  if (input.countersigned) {
    checkPdf(input.countersigned.filename, input.countersigned.bytes)
    await sql`UPDATE lp_subscription_files SET superseded = true WHERE lp_id = ${lpId} AND role = 'countersigned_copy' AND superseded = false`
    await sql`INSERT INTO lp_subscription_files (fund_id, lp_id, role, title, filename, size_bytes, sha256, content, uploaded_by)
      VALUES (${s.fund_id}, ${lpId}, 'countersigned_copy', 'Countersigned copy', ${cleanName(input.countersigned.filename)}, ${input.countersigned.bytes.length}, ${sha256(input.countersigned.bytes)}, ${input.countersigned.bytes}, ${`gp:${by}`})`
  }
  await sql`UPDATE lp_subscriptions SET status = 'countersigned', decided_at = now(), decided_by = ${by}, rejection_reason = NULL WHERE lp_id = ${lpId}`
  await sql`UPDATE fund_lps SET subscription_status = 'countersigned', signed_at = COALESCE(signed_at, CURRENT_DATE), updated_at = now() WHERE id = ${lpId}`
  await advance(lpId, "countersigned")
}
