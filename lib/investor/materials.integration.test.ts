import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const state = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => state.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values), { unsafe: (q: string, values: unknown[]) => state.query(q, values) }) }))

import { acceptNda, materialsForInvestor, openMaterial, materialsForFund, grantMaterial, revokeMaterial, listMeetings, proposeMeeting, answerMeeting } from "./materials"

let db: PGlite
const sent: Array<{ to: string; subject: string; text: string }> = []
const send = async (m: { to: string; subject: string; text: string }) => { sent.push(m) }
const one = async (q: string, v: unknown[] = []) => (await db.query<any>(q, v)).rows[0]
const FUND = { fundId: "fund-1" }, INV = { userId: "inv-1" }
let rel: string
const setRules = (r: object) => db.query("INSERT INTO fund_listings (fund_id, snapshot, eligibility) VALUES ('fund-1', '{}', $1) ON CONFLICT (fund_id) DO UPDATE SET eligibility = $1", [JSON.stringify(r)])

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
    CREATE TABLE data_room_document_views(id text PRIMARY KEY DEFAULT gen_random_uuid()::text, document_id text NOT NULL, fund_id text, fund_lp_id text, viewer_email text, is_lp boolean NOT NULL DEFAULT false, viewed_at timestamptz NOT NULL DEFAULT now());
  `)
  for (const f of ["2026-10-20-investor-side", "2026-10-20b-investor-talks", "2026-10-20c-investor-bridge", "2026-10-20e-investor-materials", "2026-10-20f-investor-team", "2026-10-21-investor-legal"]) await db.exec(readFileSync(`scripts/migrations/${f}.sql`, "utf8").replace("INSERT INTO platform_flags", "-- INSERT INTO platform_flags"))
})
afterAll(async () => db.close())
beforeEach(async () => {
  sent.length = 0
  await db.exec(`DELETE FROM data_room_document_views; DELETE FROM data_room_documents; DELETE FROM relationship_meetings; DELETE FROM relationship_materials; DELETE FROM fund_relationships; DELETE FROM fund_listings; DELETE FROM investor_entities; DELETE FROM investor_profiles; DELETE FROM notifications; DELETE FROM profiles; DELETE FROM memberships; DELETE FROM organizations; DELETE FROM funds;
    INSERT INTO funds(id, name) VALUES ('fund-1','Alpha'), ('fund-2','Beta');
    INSERT INTO organizations VALUES ('org-1','fund','Alpha Partners','fund-1');
    INSERT INTO memberships VALUES ('m1','owner-1','org-1','workspace_owner','vc');
    INSERT INTO profiles VALUES ('inv-1','ann@example.com','Ann'), ('inv-2','bob@example.com','Bob');
    INSERT INTO investor_profiles (user_id, display_name, terms_version, terms_accepted_at) VALUES ('inv-1','Ann','2026-10',now()), ('inv-2','Bob','2026-10',now());
    INSERT INTO investor_entities (user_id, legal_name, kind) VALUES ('inv-1','Ann','individual'), ('inv-2','Bob','individual');
    INSERT INTO data_room_documents (id, fund_id, fund_lp_id, title, category, file_url, file_name, byte_size) VALUES
      ('d1','fund-1',NULL,'Deck','other','https://files.test/deck.pdf','deck.pdf',2048), ('d2','fund-1',NULL,'Policy','policy','https://files.test/policy.pdf','policy.pdf',1024),
      ('dlp','fund-1','lp-x','One investor only','subscription','https://files.test/secret.pdf','s.pdf',1), ('dold','fund-1',NULL,'Old','other','https://files.test/old.pdf','o.pdf',1), ('dother','fund-2',NULL,'Beta deck','other','https://files.test/beta.pdf','b.pdf',1);
    UPDATE data_room_documents SET archived_at = now() WHERE id = 'dold';`)
  await setRules({ ndaRequired: false })
  rel = String((await db.query<any>("INSERT INTO fund_relationships (fund_id, entity_id, user_id, stage) VALUES ('fund-1', (SELECT id FROM investor_entities WHERE user_id='inv-1'), 'inv-1', 'in_talks') RETURNING id")).rows[0].id)
})

describe("sharing documents", () => {
  it("offers only the fund's own fund-wide live documents, and only while the conversation is open", async () => {
    expect((await materialsForFund("fund-1", rel)).available.map((a) => a.id).sort()).toEqual(["d1", "d2"])
    await expect(grantMaterial("fund-1", rel, "dlp", "owner-1", send)).rejects.toMatchObject({ status: 404 })
    await expect(grantMaterial("fund-1", rel, "dother", "owner-1", send)).rejects.toMatchObject({ status: 404 })
    await expect(grantMaterial("fund-1", rel, "dold", "owner-1", send)).rejects.toMatchObject({ status: 404 })
    await db.exec("UPDATE fund_relationships SET stage = 'interested'")
    await expect(grantMaterial("fund-1", rel, "d1", "owner-1", send)).rejects.toMatchObject({ code: "closed" })
  })
  it("grants once, tells the investor with no content, lists it for them, and logs an open", async () => {
    await grantMaterial("fund-1", rel, "d1", "owner-1", send)
    await expect(grantMaterial("fund-1", rel, "d1", "owner-1", send)).rejects.toMatchObject({ code: "exists" })
    expect(sent).toHaveLength(1); expect(sent[0].subject + sent[0].text).not.toMatch(/Deck|deck/)
    const m = await materialsForInvestor("inv-1", rel)
    expect(m.items).toEqual([expect.objectContaining({ documentId: "d1", title: "Deck", fileName: "deck.pdf", bytes: 2048 })])
    expect((await materialsForFund("fund-1", rel)).granted[0]).toMatchObject({ documentId: "d1", opened: false })
    expect(await openMaterial("inv-1", "ann@example.com", rel, "d1")).toBe("https://files.test/deck.pdf")
    expect((await one("SELECT count(*)::int n FROM data_room_document_views WHERE document_id = 'd1'")).n).toBe(1)
    expect((await materialsForFund("fund-1", rel)).granted[0].opened).toBe(true)
  })
  it("a withdrawn share stops working at once, and can be shared again", async () => {
    await grantMaterial("fund-1", rel, "d1", "owner-1", send)
    const g = (await materialsForFund("fund-1", rel)).granted[0].grantId
    await revokeMaterial("fund-1", rel, g)
    await expect(openMaterial("inv-1", "ann@example.com", rel, "d1")).rejects.toMatchObject({ status: 404 })
    expect((await materialsForInvestor("inv-1", rel)).items).toEqual([])
    await expect(revokeMaterial("fund-1", rel, g)).rejects.toMatchObject({ status: 404 })
    await grantMaterial("fund-1", rel, "d1", "owner-1", send)
  })
  it("another investor or another fund reaches nothing, and an ungranted or closed document does not open", async () => {
    await grantMaterial("fund-1", rel, "d1", "owner-1", send)
    await expect(openMaterial("inv-2", "bob@example.com", rel, "d1")).rejects.toMatchObject({ status: 404 })
    await expect(materialsForFund("fund-2", rel)).rejects.toMatchObject({ status: 404 })
    await expect(openMaterial("inv-1", "ann@example.com", rel, "d2")).rejects.toMatchObject({ status: 404 })
    await db.exec("UPDATE fund_relationships SET blocked_by = 'fund', stage = 'declined'")
    await expect(openMaterial("inv-1", "ann@example.com", rel, "d1")).rejects.toMatchObject({ code: "closed" })
  })
})

describe("the NDA", () => {
  beforeEach(async () => { await setRules({ ndaRequired: true, ndaText: "You keep this confidential." }) })
  it("blocks documents until the investor accepts the fund's text, then records a copy, once", async () => {
    await grantMaterial("fund-1", rel, "d1", "owner-1", send)
    expect(await materialsForInvestor("inv-1", rel)).toMatchObject({ nda: { required: true, accepted: false, text: "You keep this confidential." }, items: [] })
    await expect(openMaterial("inv-1", "ann@example.com", rel, "d1")).rejects.toMatchObject({ code: "nda", status: 403 })
    expect((await materialsForFund("fund-1", rel))).toMatchObject({ ndaRequired: true, ndaAccepted: false })
    const n = await acceptNda("inv-1", rel, "1.2.3.4", "Mozilla/5.0")
    expect(n).toMatchObject({ accepted: true, text: "You keep this confidential." })
    const r = await one("SELECT nda_text, nda_text_hash, nda_ip, nda_agent_hash FROM fund_relationships")
    expect(r).toMatchObject({ nda_text: "You keep this confidential.", nda_ip: "1.2.3.4" }); expect(r.nda_text_hash).toHaveLength(64); expect(r.nda_agent_hash).not.toContain("Mozilla")
    await expect(acceptNda("inv-1", rel, null, null)).rejects.toMatchObject({ code: "accepted" })
    expect((await materialsForInvestor("inv-1", rel)).items).toHaveLength(1)
    expect(await openMaterial("inv-1", "ann@example.com", rel, "d1")).toContain("deck.pdf")
  })
  it("a later edit of the text does not need a second acceptance, and the accepted copy is what is shown", async () => {
    await acceptNda("inv-1", rel, null, null)
    await setRules({ ndaRequired: true, ndaText: "A new, stricter text." })
    const m = await materialsForInvestor("inv-1", rel)
    expect(m.nda).toMatchObject({ accepted: true, text: "You keep this confidential." })
  })
  it("cannot be accepted by someone else, when not asked for, or once the conversation is closed", async () => {
    await expect(acceptNda("inv-2", rel, null, null)).rejects.toMatchObject({ status: 404 })
    await setRules({ ndaRequired: false })
    await expect(acceptNda("inv-1", rel, null, null)).rejects.toMatchObject({ code: "no_nda" })
    await setRules({ ndaRequired: true, ndaText: "x" }); await db.exec("UPDATE fund_relationships SET stage = 'declined'")
    await expect(acceptNda("inv-1", rel, null, null)).rejects.toMatchObject({ code: "closed" })
  })
})

describe("meeting requests", () => {
  const future = () => new Date(Date.now() + 86400000).toISOString()
  it("either side proposes a time or a link; the other answers, the proposer cancels", async () => {
    await proposeMeeting("investor", INV, rel, { startsAt: future(), link: "https://meet.test/abc", note: "Thirty minutes?" }, send)
    expect(sent).toHaveLength(0)                                                                              // to the fund: an in-app notice, not email
    expect((await db.query<any>("SELECT count(*)::int n FROM notifications WHERE kind = 'investor_message'")).rows[0].n).toBe(1)
    const [m] = await listMeetings("fund", FUND, rel)
    expect(m).toMatchObject({ by: "investor", status: "proposed", mine: false, link: "https://meet.test/abc" })
    await expect(answerMeeting("investor", INV, rel, m.id, "accept", send)).rejects.toMatchObject({ code: "not_yours" })
    await expect(answerMeeting("fund", FUND, rel, m.id, "cancel", send)).rejects.toMatchObject({ code: "not_yours" })
    expect(await answerMeeting("fund", FUND, rel, m.id, "accept", send)).toBe("accepted")
    await expect(answerMeeting("fund", FUND, rel, m.id, "decline", send)).rejects.toMatchObject({ status: 404 })   // answered once
    await proposeMeeting("fund", FUND, rel, { link: "https://meet.test/def" }, send)
    const [m2] = (await listMeetings("investor", INV, rel)).filter((x) => x.status === "proposed")
    expect(await answerMeeting("fund", FUND, rel, m2.id, "cancel", send)).toBe("cancelled")
  })
  it("checks the proposal: https only, a time in the future, something to propose, three open at most, an open conversation", async () => {
    await expect(proposeMeeting("fund", FUND, rel, { link: "http://meet.test/x" }, send)).rejects.toThrow(/https/)
    await expect(proposeMeeting("fund", FUND, rel, { link: "javascript:alert(1)" }, send)).rejects.toThrow(/https/)
    await expect(proposeMeeting("fund", FUND, rel, { startsAt: "2020-01-01T10:00:00Z" }, send)).rejects.toThrow(/future/)
    await expect(proposeMeeting("fund", FUND, rel, { note: "no time or link" }, send)).rejects.toThrow(/time, a link/)
    for (let i = 0; i < 3; i++) await proposeMeeting("fund", FUND, rel, { link: `https://meet.test/${i}` }, send)
    await expect(proposeMeeting("fund", FUND, rel, { link: "https://meet.test/4" }, send)).rejects.toMatchObject({ code: "limit" })
    await db.exec("UPDATE fund_relationships SET stage = 'declined'")
    await expect(proposeMeeting("investor", INV, rel, { link: "https://meet.test/5" }, send)).rejects.toMatchObject({ code: "closed" })
  })
  it("another investor or fund sees nothing", async () => {
    await proposeMeeting("fund", FUND, rel, { link: "https://meet.test/x" }, send)
    await expect(listMeetings("investor", { userId: "inv-2" }, rel)).rejects.toMatchObject({ status: 404 })
    await expect(listMeetings("fund", { fundId: "fund-2" }, rel)).rejects.toMatchObject({ status: 404 })
  })
})
