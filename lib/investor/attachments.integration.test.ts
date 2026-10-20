import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
process.env.SECRET_KEY = "attachments-test-secret"
vi.mock("server-only", () => ({}))
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const state = vi.hoisted(() => ({ query: vi.fn(), noKey: false }))
vi.mock("@/lib/db", () => ({ sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => state.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values), { unsafe: (q: string, values: unknown[]) => state.query(q, values) }) }))
vi.mock("@/lib/db/secrets", async () => { const real = await vi.importActual<any>("@/lib/db/secrets"); return { ...real, encryptBytes: (b: Buffer) => { if (state.noKey) throw new Error("no key"); return real.encryptBytes(b) } } })

import { sendMessage, readThread, attachmentFor } from "./talks"
import { checkFiles, pdfRisk, sniff, MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_BYTES } from "./attachments"

let db: PGlite
const sent: Array<{ to: string; subject: string; text: string }> = []
const send = async (m: { to: string; subject: string; text: string }) => { sent.push(m) }
const one = async (q: string, v: unknown[] = []) => (await db.query<any>(q, v)).rows[0]
const PDF = (extra = "") => Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj ${extra}\n%%EOF`)
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("png-data")])
const INV = { userId: "owner", senderId: "owner" }, FUND = { fundId: "fund-1", senderId: "fundowner" }
let rel: string

beforeAll(async () => {
  db = new PGlite()
  state.query.mockImplementation(async (q, values) => (await db.query(q, values)).rows)
  await db.exec(`
    CREATE TABLE organizations(id text PRIMARY KEY, kind text, name text, fund_id text);
    CREATE TABLE memberships(id text PRIMARY KEY, user_id text, org_id text, org_role text, persona text);
    CREATE TABLE funds(id text PRIMARY KEY, name text, listed_for_lps boolean DEFAULT false);
    CREATE TABLE profiles(id text PRIMARY KEY, email text, full_name text);
    CREATE TABLE platform_flags(key text PRIMARY KEY, enabled boolean, rollout_pct int, description text, updated_by text, updated_at timestamptz);
    CREATE TABLE fund_lps (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, fund_id text);
    CREATE TABLE notifications(id serial PRIMARY KEY, user_id text, org_id text, kind text, severity text DEFAULT 'info', title text, body text, href text, dedupe_key text, read_at timestamptz, created_at timestamptz DEFAULT now());
    CREATE UNIQUE INDEX notifications_dedupe ON notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
    CREATE TABLE data_room_documents(id text PRIMARY KEY, fund_id text, fund_lp_id text, title text, category text, file_url text, file_name text, byte_size bigint, archived_at timestamptz, created_at timestamptz DEFAULT now());
  `)
  for (const f of ["2026-10-20-investor-side", "2026-10-20b-investor-talks", "2026-10-20c-investor-bridge", "2026-10-20e-investor-materials", "2026-10-20f-investor-team", "2026-10-20i-message-attachments"]) await db.exec(readFileSync(`scripts/migrations/${f}.sql`, "utf8").replace("INSERT INTO platform_flags", "-- INSERT INTO platform_flags"))
})
afterAll(async () => db.close())
beforeEach(async () => {
  sent.length = 0; state.noKey = false
  await db.exec(`DELETE FROM relationship_attachments; DELETE FROM relationship_messages; DELETE FROM investor_entity_members; DELETE FROM fund_relationships; DELETE FROM investor_entities; DELETE FROM investor_profiles; DELETE FROM notifications; DELETE FROM profiles; DELETE FROM memberships; DELETE FROM organizations; DELETE FROM funds;
    INSERT INTO funds(id, name) VALUES ('fund-1','Alpha'), ('fund-2','Beta');
    INSERT INTO organizations VALUES ('org-1','fund','Alpha Partners','fund-1');
    INSERT INTO memberships VALUES ('m1','fundowner','org-1','workspace_owner','vc');
    INSERT INTO profiles VALUES ('owner','owner@example.com','Olga'), ('viewer','viewer@example.com','Vic'), ('stranger','stranger@example.com','Sam');
    INSERT INTO investor_profiles (user_id, display_name, terms_version, terms_accepted_at) SELECT id, full_name, '2026-10', now() FROM profiles;`)
  const e = String((await db.query<any>("INSERT INTO investor_entities (user_id, legal_name, kind) VALUES ('owner','Olga','individual') RETURNING id")).rows[0].id)
  await db.query("INSERT INTO investor_entity_members (entity_id, user_id, role, added_by) VALUES ($1,'viewer','can_view','owner')", [e])
  rel = String((await db.query<any>("INSERT INTO fund_relationships (fund_id, entity_id, user_id, stage) VALUES ('fund-1', $1, 'owner', 'in_talks') RETURNING id", [e])).rows[0].id)
})

describe("the file checks", () => {
  it("reads the type from the content, not the name", () => {
    expect(sniff(PDF())).toBe("application/pdf"); expect(sniff(PNG)).toBe("image/png"); expect(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1]))).toBe("image/jpeg"); expect(sniff(Buffer.from("MZ\x90\x00"))).toBeNull()
    expect(() => checkFiles([{ filename: "nice.pdf", bytes: Buffer.from("MZ not a pdf at all") }])).toThrow(/PDF, JPEG or PNG/)
    expect(checkFiles([{ filename: "photo.pdf", bytes: PNG }])[0].contentType).toBe("image/png")                       // the name does not decide
  })
  it("refuses PDFs with active content or disguised names, and says why; a plain PDF passes", () => {
    for (const bad of ["/JavaScript (alert(1))", "/JS (x)", "/Launch /Win", "/EmbeddedFile", "/OpenAction 5 0 R", "/RichMedia", "/XFA", "/J#61vaScript"]) expect(pdfRisk(PDF(bad)), bad).not.toBeNull()
    expect(() => checkFiles([{ filename: "x.pdf", bytes: PDF("/JavaScript (x)") }])).toThrow(/not accepted/)
    expect(pdfRisk(PDF("/Type /Page /Contents 4 0 R"))).toBeNull()
    expect(pdfRisk(PDF("/Subtype /Link /Author (Jane)"))).toBeNull()                                                  // a name that merely starts with the letters is not a match
  })
  it("limits count, size and empty files, and cleans the file name", () => {
    expect(() => checkFiles(Array.from({ length: MAX_FILES + 1 }, () => ({ filename: "a.pdf", bytes: PDF() })))).toThrow(/at most/)
    expect(() => checkFiles([{ filename: "big.pdf", bytes: Buffer.concat([PDF(), Buffer.alloc(MAX_FILE_BYTES)]) }])).toThrow(/larger than 4 MB/)
    expect(() => checkFiles([{ filename: "e.pdf", bytes: Buffer.alloc(0) }])).toThrow(/empty/)
    expect(checkFiles([{ filename: 'a/b\\"c\r\nd.pdf', bytes: PDF() }])[0].filename).not.toMatch(/[\\/"\r\n]/)
  })
})

describe("sending and downloading", () => {
  it("stores the file encrypted, lists it without bytes, lets each side download the other's file, and allows a message of only a file", async () => {
    const m = await sendMessage("fund", FUND, rel, "", send, [{ filename: "Terms.pdf", bytes: PDF("terms") }, { filename: "chart.png", bytes: PNG }])
    expect(m.attachments.map((a) => a.filename)).toEqual(["Terms.pdf", "chart.png"]); expect(m.body).toBe("")
    const row = await one("SELECT content_enc, sha256, size_bytes FROM relationship_attachments WHERE filename = 'Terms.pdf'")
    expect(Buffer.from(row.content_enc).includes(Buffer.from("%PDF"))).toBe(false); expect(row.sha256).toHaveLength(64)
    const t = await readThread("investor", { userId: "owner" }, rel)
    expect(t.messages[0].attachments).toHaveLength(2); expect(JSON.stringify(t)).not.toMatch(/content_enc|%PDF/)
    const got = await attachmentFor("investor", { userId: "owner" }, rel, m.attachments[0].id)
    expect(got).toMatchObject({ filename: "Terms.pdf", contentType: "application/pdf" }); expect(got.bytes.equals(PDF("terms"))).toBe(true)
    await sendMessage("investor", INV, rel, "Signed copy attached", send, [{ filename: "signed.png", bytes: PNG }])
    const back = (await readThread("fund", { fundId: "fund-1" }, rel)).messages[1]
    expect((await attachmentFor("fund", { fundId: "fund-1" }, rel, back.attachments[0].id)).contentType).toBe("image/png")
    expect((await attachmentFor("investor", { userId: "viewer" }, rel, m.attachments[0].id)).filename).toBe("Terms.pdf")   // a viewer may read
  })
  it("notices still carry no file name or content", async () => {
    await sendMessage("fund", FUND, rel, "see attached", send, [{ filename: "Secret-Term-Sheet.pdf", bytes: PDF() }])
    expect(sent).toHaveLength(1); expect(sent[0].subject + sent[0].text).not.toMatch(/Secret|Term-Sheet|attached|pdf/i)
  })
  it("a stranger, another fund or another investor cannot download or send", async () => {
    const m = await sendMessage("fund", FUND, rel, "x", send, [{ filename: "a.pdf", bytes: PDF() }])
    const id = m.attachments[0].id
    await expect(attachmentFor("investor", { userId: "stranger" }, rel, id)).rejects.toMatchObject({ status: 404 })
    await expect(attachmentFor("fund", { fundId: "fund-2" }, rel, id)).rejects.toMatchObject({ status: 404 })
    await expect(sendMessage("investor", { userId: "stranger", senderId: "stranger" }, rel, "x", send, [{ filename: "a.pdf", bytes: PDF() }])).rejects.toMatchObject({ status: 404 })
    await expect(sendMessage("investor", { userId: "viewer", senderId: "viewer" }, rel, "x", send, [{ filename: "a.pdf", bytes: PDF() }])).rejects.toMatchObject({ code: "view_only" })
    await expect(attachmentFor("investor", INV, rel, "00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({ status: 404 })
  })
  it("refuses with no key, over the conversation total, when closed, and with nothing at all; a refused message stores nothing", async () => {
    state.noKey = true
    await expect(sendMessage("fund", FUND, rel, "x", send, [{ filename: "a.pdf", bytes: PDF() }])).rejects.toMatchObject({ code: "no_key", status: 503 })
    state.noKey = false
    await expect(sendMessage("fund", FUND, rel, "  ", send, [])).rejects.toThrow(/Write a message or attach/)
    await expect(sendMessage("fund", FUND, rel, "x", send, [{ filename: "bad.pdf", bytes: PDF("/Launch") }])).rejects.toMatchObject({ code: "unsafe" })
    expect((await one("SELECT count(*)::int n FROM relationship_messages")).n).toBe(0)
    await db.query("INSERT INTO relationship_messages (relationship_id, fund_id, sender, sender_user_id, body) VALUES ($1,'fund-1','fund','fundowner','old')", [rel])
    await db.query("INSERT INTO relationship_attachments (message_id, relationship_id, fund_id, filename, content_type, size_bytes, sha256, content_enc) SELECT id, relationship_id, fund_id, 'big.pdf', 'application/pdf', $1::int, 'x', '\\x00'::bytea FROM relationship_messages", [MAX_TOTAL_BYTES - 10])
    await expect(sendMessage("fund", FUND, rel, "x", send, [{ filename: "a.pdf", bytes: PDF() }])).rejects.toMatchObject({ code: "total", status: 413 })
    await db.exec("UPDATE fund_relationships SET stage = 'declined'")
    await expect(sendMessage("fund", FUND, rel, "x", send, [{ filename: "a.pdf", bytes: PDF() }])).rejects.toMatchObject({ code: "closed" })
  })
})
