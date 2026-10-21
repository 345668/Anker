import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
process.env.SECRET_KEY = "passport-test-secret"
vi.mock("server-only", () => ({}))
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"

const state = vi.hoisted(() => ({ query: vi.fn(), noKey: false, recompute: vi.fn(), audit: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => state.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values), { unsafe: (q: string, values: unknown[]) => state.query(q, values) }) }))
vi.mock("@/lib/db/secrets", async () => { const real = await vi.importActual<any>("@/lib/db/secrets"); return { ...real, encryptBytes: (b: Buffer) => { if (state.noKey) throw new Error("no key"); return real.encryptBytes(b) } } })
vi.mock("@/lib/modules/kyc", () => ({ REQUIRED_DOCS: { individual: [{ type: "id_document", label: "Government ID" }, { type: "proof_of_address", label: "Proof of address" }, { type: "source_of_funds", label: "Source of funds" }], entity: [{ type: "certificate_of_incorporation", label: "Certificate" }, { type: "ubo_declaration", label: "UBO" }, { type: "proof_of_address", label: "Address" }, { type: "source_of_funds", label: "Source of funds" }] }, recomputeCase: (...a: unknown[]) => state.recompute(...a) }))
vi.mock("@/lib/audit/audit-log", () => ({ logAudit: (...a: unknown[]) => state.audit(...a) }))
// The fund's side of an upload is doc 60's code; here it is stood in for by the same effect on the same tables.
vi.mock("@/lib/portfolio/lp-verification", () => ({
  uploadDocument: async (lpId: string, type: string, file: { filename: string; bytes: Buffer }) => {
    const [v] = (await state.query("SELECT case_id FROM lp_verification WHERE lp_id = $1", [lpId])) as any[]
    if (!v) { const e: any = new Error("Please confirm your details first."); e.code = "order"; throw e }
    const [doc] = (await state.query("SELECT id, status FROM kyc_documents WHERE case_id = $1 AND doc_type = $2", [v.case_id, type])) as any[]
    if (!doc) throw new Error("That is not one of the documents asked for.")
    if (doc.status === "verified") { const e: any = new Error("This document has already been checked by the fund."); e.code = "verified"; throw e }
    await state.query("UPDATE kyc_document_files SET superseded = true WHERE doc_id = $1", [doc.id])
    await state.query("INSERT INTO kyc_document_files (doc_id, sha256) VALUES ($1, $2)", [doc.id, createHash("sha256").update(file.bytes).digest("hex")])
    await state.query("UPDATE kyc_documents SET status = 'received', received_at = now() WHERE id = $1", [doc.id])
  },
}))

import { addDocument, passportOf, shareWithFund, revokeShare, removeDocument, ownCopy, sniff, MAX_FILE_BYTES } from "./passport"
import { updateEntity } from "./profile"

let db: PGlite
const one = async (q: string, v: unknown[] = []) => (await db.query<any>(q, v)).rows[0]
const all = async (q: string, v: unknown[] = []) => (await db.query<any>(q, v)).rows
const PDF = (tag = "a") => Buffer.from(`%PDF-1.4 ${tag}`)
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex")
let E: string, REL: string

beforeAll(async () => {
  db = new PGlite()
  state.query.mockImplementation(async (q, values) => (await db.query(q, values)).rows)
  await db.exec(`
    CREATE TABLE organizations(id text PRIMARY KEY, kind text, name text, fund_id text);
    CREATE TABLE memberships(id text PRIMARY KEY, user_id text, org_id text, org_role text, persona text);
    CREATE TABLE funds(id text PRIMARY KEY, name text, listed_for_lps boolean DEFAULT false);
    CREATE TABLE profiles(id text PRIMARY KEY, email text, full_name text);
    CREATE TABLE platform_flags(key text PRIMARY KEY, enabled boolean, rollout_pct int, description text, updated_by text, updated_at timestamptz);
    CREATE TABLE fund_lps (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, fund_id text, onboarding_state text DEFAULT 'not_invited');
    CREATE TABLE data_room_documents(id text PRIMARY KEY, fund_id text, fund_lp_id text, title text, category text, file_url text, file_name text, byte_size bigint, archived_at timestamptz, created_at timestamptz DEFAULT now());
    CREATE TABLE lp_verification(lp_id text PRIMARY KEY, case_id text, submitted_at timestamptz);
    CREATE TABLE kyc_documents(id text PRIMARY KEY DEFAULT gen_random_uuid()::text, case_id text, doc_type text, status text DEFAULT 'requested', received_at timestamptz);
    CREATE TABLE kyc_document_files(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), doc_id text, sha256 text, superseded boolean DEFAULT false, created_at timestamptz DEFAULT now());
  `)
  for (const f of ["2026-10-20-investor-side", "2026-10-20b-investor-talks", "2026-10-20c-investor-bridge", "2026-10-20e-investor-materials", "2026-10-20f-investor-team", "2026-10-20g-investor-passport", "2026-10-21-investor-legal"]) await db.exec(readFileSync(`scripts/migrations/${f}.sql`, "utf8").replace("INSERT INTO platform_flags", "-- INSERT INTO platform_flags"))
})
afterAll(async () => db.close())
beforeEach(async () => {
  state.noKey = false; state.recompute.mockReset(); state.audit.mockReset()
  await db.exec(`DELETE FROM passport_shares; DELETE FROM passport_documents; DELETE FROM kyc_document_files; DELETE FROM kyc_documents; DELETE FROM lp_verification; DELETE FROM investor_entity_events; DELETE FROM investor_entity_members; DELETE FROM fund_relationships; DELETE FROM fund_lps; DELETE FROM fund_listings; DELETE FROM investor_entities; DELETE FROM investor_profiles; DELETE FROM profiles; DELETE FROM funds;
    INSERT INTO funds(id, name) VALUES ('fund-1','Alpha'), ('fund-2','Beta');
    INSERT INTO profiles VALUES ('owner','owner@example.com','Olga'), ('actor','actor@example.com','Ari'), ('viewer','viewer@example.com','Vic'), ('stranger','stranger@example.com','Sam');
    INSERT INTO investor_profiles (user_id, display_name, terms_version, terms_accepted_at) VALUES ('owner','Olga','2026-10',now()), ('actor','Ari','2026-10',now()), ('viewer','Vic','2026-10',now()), ('stranger','Sam','2026-10',now());`)
  E = String((await db.query<any>("INSERT INTO investor_entities (user_id, legal_name, kind) VALUES ('owner','Olga','individual') RETURNING id")).rows[0].id)
  await db.query("INSERT INTO investor_entity_members (entity_id, user_id, role, added_by) VALUES ($1,'actor','can_act','owner'), ($1,'viewer','can_view','owner')", [E])
  await db.exec(`INSERT INTO fund_lps (id, fund_id, onboarding_state) VALUES ('lp-1','fund-1','details_confirmed'), ('lp-2','fund-2','details_confirmed');
    INSERT INTO lp_verification VALUES ('lp-1','case-1',now()), ('lp-2','case-2',now());
    INSERT INTO kyc_documents (id, case_id, doc_type) VALUES ('k1-id','case-1','id_document'), ('k1-pa','case-1','proof_of_address'), ('k1-sf','case-1','source_of_funds'), ('k2-id','case-2','id_document');`)
  REL = String((await db.query<any>("INSERT INTO fund_relationships (fund_id, entity_id, user_id, stage, fund_lp_id) VALUES ('fund-1', $1, 'owner', 'onboarding', 'lp-1') RETURNING id", [E])).rows[0].id)
})

describe("keeping documents", () => {
  it("checks type, size and content, and refuses to store anything without a key", async () => {
    await expect(addDocument("owner", E, "ubo_declaration", { filename: "x.pdf", bytes: PDF() })).rejects.toThrow(/not one of the documents/)   // an individual has no UBO declaration
    await expect(addDocument("owner", E, "id_document", { filename: "x.pdf", bytes: Buffer.alloc(0) })).rejects.toThrow(/empty/)
    await expect(addDocument("owner", E, "id_document", { filename: "x.pdf", bytes: Buffer.alloc(MAX_FILE_BYTES + 1, 1) })).rejects.toMatchObject({ code: "too_large" })
    await expect(addDocument("owner", E, "id_document", { filename: "x.exe", bytes: Buffer.from("MZ not a pdf") })).rejects.toMatchObject({ code: "type" })
    state.noKey = true
    await expect(addDocument("owner", E, "id_document", { filename: "x.pdf", bytes: PDF() })).rejects.toMatchObject({ code: "no_key", status: 503 })
    expect((await one("SELECT count(*)::int n FROM passport_documents")).n).toBe(0)
    expect(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.contentType).toBe("image/jpeg")
  })
  it("stores the file encrypted, keeps its fingerprint, replaces by wiping the old bytes, and lists no bytes", async () => {
    await addDocument("owner", E, "id_document", { filename: "passport.pdf", bytes: PDF("one") })
    const row = await one("SELECT content_enc, sha256 FROM passport_documents")
    expect(Buffer.from(row.content_enc).includes(Buffer.from("%PDF"))).toBe(false); expect(row.sha256).toBe(sha(PDF("one")))
    await addDocument("owner", E, "id_document", { filename: "new.pdf", bytes: PDF("two") })
    const rows = await all("SELECT superseded, length(content_enc) AS len FROM passport_documents ORDER BY created_at")
    expect(rows.map((r) => r.superseded)).toEqual([true, false]); expect(Number(rows[0].len)).toBe(0)
    const view = await passportOf("owner", E)
    expect(view.wanted.map((w) => [w.type, !!w.doc])).toEqual([["id_document", true], ["proof_of_address", false], ["source_of_funds", false]])
    expect(JSON.stringify(view)).not.toMatch(/content_enc|%PDF/)
    expect((await ownCopy("owner", E, view.wanted[0].doc!.id)).bytes.equals(PDF("two"))).toBe(true)
  })
  it("a person who can act keeps documents; a viewer sees that they exist, not their names, and cannot add or download; a stranger reaches nothing", async () => {
    await addDocument("actor", E, "id_document", { filename: "secret-name.pdf", bytes: PDF() })
    const v = await passportOf("viewer", E)
    expect(v.canEdit).toBe(false); expect(v.wanted[0].doc).toMatchObject({ filename: "(hidden)" }); expect(v.funds).toEqual([])
    await expect(addDocument("viewer", E, "proof_of_address", { filename: "x.pdf", bytes: PDF() })).rejects.toMatchObject({ code: "view_only" })
    await expect(ownCopy("viewer", E, v.wanted[0].doc!.id)).rejects.toMatchObject({ code: "view_only" })
    await expect(passportOf("stranger", E)).rejects.toMatchObject({ status: 404 })
    await expect(addDocument("stranger", E, "id_document", { filename: "x.pdf", bytes: PDF() })).rejects.toMatchObject({ status: 404 })
  })
})

describe("sharing with a fund", () => {
  beforeEach(async () => { await addDocument("owner", E, "id_document", { filename: "id.pdf", bytes: PDF("id") }); await addDocument("owner", E, "proof_of_address", { filename: "pa.pdf", bytes: PDF("pa") }) })
  it("is a copy, with consent, to one fund: it lands in that fund's checklist and nowhere else, and is recorded", async () => {
    const r = await shareWithFund("actor", E, REL, ["id_document", "proof_of_address", "source_of_funds", "ubo_declaration"])
    expect(r.shared).toEqual(["id_document", "proof_of_address"])
    expect(r.skipped).toEqual(expect.arrayContaining([{ type: "source_of_funds", why: "not in your passport yet" }, { type: "ubo_declaration", why: "not a document asked for" }]))
    expect((await all("SELECT doc_type, status FROM kyc_documents WHERE case_id = 'case-1' ORDER BY doc_type")).map((d) => [d.doc_type, d.status])).toEqual([["id_document", "received"], ["proof_of_address", "received"], ["source_of_funds", "requested"]])
    expect((await one("SELECT status FROM kyc_documents WHERE case_id = 'case-2'")).status).toBe("requested")        // another fund got nothing
    const shares = await all("SELECT doc_type, with_fund, lp_id, sha256, shared_by FROM passport_shares ORDER BY doc_type")
    expect(shares).toEqual([{ doc_type: "id_document", with_fund: "fund-1", lp_id: "lp-1", sha256: sha(PDF("id")), shared_by: "actor" }, { doc_type: "proof_of_address", with_fund: "fund-1", lp_id: "lp-1", sha256: sha(PDF("pa")), shared_by: "actor" }])
    expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "passport.shared", actorId: "actor" }))
    expect((await passportOf("owner", E)).wanted[0].doc!.shares[0]).toMatchObject({ fundName: "Alpha", revokedAt: null })
  })
  it("needs a relationship of this entity that has reached onboarding with a record, and someone who can act", async () => {
    await expect(shareWithFund("viewer", E, REL, ["id_document"])).rejects.toMatchObject({ code: "view_only" })
    await expect(shareWithFund("owner", E, REL, [])).rejects.toThrow(/at least one/)
    await expect(shareWithFund("owner", E, "00000000-0000-0000-0000-000000000000", ["id_document"])).rejects.toMatchObject({ status: 404 })
    await db.exec("UPDATE fund_relationships SET stage = 'in_talks'")
    await expect(shareWithFund("owner", E, REL, ["id_document"])).rejects.toMatchObject({ code: "stage" })
    await db.exec("UPDATE fund_relationships SET stage = 'onboarding', fund_lp_id = NULL")
    await expect(shareWithFund("owner", E, REL, ["id_document"])).rejects.toMatchObject({ code: "stage" })
    expect((await one("SELECT count(*)::int n FROM passport_shares")).n).toBe(0)
  })
  it("leaves a document the fund already checked alone, and says so", async () => {
    await db.exec("UPDATE kyc_documents SET status = 'verified' WHERE id = 'k1-id'")
    const r = await shareWithFund("owner", E, REL, ["id_document", "proof_of_address"])
    expect(r.shared).toEqual(["proof_of_address"]); expect(r.skipped).toEqual([{ type: "id_document", why: "the fund has already checked this one" }])
  })
  it("lists which funds it could be shared with and what they still need", async () => {
    const f = (await passportOf("owner", E)).funds
    expect(f).toEqual([{ relationshipId: REL, fundName: "Alpha", wants: expect.arrayContaining(["id_document", "proof_of_address", "source_of_funds"]) }])
  })
})

describe("taking a share back", () => {
  beforeEach(async () => { await addDocument("owner", E, "id_document", { filename: "id.pdf", bytes: PDF("id") }); await shareWithFund("owner", E, REL, ["id_document"]) })
  const shareId = async () => String((await one("SELECT id FROM passport_shares")).id)
  it("deletes a copy the fund has not looked at and puts the item back to requested", async () => {
    expect(await revokeShare("owner", E, await shareId())).toEqual({ outcome: "deleted" })
    expect(await all("SELECT 1 FROM kyc_document_files")).toHaveLength(0)
    expect(await one("SELECT status, received_at FROM kyc_documents WHERE id = 'k1-id'")).toEqual({ status: "requested", received_at: null })
    expect(await one("SELECT submitted_at FROM lp_verification WHERE lp_id = 'lp-1'")).toEqual({ submitted_at: null })
    expect(state.recompute).toHaveBeenCalledWith("case-1")
    expect((await one("SELECT revoked_at, retained FROM passport_shares")).retained).toBe(false)
  })
  it("keeps a copy the fund already checked, marks it retained, and tells the investor", async () => {
    await db.exec("UPDATE kyc_documents SET status = 'verified' WHERE id = 'k1-id'")
    expect(await revokeShare("owner", E, await shareId())).toEqual({ outcome: "retained" })
    expect(await all("SELECT 1 FROM kyc_document_files")).toHaveLength(1)
    expect(await one("SELECT retained FROM passport_shares")).toEqual({ retained: true })
    expect((await passportOf("owner", E)).wanted[0].doc!.shares[0]).toMatchObject({ retained: true })
  })
  it("leaves a different file the investor has since uploaded there, and cannot revoke twice", async () => {
    await db.exec("UPDATE kyc_document_files SET superseded = true; INSERT INTO kyc_document_files (doc_id, sha256) VALUES ('k1-id', 'other-sha')")
    expect(await revokeShare("owner", E, await shareId())).toEqual({ outcome: "replaced" })
    expect(await all("SELECT 1 FROM kyc_document_files WHERE superseded = false")).toHaveLength(1)
    await expect(revokeShare("owner", E, await shareId())).rejects.toMatchObject({ status: 404 })
  })
  it("only people who can act revoke; removing a document takes its shares back first and wipes the bytes", async () => {
    await expect(revokeShare("viewer", E, await shareId())).rejects.toMatchObject({ code: "view_only" })
    await expect(revokeShare("stranger", E, await shareId())).rejects.toMatchObject({ status: 404 })
    const docId = String((await one("SELECT id FROM passport_documents WHERE superseded = false")).id)
    await removeDocument("owner", E, docId)
    expect(await all("SELECT 1 FROM kyc_document_files")).toHaveLength(0)
    expect(await one("SELECT superseded, length(content_enc) AS len FROM passport_documents WHERE id::text = $1", [docId])).toEqual({ superseded: true, len: 0 })
    expect((await one("SELECT revoked_at IS NOT NULL AS gone FROM passport_shares")).gone).toBe(true)
    await expect(ownCopy("owner", E, docId)).rejects.toMatchObject({ status: 404 })
  })
  it("records who did what on the entity's activity log", async () => {
    await revokeShare("owner", E, await shareId())
    expect((await all("SELECT action FROM investor_entity_events ORDER BY at")).map((e) => e.action)).toEqual(expect.arrayContaining(["passport_added", "passport_shared", "passport_share_revoked"]))
  })
})

it("an entity that is not an individual is asked for the entity documents", async () => {
  await updateEntity("owner", E, { legalName: "Olga Holding GmbH", kind: "company" })
  expect((await passportOf("owner", E)).wanted.map((w) => w.type)).toEqual(["certificate_of_incorporation", "ubo_declaration", "proof_of_address", "source_of_funds"])
})
