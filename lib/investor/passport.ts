/**
 * The verification passport (docs/architecture/70): identity documents an investor entity keeps once, and shares with a fund — a copy, with consent, per fund — when that fund's onboarding asks.
 * Collects and passes on; never reads, scores or judges a document, and no AI feature touches the files.
 */
import { createHash, randomUUID } from "node:crypto"
import { sql } from "@/lib/db"
import { decryptBytes, encryptBytes } from "@/lib/db/secrets"
import { REQUIRED_DOCS, recomputeCase } from "@/lib/modules/kyc"
import { logAudit } from "@/lib/audit/audit-log"
import { InvestorError, logEvent, requireEntity } from "./profile"
import { LEGAL_VERSION } from "./legal"
import { enforceScan } from "./scan"
import { TEXTS } from "./legal"

export const MAX_FILE_BYTES = 4 * 1024 * 1024
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex")
const subject = (kind: string) => (kind === "individual" ? "individual" : "entity") as "individual" | "entity"
export const docTypesFor = (kind: string) => REQUIRED_DOCS[subject(kind)]

/** PDF, JPEG or PNG, judged by the first bytes and not by the name. */
export function sniff(bytes: Buffer): { contentType: string } | null {
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return { contentType: "application/pdf" }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { contentType: "image/jpeg" }
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { contentType: "image/png" }
  return null
}

export interface PassportDoc { id: string; type: string; label: string; filename: string; sizeBytes: number; addedAt: string; shares: Array<{ id: string; fundName: string; sharedAt: string; revokedAt: string | null; retained: boolean }> }
export const FLAG = "investor_passport"
/** The passport is closed until the platform opens it. Taking things back and deleting always work. */
export async function passportOpen(): Promise<boolean> {
  try { const [r] = (await sql`SELECT enabled FROM platform_flags WHERE key = ${FLAG}`) as any[]; return !!r?.enabled } catch { return false }
}
const CLOSED = () => new InvestorError(TEXTS.passportClosed.text, 403, "closed")

export interface PassportView {
  open: boolean; entityId: string; role: string; canEdit: boolean
  wanted: Array<{ type: string; label: string; doc: PassportDoc | null }>
  /** Onboarding relationships this entity could share with. */
  funds: Array<{ relationshipId: string; fundName: string; wants: string[] }>
}

export async function passportOf(userId: string, entityId: string): Promise<PassportView> {
  const e = await requireEntity(userId, entityId, "view")
  const canEdit = e.role !== "can_view"
  const docs = (await sql`SELECT id, doc_type, filename, size_bytes, created_at FROM passport_documents WHERE entity_id = ${entityId} AND superseded = false ORDER BY created_at DESC`) as any[]
  const shares = (await sql`SELECT s.id, s.document_id, s.shared_at, s.revoked_at, s.retained, COALESCE(l.snapshot->>'name', f.name, 'A fund') AS fund_name FROM passport_shares s LEFT JOIN fund_listings l ON l.fund_id = s.with_fund LEFT JOIN funds f ON f.id = s.with_fund WHERE s.entity_id = ${entityId} ORDER BY s.shared_at DESC`) as any[]
  const wanted = docTypesFor(e.kind).map((t) => {
    const d = docs.find((x) => x.doc_type === t.type)
    return { type: t.type, label: t.label, doc: d ? { id: String(d.id), type: t.type, label: t.label, filename: canEdit ? d.filename : "(hidden)", sizeBytes: Number(d.size_bytes), addedAt: new Date(d.created_at).toISOString(),
      shares: shares.filter((s) => String(s.document_id) === String(d.id)).map((s) => ({ id: String(s.id), fundName: s.fund_name, sharedAt: new Date(s.shared_at).toISOString(), revokedAt: s.revoked_at ? new Date(s.revoked_at).toISOString() : null, retained: !!s.retained })) } : null }
  })
  const rels = canEdit ? ((await sql`SELECT r.id, COALESCE(l.snapshot->>'name', f.name, 'A fund') AS fund_name, r.fund_lp_id FROM fund_relationships r LEFT JOIN fund_listings l ON l.fund_id = r.fund_id LEFT JOIN funds f ON f.id = r.fund_id
    WHERE r.entity_id = ${entityId} AND r.fund_lp_id IS NOT NULL AND r.stage IN ('invited_to_onboard', 'onboarding')`) as any[]) : []
  const funds = []
  for (const r of rels) {
    const need = (await sql`SELECT d.doc_type FROM lp_verification v JOIN kyc_documents d ON d.case_id = v.case_id WHERE v.lp_id = ${r.fund_lp_id} AND d.status IN ('requested', 'rejected')`.catch(() => [])) as any[]
    funds.push({ relationshipId: String(r.id), fundName: r.fund_name, wants: need.map((n) => String(n.doc_type)) })
  }
  return { open: await passportOpen(), entityId, role: e.role, canEdit, wanted, funds }
}

/** Adds or replaces one document, encrypted. */
export async function addDocument(userId: string, entityId: string, docType: unknown, file: { filename: string; bytes: Buffer }): Promise<void> {
  if (!(await passportOpen())) throw CLOSED()
  const e = await requireEntity(userId, entityId, "act")
  const type = String(docType ?? "")
  if (!docTypesFor(e.kind).some((d) => d.type === type)) throw new InvestorError("That is not one of the documents asked for.")
  if (!file.bytes.length) throw new InvestorError("The file is empty.")
  if (file.bytes.length > MAX_FILE_BYTES) throw new InvestorError(`The file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB. Please send a smaller PDF or photo.`, 413, "too_large")
  const kind = sniff(file.bytes)
  if (!kind) throw new InvestorError("Please send a PDF, JPEG or PNG file.", 415, "type")
  await enforceScan([file])
  let enc: Buffer
  try { enc = encryptBytes(file.bytes) } catch { throw new InvestorError("Documents cannot be stored securely right now. Please try again later.", 503, "no_key") }
  // The replaced file's bytes are wiped; its record stays so earlier shares keep their history.
  await sql`UPDATE passport_documents SET superseded = true, content_enc = ''::bytea WHERE entity_id = ${entityId} AND doc_type = ${type} AND superseded = false`
  await sql`INSERT INTO passport_documents (id, entity_id, doc_type, filename, content_type, size_bytes, sha256, content_enc, uploaded_by) VALUES (${randomUUID()}::uuid, ${entityId}, ${type}, ${file.filename.replace(/[\r\n"\\/]/g, " ").slice(0, 200) || "document"}, ${kind.contentType}, ${file.bytes.length}, ${sha256(file.bytes)}, ${enc}, ${userId})`
  await logEvent(entityId, userId, "passport_added", { type })
}

/** The investor's own copy, for download. Not for viewers. */
export async function ownCopy(userId: string, entityId: string, docId: string): Promise<{ filename: string; contentType: string; bytes: Buffer }> {
  await requireEntity(userId, entityId, "act")
  const [r] = (await sql`SELECT filename, content_type, content_enc FROM passport_documents WHERE id::text = ${docId} AND entity_id = ${entityId}`) as any[]
  const bytes = r ? decryptBytes(Buffer.from(r.content_enc)) : null
  if (!r || !bytes) throw new InvestorError("That document was not found.", 404, "not_found")
  return { filename: r.filename, contentType: r.content_type, bytes }
}

/** Shares chosen documents with one fund that is onboarding this entity. A copy, as if the investor had uploaded it there. */
export async function shareWithFund(userId: string, entityId: string, relationshipId: string, docTypes: unknown): Promise<{ shared: string[]; skipped: Array<{ type: string; why: string }> }> {
  if (!(await passportOpen())) throw CLOSED()
  const e = await requireEntity(userId, entityId, "act")
  const types = [...new Set((Array.isArray(docTypes) ? docTypes : []).map(String))]
  if (!types.length) throw new InvestorError("Choose at least one document to share.")
  const [r] = (await sql`SELECT id, fund_id, fund_lp_id, stage FROM fund_relationships WHERE id::text = ${relationshipId} AND entity_id = ${entityId}`) as any[]
  if (!r) throw new InvestorError("That fund was not found for this entity.", 404, "not_found")
  if (!r.fund_lp_id || !["invited_to_onboard", "onboarding"].includes(r.stage)) throw new InvestorError("You can share documents once the fund has invited you to onboard.", 409, "stage")
  const { uploadDocument } = await import("@/lib/portfolio/lp-verification")
  const shared: string[] = [], skipped: Array<{ type: string; why: string }> = []
  for (const type of types) {
    if (!docTypesFor(e.kind).some((d) => d.type === type)) { skipped.push({ type, why: "not a document asked for" }); continue }
    const [d] = (await sql`SELECT id, filename, content_enc, sha256 FROM passport_documents WHERE entity_id = ${entityId} AND doc_type = ${type} AND superseded = false`) as any[]
    if (!d) { skipped.push({ type, why: "not in your passport yet" }); continue }
    const bytes = decryptBytes(Buffer.from(d.content_enc))
    if (!bytes) { skipped.push({ type, why: "could not be read" }); continue }
    try { await uploadDocument(String(r.fund_lp_id), type, { filename: String(d.filename), bytes }) }
    catch (x: any) { skipped.push({ type, why: x?.code === "verified" ? "the fund has already checked this one" : String(x?.message ?? "the fund could not take it").slice(0, 120) }); continue }
    await sql`INSERT INTO passport_shares (document_id, entity_id, relationship_id, with_fund, lp_id, doc_type, sha256, shared_by, consent_version) VALUES (${String(d.id)}::uuid, ${entityId}, ${String(r.id)}::uuid, ${r.fund_id}, ${String(r.fund_lp_id)}, ${type}, ${String(d.sha256)}, ${userId}, ${LEGAL_VERSION})`
    shared.push(type)
    await logAudit({ actorId: userId, action: "passport.shared", targetType: "passport_document", targetId: String(d.id), metadata: { fundId: r.fund_id, lpId: r.fund_lp_id, type } })
  }
  if (shared.length) await logEvent(entityId, userId, "passport_shared", { fundId: r.fund_id, types: shared })
  return { shared, skipped }
}

/** Takes back a share: an unseen copy is deleted, a checked one stays with the fund for its records, a replaced one is left alone. */
export async function revokeShare(userId: string, entityId: string, shareId: string): Promise<{ outcome: "deleted" | "retained" | "replaced" }> {
  await requireEntity(userId, entityId, "act")
  const [s] = (await sql`SELECT * FROM passport_shares WHERE id::text = ${shareId} AND entity_id = ${entityId} AND revoked_at IS NULL`) as any[]
  if (!s) throw new InvestorError("That share was not found.", 404, "not_found")
  const [v] = (await sql`SELECT case_id FROM lp_verification WHERE lp_id = ${s.lp_id}`) as any[]
  let outcome: "deleted" | "retained" | "replaced" = "replaced"
  if (v?.case_id) {
    const [doc] = (await sql`SELECT id, status FROM kyc_documents WHERE case_id = ${v.case_id} AND doc_type = ${s.doc_type} LIMIT 1`) as any[]
    const [file] = doc ? ((await sql`SELECT id, sha256 FROM kyc_document_files WHERE doc_id = ${String(doc.id)} AND superseded = false ORDER BY created_at DESC LIMIT 1`) as any[]) : []
    if (doc && file && String(file.sha256) === String(s.sha256)) {
      if (doc.status === "received") {
        await sql`DELETE FROM kyc_document_files WHERE id = ${String(file.id)}::uuid`
        await sql`UPDATE kyc_documents SET status = 'requested', received_at = NULL WHERE id = ${String(doc.id)}`
        await sql`UPDATE lp_verification SET submitted_at = NULL WHERE lp_id = ${s.lp_id}`
        await recomputeCase(String(v.case_id))
        outcome = "deleted"
      } else outcome = "retained"                                                       // verified or rejected: the fund has acted on it
    }
  }
  await sql`UPDATE passport_shares SET revoked_at = now(), retained = ${outcome === "retained"} WHERE id = ${s.id}`
  await logAudit({ actorId: userId, action: "passport.share_revoked", targetType: "passport_document", targetId: String(s.document_id), metadata: { fundId: s.with_fund, lpId: s.lp_id, outcome } })
  await logEvent(entityId, userId, "passport_share_revoked", { fundId: s.with_fund, outcome })
  return { outcome }
}

/** Removes a document from the passport; its shares are taken back first by the same rule. */
export async function removeDocument(userId: string, entityId: string, docId: string): Promise<void> {
  await requireEntity(userId, entityId, "act")
  const [d] = (await sql`SELECT id FROM passport_documents WHERE id::text = ${docId} AND entity_id = ${entityId} AND superseded = false`) as any[]
  if (!d) throw new InvestorError("That document was not found.", 404, "not_found")
  const live = (await sql`SELECT id FROM passport_shares WHERE document_id = ${String(d.id)}::uuid AND revoked_at IS NULL`) as any[]
  for (const s of live) await revokeShare(userId, entityId, String(s.id))
  await sql`UPDATE passport_documents SET superseded = true, content_enc = ''::bytea WHERE id = ${String(d.id)}::uuid`
  await logEvent(entityId, userId, "passport_removed")
}
