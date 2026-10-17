import { createHash, randomUUID } from "node:crypto"
import { sql } from "@/lib/db"
import { decryptBytes, decryptSecret, encryptBytes, encryptSecret } from "@/lib/db/secrets"
import { REQUIRED_DOCS, recomputeCase } from "@/lib/modules/kyc"
import { logAudit } from "@/lib/audit/audit-log"
import { LpError, advance, stateIndex } from "./lp-onboarding"

/**
 * The LP leg, slice L3 (docs/architecture/60 section 6): identity and address documents an investor sends, and what they declare about themselves.
 * Anker COLLECTS and ORGANISES. A person at the fund looks at each document and decides; nothing here accepts or rejects an investor, scores anyone,
 * or reads a document. Files are encrypted before they are stored and are never used as input to any AI feature.
 */
export const MAX_FILE_BYTES = 4 * 1024 * 1024
export const CATEGORIES = ["professional", "semi_professional", "other", "unsure"] as const
export const CATEGORY_LABEL: Record<string, string> = { professional: "A professional investor", semi_professional: "A semi-professional investor", other: "Another kind of investor", unsure: "I am not sure" }

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex")

/** PDF, JPEG or PNG, judged by the first bytes and not by the name. */
export function sniff(bytes: Buffer): { contentType: string; ext: string } | null {
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return { contentType: "application/pdf", ext: "pdf" }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { contentType: "image/jpeg", ext: "jpg" }
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { contentType: "image/png", ext: "png" }
  return null
}

export const requiredFor = (entityType: string | null | undefined) => REQUIRED_DOCS[entityType === "individual" || !entityType ? "individual" : "entity"]
const subjectType = (entityType: string | null | undefined): "individual" | "entity" => (entityType === "individual" || !entityType ? "individual" : "entity")

async function lpContext(lpId: string) {
  const [r] = (await sql`SELECT l.fund_id, l.lp_name, l.onboarding_state, d.legal_name, d.entity_type,
      (SELECT created_by FROM lp_portal_tokens t WHERE t.lp_id = l.id AND t.created_by IS NOT NULL ORDER BY t.created_at DESC LIMIT 1) AS inviter
    FROM fund_lps l LEFT JOIN lp_onboarding_details d ON d.lp_id = l.id WHERE l.id = ${lpId}`) as any[]
  if (!r) throw new LpError("LP not found.", 404)
  return { fundId: String(r.fund_id), name: String(r.legal_name ?? r.lp_name), entityType: (r.entity_type as string | null) ?? null, state: String(r.onboarding_state), inviter: r.inviter ? String(r.inviter) : "lp-portal" }
}

/** The case and its document checklist, created on the investor's first upload or declaration. The case belongs to the user who invited the investor. */
async function ensureCase(lpId: string): Promise<{ caseId: string; fundId: string; entityType: string | null }> {
  const ctx = await lpContext(lpId)
  if (stateIndex(ctx.state) < stateIndex("details_confirmed")) throw new LpError("Please confirm your details first.", 409, "order")
  const [v] = (await sql`SELECT case_id FROM lp_verification WHERE lp_id = ${lpId}`) as any[]
  let caseId: string | null = v?.case_id ?? null
  if (!caseId) {
    const [existing] = (await sql`SELECT id FROM kyc_cases WHERE fund_lp_id = ${lpId} ORDER BY created_at LIMIT 1`) as any[]
    caseId = existing?.id ?? null
  }
  if (!caseId) {
    const [c] = (await sql`INSERT INTO kyc_cases (created_by, fund_id, fund_lp_id, subject_name, subject_type) VALUES (${ctx.inviter}, ${ctx.fundId}, ${lpId}, ${ctx.name}, ${subjectType(ctx.entityType)}) RETURNING id`) as any[]
    caseId = String(c.id)
  }
  await sql`INSERT INTO lp_verification (lp_id, fund_id, case_id) VALUES (${lpId}, ${ctx.fundId}, ${caseId}) ON CONFLICT (lp_id) DO UPDATE SET case_id = EXCLUDED.case_id`
  for (const d of requiredFor(ctx.entityType)) {
    const [has] = (await sql`SELECT 1 AS x FROM kyc_documents WHERE case_id = ${caseId} AND doc_type = ${d.type} LIMIT 1`) as any[]
    if (!has) await sql`INSERT INTO kyc_documents (case_id, doc_type, label) VALUES (${caseId}, ${d.type}, ${d.label})`
  }
  return { caseId, fundId: ctx.fundId, entityType: ctx.entityType }
}

// ───────────── the investor ─────────────
export interface VerificationView {
  required: Array<{ type: string; label: string; status: "requested" | "received" | "verified" | "rejected"; receivedAt: string | null; note: string | null; filename: string | null }>
  category: string | null; owners: string | null; needsOwners: boolean; submitted: boolean; ready: boolean; unlocked: boolean
}
export async function verificationView(lpId: string): Promise<VerificationView | null> {
  const [l] = (await sql`SELECT l.onboarding_state, d.entity_type FROM fund_lps l LEFT JOIN lp_onboarding_details d ON d.lp_id = l.id WHERE l.id = ${lpId}`) as any[]
  if (!l) return null
  const unlocked = stateIndex(l.onboarding_state) >= stateIndex("details_confirmed")
  const required = requiredFor(l.entity_type)
  const [v] = (await sql`SELECT case_id, investor_category, owners_enc, submitted_at FROM lp_verification WHERE lp_id = ${lpId}`) as any[]
  const docs = v?.case_id ? ((await sql`SELECT d.doc_type, d.status, d.received_at, (SELECT f.review_note FROM kyc_document_files f WHERE f.doc_id = d.id AND f.superseded = false ORDER BY f.created_at DESC LIMIT 1) AS note,
      (SELECT f.filename FROM kyc_document_files f WHERE f.doc_id = d.id AND f.superseded = false ORDER BY f.created_at DESC LIMIT 1) AS filename FROM kyc_documents d WHERE d.case_id = ${v.case_id}`) as any[]) : []
  const rows = required.map((r) => { const d = docs.find((x) => x.doc_type === r.type); return { type: r.type, label: r.label, status: (d?.status ?? "requested") as VerificationView["required"][number]["status"], receivedAt: d?.received_at ? new Date(d.received_at).toISOString().slice(0, 10) : null, note: d?.status === "rejected" ? d.note ?? null : null, filename: d?.filename ?? null } })
  const needsOwners = subjectType(l.entity_type) === "entity"
  const owners = v?.owners_enc ? decryptSecret(v.owners_enc) : null
  const ready = unlocked && rows.every((r) => r.status === "received" || r.status === "verified") && !!v?.investor_category && (!needsOwners || !!owners)
  return { required: rows, category: v?.investor_category ?? null, owners, needsOwners, submitted: !!v?.submitted_at, ready, unlocked }
}

/** Stores one document, encrypted. A document the fund already verified is not replaced; a rejected or earlier one is superseded. */
export async function uploadDocument(lpId: string, docType: unknown, file: { filename: string; bytes: Buffer }): Promise<void> {
  const { caseId, fundId, entityType } = await ensureCase(lpId)
  const type = String(docType ?? "")
  if (!requiredFor(entityType).some((d) => d.type === type)) throw new LpError("That is not one of the documents asked for.")
  if (!file.bytes.length) throw new LpError("The file is empty.")
  if (file.bytes.length > MAX_FILE_BYTES) throw new LpError(`The file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB. Please send a smaller PDF or photo.`, 413, "too_large")
  const kind = sniff(file.bytes)
  if (!kind) throw new LpError("Please send a PDF, JPEG or PNG file.", 415, "type")
  const [doc] = (await sql`SELECT id, status FROM kyc_documents WHERE case_id = ${caseId} AND doc_type = ${type} LIMIT 1`) as any[]
  if (doc.status === "verified") throw new LpError("This document has already been checked by the fund.", 409, "verified")
  let enc: Buffer
  try { enc = encryptBytes(file.bytes) } catch { throw new LpError("Documents cannot be stored securely right now. Please try again later.", 503, "no_key") }
  await sql`UPDATE kyc_document_files SET superseded = true WHERE doc_id = ${String(doc.id)} AND superseded = false`
  await sql`INSERT INTO kyc_document_files (id, fund_id, case_id, doc_id, lp_id, filename, content_type, size_bytes, sha256, content_enc) VALUES (${randomUUID()}::uuid, ${fundId}, ${caseId}, ${String(doc.id)}, ${lpId}, ${file.filename.replace(/[\r\n"\\/]/g, " ").trim().slice(0, 120) || `document.${kind.ext}`}, ${kind.contentType}, ${file.bytes.length}, ${sha256(file.bytes)}, ${enc})`
  await sql`UPDATE kyc_documents SET status = 'received', received_at = now() WHERE id = ${String(doc.id)}`
  await recomputeCase(caseId)
  await sql`UPDATE lp_verification SET submitted_at = NULL WHERE lp_id = ${lpId}`      // changing a document reopens the submission
}

export async function declare(lpId: string, input: { category: unknown; owners?: unknown }): Promise<void> {
  const { fundId, entityType } = await ensureCase(lpId)
  const category = String(input.category ?? "")
  if (!(CATEGORIES as readonly string[]).includes(category)) throw new LpError("Choose the kind of investor you are.")
  const owners = String(input.owners ?? "").replace(/[ \t]+/g, " ").trim().slice(0, 2000)
  if (subjectType(entityType) === "entity" && owners.length < 5) throw new LpError("Say who owns and controls the entity (names and shares).")
  await sql`UPDATE lp_verification SET investor_category = ${category}, owners_enc = ${owners ? encryptSecret(owners) : null}, declared_at = now(), submitted_at = NULL, fund_id = ${fundId} WHERE lp_id = ${lpId}`
}

/** The investor says they are done. Needs every document and the declaration; the fund is told by the step changing. */
export async function submit(lpId: string): Promise<void> {
  await ensureCase(lpId)
  const v = await verificationView(lpId)
  if (!v?.ready) throw new LpError("Please add every document and answer the questions first.", 409, "incomplete")
  await sql`UPDATE lp_verification SET submitted_at = now() WHERE lp_id = ${lpId}`
  await advance(lpId, "verification_submitted")
}

// ───────────── the fund ─────────────
export interface VerificationReview {
  lpId: string; caseId: string | null; caseStatus: string | null; submittedAt: string | null; category: string | null; ownersProvided: boolean
  docs: Array<{ docId: string; type: string; label: string; status: string; fileId: string | null; filename: string | null; sizeBytes: number | null; sha256: string | null; receivedAt: string | null; note: string | null }>
}
export async function reviewsForFund(fundId: string): Promise<Record<string, VerificationReview>> {
  const vs = (await sql`SELECT v.lp_id, v.case_id, v.investor_category, v.owners_enc, v.submitted_at, c.status AS case_status FROM lp_verification v LEFT JOIN kyc_cases c ON c.id = v.case_id WHERE v.fund_id = ${fundId}`) as any[]
  const out: Record<string, VerificationReview> = {}
  for (const v of vs) {
    const docs = v.case_id ? ((await sql`SELECT d.id, d.doc_type, d.label, d.status, d.received_at, f.id AS fid, f.filename, f.size_bytes, f.sha256, f.review_note
      FROM kyc_documents d LEFT JOIN LATERAL (SELECT * FROM kyc_document_files x WHERE x.doc_id = d.id AND x.superseded = false ORDER BY x.created_at DESC LIMIT 1) f ON true WHERE d.case_id = ${v.case_id} ORDER BY d.created_at`) as any[]) : []
    out[String(v.lp_id)] = { lpId: String(v.lp_id), caseId: v.case_id ?? null, caseStatus: v.case_status ?? null, submittedAt: v.submitted_at ? new Date(v.submitted_at).toISOString().slice(0, 10) : null, category: v.investor_category ?? null, ownersProvided: !!v.owners_enc,
      docs: docs.map((d) => ({ docId: String(d.id), type: d.doc_type, label: d.label ?? d.doc_type, status: d.status, fileId: d.fid ? String(d.fid) : null, filename: d.filename ?? null, sizeBytes: d.size_bytes != null ? Number(d.size_bytes) : null, sha256: d.sha256 ?? null, receivedAt: d.received_at ? new Date(d.received_at).toISOString().slice(0, 10) : null, note: d.review_note ?? null })) }
  }
  return out
}

/** What the investor said about who owns the entity: shown to the fund's managers on request, never returned in a list. */
export async function ownersFor(fundId: string, lpId: string): Promise<string | null> {
  const [v] = (await sql`SELECT owners_enc FROM lp_verification WHERE lp_id = ${lpId} AND fund_id = ${fundId}`) as any[]
  return v?.owners_enc ? decryptSecret(v.owners_enc) : null
}

export async function fileForFund(fundId: string, fileId: string): Promise<{ filename: string; contentType: string; bytes: Buffer; lpId: string | null } | null> {
  const [r] = (await sql`SELECT filename, content_type, content_enc, lp_id FROM kyc_document_files WHERE id = ${fileId}::uuid AND fund_id = ${fundId}`) as any[]
  if (!r) return null
  const bytes = decryptBytes(Buffer.from(r.content_enc))
  return bytes ? { filename: r.filename, contentType: r.content_type, bytes, lpId: r.lp_id ?? null } : null
}

/** A person at the fund marks one document checked, or sends it back with a reason. This is about the document, not about the investor. */
export async function reviewDocument(lpId: string, by: string, input: { docType: unknown; decision: "verify" | "reject"; note?: unknown }): Promise<void> {
  const [v] = (await sql`SELECT case_id FROM lp_verification WHERE lp_id = ${lpId}`) as any[]
  if (!v?.case_id) throw new LpError("This investor has not started verification.", 404)
  const [d] = (await sql`SELECT id, status FROM kyc_documents WHERE case_id = ${v.case_id} AND doc_type = ${String(input.docType ?? "")} LIMIT 1`) as any[]
  if (!d) throw new LpError("Unknown document.", 404)
  if (d.status === "requested") throw new LpError("Nothing has been uploaded for this document yet.", 409, "empty")
  if (input.decision === "reject") {
    const note = String(input.note ?? "").replace(/\s+/g, " ").trim().slice(0, 300)
    if (note.length < 5) throw new LpError("Say what is wrong, so the investor can fix it.")
    await sql`UPDATE kyc_documents SET status = 'rejected' WHERE id = ${String(d.id)}`
    await sql`UPDATE kyc_document_files SET review_note = ${note} WHERE doc_id = ${String(d.id)} AND superseded = false`
    await sql`UPDATE lp_verification SET submitted_at = NULL WHERE lp_id = ${lpId}`
  } else {
    await sql`UPDATE kyc_documents SET status = 'verified' WHERE id = ${String(d.id)}`
    await sql`UPDATE kyc_document_files SET review_note = NULL WHERE doc_id = ${String(d.id)} AND superseded = false`
  }
  await recomputeCase(String(v.case_id))
  await logAudit({ actorId: by, action: `kyc_document.${input.decision === "verify" ? "verified" : "rejected"}`, targetType: "kyc_document", targetId: String(d.id), metadata: { lpId, via: "lp_portal" } })
}
