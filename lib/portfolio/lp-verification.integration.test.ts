import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
const st = vi.hoisted(() => ({ q: null as any, audits: [] as any[] }))
vi.mock("@/lib/db", () => { const f: any = (s: TemplateStringsArray, ...v: unknown[]) => st.q(s.reduce((q, t, i) => q + (i ? `$${i}` : "") + t, ""), v); return { sql: f } })
vi.mock("@/lib/audit/audit-log", () => ({ logAudit: async (a: any) => { st.audits.push(a) } }))
vi.mock("@/lib/audit/record-change", () => ({ recordChange: async () => {}, snapshotRow: async () => null }))
vi.mock("@/lib/config/integration-keys", () => ({ getIntegrationKey: async () => null }))
process.env.SECRET_KEY = "kyc-test-secret"
import { sniff, uploadDocument, declare, submit, reviewDocument, verificationView, reviewsForFund, fileForFund, ownersFor, MAX_FILE_BYTES, requiredFor } from "./lp-verification"
import { LpError } from "./lp-onboarding"
import { encryptBytes, decryptBytes } from "@/lib/db/secrets"

let db: PGlite
const rows = async (q: string, p: unknown[] = []) => (await db.query(q, p)).rows as any[]
const pdf = (tag = "id", size = 200) => Buffer.concat([Buffer.from(`%PDF-1.4\n${tag}\n`), Buffer.alloc(size, 65)])
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(50, 1)])

beforeAll(async () => {
  db = new PGlite(); st.q = async (q: string, v: unknown[] = []) => (await db.query(q, v)).rows
  await db.exec(`CREATE TABLE fund_lps (id text PRIMARY KEY, fund_id text, lp_contact_id text, lp_name text, status text DEFAULT 'committed', metadata jsonb DEFAULT '{}', updated_at timestamptz DEFAULT now());
    CREATE TABLE lp_portal_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lp_id text, created_by text, created_at timestamptz DEFAULT now());`)
  for (const f of ["2026-10-17b-lp-onboarding", "2026-08-15-kyc-aml", "2026-10-17d-lp-verification"]) {
    const sqlText = readFileSync(`scripts/migrations/${f}.sql`, "utf8")
    for (const stmt of sqlText.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean)) await db.exec(stmt)
  }
}, 30000)
afterAll(async () => db.close())
beforeEach(async () => {
  st.audits.length = 0
  await db.exec(`DELETE FROM kyc_document_files; DELETE FROM lp_verification; DELETE FROM kyc_screening_hits; DELETE FROM kyc_documents; DELETE FROM kyc_cases; DELETE FROM lp_onboarding_details; DELETE FROM lp_portal_tokens; DELETE FROM fund_lps;
    INSERT INTO fund_lps (id, fund_id, lp_name) VALUES ('p1','f1','Anna Berg'), ('e1','f1','Berg Holding GmbH'), ('x1','f2','Other');
    UPDATE fund_lps SET onboarding_state = 'opened';
    INSERT INTO lp_onboarding_details (lp_id, legal_name, entity_type) VALUES ('p1','Anna Berg','individual'), ('e1','Berg Holding GmbH','company');
    UPDATE fund_lps SET onboarding_state = 'details_confirmed' WHERE id IN ('p1','e1');
    INSERT INTO lp_portal_tokens (lp_id, created_by) VALUES ('p1','gp-user'), ('e1','gp-user')`)
})
const sendAll = async (lp: string, files: Record<string, Buffer | undefined> = {}) => { for (const d of requiredFor(lp === "e1" ? "company" : "individual")) await uploadDocument(lp, d.type, { filename: `${d.type}.pdf`, bytes: files[d.type] ?? pdf(d.type) }) }

describe("what a file is", () => {
  it("PDF, JPEG or PNG by content, never by name", () => {
    expect(sniff(pdf())!.contentType).toBe("application/pdf"); expect(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))!.contentType).toBe("image/jpeg"); expect(sniff(png())!.contentType).toBe("image/png")
    expect(sniff(Buffer.from("MZ executable"))).toBeNull(); expect(sniff(Buffer.from("<html></html>"))).toBeNull()
  })
  it("file encryption round-trips, differs each time, and a tampered or wrong-key file does not open", () => {
    const b = Buffer.from("passport scan bytes"); const a = encryptBytes(b), c = encryptBytes(b)
    expect(a.equals(c)).toBe(false); expect(a.includes(Buffer.from("passport"))).toBe(false); expect(decryptBytes(a)!.equals(b)).toBe(true)
    const t = Buffer.from(a); t[t.length - 1] ^= 1; expect(decryptBytes(t)).toBeNull(); expect(decryptBytes(Buffer.from([1, 2, 3]))).toBeNull()
  })
})

describe("the investor sends documents", () => {
  it("only after confirming their details; the first upload opens the case with the right checklist for the kind of investor", async () => {
    await db.exec("UPDATE fund_lps SET onboarding_state = 'opened' WHERE id = 'p1'")
    await expect(uploadDocument("p1", "id_document", { filename: "id.pdf", bytes: pdf() })).rejects.toMatchObject({ code: "order" })
    await db.exec("UPDATE fund_lps SET onboarding_state = 'details_confirmed' WHERE id = 'p1'")
    await uploadDocument("p1", "id_document", { filename: "id.pdf", bytes: pdf() })
    const [c] = await rows("SELECT * FROM kyc_cases WHERE fund_lp_id = 'p1'"); expect(c).toMatchObject({ subject_type: "individual", created_by: "gp-user", fund_id: "f1", subject_name: "Anna Berg" })
    expect((await rows("SELECT doc_type FROM kyc_documents WHERE case_id = $1 ORDER BY doc_type", [c.id])).map((d) => d.doc_type)).toEqual(["id_document", "proof_of_address", "source_of_funds"])
    await uploadDocument("e1", "ubo_declaration", { filename: "ubo.pdf", bytes: pdf() })
    expect((await rows("SELECT doc_type FROM kyc_documents d JOIN kyc_cases c ON c.id = d.case_id WHERE c.fund_lp_id = 'e1' ORDER BY 1")).map((d) => d.doc_type)).toContain("certificate_of_incorporation")
  })
  it("refuses a document that was not asked for, a wrong type, an empty file and one that is too large", async () => {
    await expect(uploadDocument("p1", "ubo_declaration", { filename: "x.pdf", bytes: pdf() })).rejects.toThrow(/not one of the documents/)
    await expect(uploadDocument("p1", "id_document", { filename: "x.exe", bytes: Buffer.from("MZ") })).rejects.toMatchObject({ code: "type" })
    await expect(uploadDocument("p1", "id_document", { filename: "x.pdf", bytes: Buffer.alloc(0) })).rejects.toBeInstanceOf(LpError)
    await expect(uploadDocument("p1", "id_document", { filename: "x.pdf", bytes: Buffer.concat([pdf(), Buffer.alloc(MAX_FILE_BYTES)]) })).rejects.toMatchObject({ code: "too_large" })
  })
  it("stores the file encrypted (nothing readable in the database), with the fingerprint of the original; a new file replaces the old; a checked document cannot be replaced", async () => {
    const secret = pdf("SECRET-PASSPORT-NUMBER-X123"); await uploadDocument("p1", "id_document", { filename: "passport.pdf", bytes: secret })
    const [f] = await rows("SELECT * FROM kyc_document_files"); expect(Buffer.from(f.content_enc).includes(Buffer.from("SECRET-PASSPORT"))).toBe(false); expect(f.sha256).toHaveLength(64); expect(f.content_type).toBe("application/pdf")
    await uploadDocument("p1", "id_document", { filename: "passport2.png", bytes: png() })
    expect(await rows("SELECT superseded, content_type FROM kyc_document_files ORDER BY created_at")).toEqual([{ superseded: true, content_type: "application/pdf" }, { superseded: false, content_type: "image/png" }])
    await reviewDocument("p1", "gp", { docType: "id_document", decision: "verify" })
    await expect(uploadDocument("p1", "id_document", { filename: "again.pdf", bytes: pdf() })).rejects.toMatchObject({ code: "verified" })
  })
})

describe("declaring and finishing", () => {
  it("an entity must say who owns it; the answer is stored encrypted; nothing is complete until every document and the answers are in", async () => {
    await expect(declare("e1", { category: "professional", owners: "" })).rejects.toThrow(/owns and controls/)
    await expect(declare("e1", { category: "wizard", owners: "x".repeat(10) })).rejects.toBeInstanceOf(LpError)
    await declare("e1", { category: "professional", owners: "Anna Berg 60%, Jonas Berg 40%" })
    expect(JSON.stringify(await rows("SELECT owners_enc FROM lp_verification WHERE lp_id = 'e1'"))).not.toContain("Jonas")
    expect((await verificationView("e1"))).toMatchObject({ category: "professional", owners: "Anna Berg 60%, Jonas Berg 40%", needsOwners: true, ready: false })
    await expect(submit("e1")).rejects.toMatchObject({ code: "incomplete" })
    await sendAll("e1"); expect((await verificationView("e1"))!.ready).toBe(true)
    await submit("e1"); expect((await rows("SELECT onboarding_state FROM fund_lps WHERE id = 'e1'"))[0].onboarding_state).toBe("verification_submitted"); expect((await verificationView("e1"))!.submitted).toBe(true)
  })
  it("an individual needs no ownership answer; changing a document or an answer reopens the submission", async () => {
    await declare("p1", { category: "unsure" }); await sendAll("p1"); await submit("p1")
    await uploadDocument("p1", "proof_of_address", { filename: "bill.pdf", bytes: pdf("new") }); expect((await verificationView("p1"))!.submitted).toBe(false)
    await submit("p1"); await declare("p1", { category: "other" }); expect((await verificationView("p1"))!.submitted).toBe(false)
  })
})

describe("the fund decides, and a document alone never clears anyone", () => {
  it("a document can be checked or sent back with a reason; the investor sees the reason; empty documents cannot be reviewed", async () => {
    await expect(reviewDocument("p1", "gp", { docType: "id_document", decision: "verify" })).rejects.toMatchObject({ status: 404 })
    await uploadDocument("p1", "id_document", { filename: "id.pdf", bytes: pdf() })
    await expect(reviewDocument("p1", "gp", { docType: "proof_of_address", decision: "verify" })).rejects.toMatchObject({ code: "empty" })
    await expect(reviewDocument("p1", "gp", { docType: "id_document", decision: "reject", note: "no" })).rejects.toThrow(/what is wrong/)
    await reviewDocument("p1", "gp", { docType: "id_document", decision: "reject", note: "The photo is blurred" })
    expect((await verificationView("p1"))!.required.find((d) => d.type === "id_document")).toMatchObject({ status: "rejected", note: "The photo is blurred" })
    await uploadDocument("p1", "id_document", { filename: "id2.pdf", bytes: pdf("sharp") }); expect((await verificationView("p1"))!.required[0]).toMatchObject({ status: "received", note: null })
    expect(st.audits.map((a) => a.action)).toEqual(["kyc_document.rejected"])
  })
  it("every document checked and no screening run: the case is in progress, not cleared; once screened it is cleared", async () => {
    await sendAll("p1")
    for (const d of requiredFor("individual")) await reviewDocument("p1", "gp", { docType: d.type, decision: "verify" })
    const caseId = (await rows("SELECT id FROM kyc_cases WHERE fund_lp_id = 'p1'"))[0].id
    expect((await rows("SELECT status FROM kyc_cases WHERE id = $1", [caseId]))[0].status).toBe("in_progress")
    await db.query("UPDATE kyc_cases SET screened_at = now() WHERE id = $1", [caseId])
    const { recomputeCase } = await import("@/lib/modules/kyc"); await recomputeCase(caseId)
    expect((await rows("SELECT status FROM kyc_cases WHERE id = $1", [caseId]))[0].status).toBe("cleared")
  })
  it("the fund's list carries the case, the declaration and each file's fingerprint; files open only for their own fund, decrypted; owners only on request", async () => {
    await declare("e1", { category: "semi_professional", owners: "Anna 100%" }); const original = pdf("ubo-original"); await uploadDocument("e1", "ubo_declaration", { filename: "ubo.pdf", bytes: original })
    const r = (await reviewsForFund("f1")).e1; expect(r).toMatchObject({ category: "semi_professional", ownersProvided: true, caseStatus: "in_progress" }); expect(JSON.stringify(r)).not.toContain("Anna 100%")
    const doc = r.docs.find((d) => d.type === "ubo_declaration")!; expect(doc.fileId).toBeTruthy()
    expect((await fileForFund("f1", doc.fileId!))!.bytes.equals(original)).toBe(true); expect(await fileForFund("f2", doc.fileId!)).toBeNull()
    expect(await ownersFor("f1", "e1")).toBe("Anna 100%"); expect(await ownersFor("f2", "e1")).toBeNull(); expect(Object.keys(await reviewsForFund("f2"))).toEqual([])
  })
})
