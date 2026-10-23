import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
process.env.SECRET_KEY = "rights-test-secret"
vi.mock("server-only", () => ({}))
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"

const state = vi.hoisted(() => ({ query: vi.fn(), recompute: vi.fn(), audit: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => state.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values), { unsafe: (q: string, values: unknown[]) => state.query(q, values) }) }))
vi.mock("@/lib/modules/kyc", () => ({ REQUIRED_DOCS: { individual: [{ type: "ubo_declaration", label: "ID" }], entity: [{ type: "ubo_declaration", label: "UBO" }] }, recomputeCase: (...a: unknown[]) => state.recompute(...a) }))
vi.mock("@/lib/audit/audit-log", () => ({ logAudit: (...a: unknown[]) => state.audit(...a) }))
vi.mock("@/lib/portfolio/lp-verification", () => ({
  uploadDocument: async (lpId: string, type: string, file: { filename: string; bytes: Buffer }) => {
    const [v] = (await state.query("SELECT case_id FROM lp_verification WHERE lp_id = $1", [lpId])) as any[]
    const [doc] = (await state.query("SELECT id FROM kyc_documents WHERE case_id = $1 AND doc_type = $2", [v.case_id, type])) as any[]
    await state.query("INSERT INTO kyc_document_files (doc_id, sha256) VALUES ($1, $2)", [doc.id, createHash("sha256").update(file.bytes).digest("hex")])
    await state.query("UPDATE kyc_documents SET status = 'received' WHERE id = $1", [doc.id])
  },
}))

import { exportInvestor, eraseInvestor } from "./rights"
import { runRetention, retentionRules, RETENTION } from "./retention"
import { POLICY } from "./retention-policy"
import { addDocument, shareWithFund } from "./passport"
import { sendMessage } from "./talks"
import { proposeMeeting } from "./materials"

let db: PGlite
const one = async (q: string, v: unknown[] = []) => (await db.query<any>(q, v)).rows[0]
const all = async (q: string, v: unknown[] = []) => (await db.query<any>(q, v)).rows
const PDF = (t = "a") => Buffer.from(`%PDF-1.4 ${t}`)
const send = async () => {}
const deleted: string[] = []
const deleteAccount = async (id: string) => { deleted.push(id) }
let E: string, REL: string, REL2: string

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
    CREATE TABLE lp_accounts (lp_id text PRIMARY KEY, fund_id text NOT NULL, user_id text NOT NULL, email text NOT NULL, created_at timestamptz DEFAULT now());
    CREATE TABLE notifications(id serial PRIMARY KEY, user_id text, org_id text, kind text, severity text DEFAULT 'info', title text, body text, href text, dedupe_key text, read_at timestamptz, created_at timestamptz DEFAULT now());
    CREATE UNIQUE INDEX notifications_dedupe ON notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
    CREATE TABLE data_room_documents(id text PRIMARY KEY, fund_id text, fund_lp_id text, title text, category text, file_url text, file_name text, byte_size bigint, archived_at timestamptz, created_at timestamptz DEFAULT now());
    CREATE TABLE lp_verification(lp_id text PRIMARY KEY, case_id text, submitted_at timestamptz);
    CREATE TABLE kyc_documents(id text PRIMARY KEY DEFAULT gen_random_uuid()::text, case_id text, doc_type text, status text DEFAULT 'requested', received_at timestamptz);
    CREATE TABLE kyc_document_files(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), doc_id text, sha256 text, superseded boolean DEFAULT false, created_at timestamptz DEFAULT now());
  `)
  for (const f of ["2026-10-20-investor-side", "2026-10-20b-investor-talks", "2026-10-20c-investor-bridge", "2026-10-20d-investor-claim", "2026-10-20e-investor-materials", "2026-10-20f-investor-team", "2026-10-20g-investor-passport", "2026-10-20h-investor-discovery", "2026-10-20i-message-attachments", "2026-10-21-investor-legal", "2026-10-23-investor-passport-flag"]) await db.exec(readFileSync(`scripts/migrations/${f}.sql`, "utf8"))
})
afterAll(async () => db.close())
beforeEach(async () => {
  deleted.length = 0; state.audit.mockReset(); state.recompute.mockReset()
  await db.exec("INSERT INTO platform_flags (key, enabled) VALUES ('investor_passport', true) ON CONFLICT (key) DO UPDATE SET enabled = true")
  await db.exec(`DELETE FROM investor_claim_codes; DELETE FROM investor_signup_codes; DELETE FROM fund_connect_invites; DELETE FROM relationship_attachments; DELETE FROM relationship_meetings; DELETE FROM relationship_messages; DELETE FROM passport_shares; DELETE FROM passport_documents; DELETE FROM kyc_document_files; DELETE FROM kyc_documents; DELETE FROM lp_verification; DELETE FROM investor_entity_events; DELETE FROM investor_entity_invites; DELETE FROM investor_entity_members; DELETE FROM fund_relationships; DELETE FROM fund_lps; DELETE FROM lp_accounts; DELETE FROM fund_listings; DELETE FROM investor_entities; DELETE FROM investor_profiles; DELETE FROM notifications; DELETE FROM profiles; DELETE FROM memberships; DELETE FROM organizations; DELETE FROM funds;
    INSERT INTO funds(id, name) VALUES ('fund-1','Alpha'), ('fund-2','Beta');
    INSERT INTO organizations VALUES ('org-1','fund','Alpha Partners','fund-1');
    INSERT INTO memberships VALUES ('m1','fundowner','org-1','workspace_owner','vc');
    INSERT INTO fund_listings (fund_id, snapshot, eligibility) VALUES ('fund-1', '{"name":"Alpha Climate"}', '{}'), ('fund-2', '{"name":"Beta Growth"}', '{}');
    INSERT INTO profiles VALUES ('ann','ann@example.com','Ann Investor'), ('bob','bob@example.com','Bob Other'), ('team','team@example.com','Tess Teammate');
    INSERT INTO investor_profiles (user_id, display_name, country, about, terms_version, terms_accepted_at) VALUES ('ann','Ann Investor','Germany','I like climate','2026-10',now()), ('bob','Bob Other',NULL,NULL,'2026-10',now()), ('team','Tess Teammate',NULL,NULL,'2026-10',now());`)
  E = String((await db.query<any>("INSERT INTO investor_entities (user_id, legal_name, kind, country, tax_residence, category, interests) VALUES ('ann','Ann Family Trust','trust','Germany','Germany','professional','{\"sectors\":[\"climate\"]}') RETURNING id")).rows[0].id)
  await db.query("INSERT INTO investor_entity_members (entity_id, user_id, role, added_by) VALUES ($1,'team','can_act','ann')", [E])
  await db.exec(`INSERT INTO fund_lps (id, fund_id, onboarding_state) VALUES ('lp-1','fund-1','details_confirmed');
    INSERT INTO lp_verification VALUES ('lp-1','case-1',now()); INSERT INTO kyc_documents (id, case_id, doc_type) VALUES ('k1','case-1','ubo_declaration');`)
  REL = String((await db.query<any>("INSERT INTO fund_relationships (fund_id, entity_id, user_id, stage, fund_lp_id, shared, note, indicative_min, nda_ip, nda_accepted_at, nda_text) VALUES ('fund-1', $1, 'ann', 'onboarding', 'lp-1', '{\"name\":\"Ann Family Trust\",\"country\":\"Germany\"}', 'my private note', 250000, '9.9.9.9', now(), 'Keep it secret.') RETURNING id", [E])).rows[0].id)
  REL2 = String((await db.query<any>("INSERT INTO fund_relationships (fund_id, entity_id, user_id, stage, shared, note) VALUES ('fund-2', $1, 'ann', 'in_talks', '{\"name\":\"Ann Family Trust\"}', 'second note') RETURNING id", [E])).rows[0].id)
})

describe("a copy of the investor's data", () => {
  it("carries the person's data and none of anyone else's, and no file contents", async () => {
    await addDocument("ann", E, "ubo_declaration", { filename: "passport.pdf", bytes: PDF("secret-bytes") })
    await sendMessage("fund", { fundId: "fund-2", senderId: "x" }, REL2, "Welcome", send)
    await sendMessage("investor", { userId: "ann", senderId: "ann" }, REL2, "Thanks", send, [{ filename: "slip.pdf", bytes: PDF("slip") }])
    await proposeMeeting("fund", { fundId: "fund-2" }, REL2, { link: "https://meet.test/x" }, send)
    const x: any = await exportInvestor("ann")
    expect(x.account).toMatchObject({ email: "ann@example.com", termsVersion: "2026-10" }); expect(x.profile.displayName).toBe("Ann Investor")
    expect(x.entities[0]).toMatchObject({ legalName: "Ann Family Trust", role: "owner" })
    expect(x.requests.map((r: any) => r.fund).sort()).toEqual(["Alpha Climate", "Beta Growth"]); expect(x.requests.find((r: any) => r.fund === "Alpha Climate")).toMatchObject({ note: "my private note", indicativeMin: 250000, sharedWithFund: { name: "Ann Family Trust" } })
    expect(x.conversations.map((m: any) => [m.from, m.body])).toEqual([["fund", "Welcome"], ["investor", "Thanks"]]); expect(x.conversations[1].attachments[0].filename).toBe("slip.pdf")
    expect(x.meetings).toHaveLength(1); expect(x.passport.documents[0]).toMatchObject({ type: "ubo_declaration", filename: "passport.pdf" })
    expect(x.team.members).toEqual([expect.objectContaining({ name: "Tess Teammate", role: "can_act" })])
    const text = JSON.stringify(x)
    expect(text).not.toMatch(/secret-bytes|%PDF|content_enc|Bob Other|bob@example/)
    const teammate: any = await exportInvestor("team")
    expect(teammate.entities[0]).toMatchObject({ legalName: "Ann Family Trust", role: "can_act" }); expect(teammate.team.members).toEqual([])      // a teammate does not receive the owner's team list
    await expect(exportInvestor("nobody")).rejects.toMatchObject({ code: "no_profile" })
  })
})

describe("erasure", () => {
  it("needs the typed confirmation and a profile", async () => {
    await expect(eraseInvestor("ann", "yes", deleteAccount)).rejects.toMatchObject({ code: "confirm" })
    await expect(eraseInvestor("ann", "erase", deleteAccount)).rejects.toMatchObject({ code: "confirm" })
    await expect(eraseInvestor("nobody", "ERASE", deleteAccount)).rejects.toMatchObject({ code: "no_profile" })
    expect(await one("SELECT 1 AS x FROM investor_profiles WHERE user_id = 'ann'")).toBeTruthy(); expect(deleted).toEqual([])
  })
  it("removes the person and what is theirs, anonymises what funds keep, and deletes the sign-in", async () => {
    await addDocument("ann", E, "ubo_declaration", { filename: "passport.pdf", bytes: PDF("p") })
    await shareWithFund("ann", E, REL, ["ubo_declaration"])                                                         // an unseen copy at fund-1
    await sendMessage("fund", { fundId: "fund-2", senderId: "x" }, REL2, "Welcome", send)
    await sendMessage("investor", { userId: "ann", senderId: "ann" }, REL2, "My phone is 0151 123456", send, [{ filename: "slip.pdf", bytes: PDF("slip") }])
    await db.query("INSERT INTO investor_entity_events (entity_id, user_id, action) VALUES ($1,'ann','request_sent')", [E])
    const s = await eraseInvestor("ann", "ERASE", deleteAccount)
    expect(s).toMatchObject({ entitiesAnonymised: 1, passportFilesRemoved: 1, sharedCopiesDeleted: 1, requestsWithdrawn: 1, messagesRemoved: 1, accountDeleted: true })
    expect(deleted).toEqual(["ann"])
    // the person
    expect(await one("SELECT 1 AS x FROM investor_profiles WHERE user_id = 'ann'")).toBeUndefined(); expect(await one("SELECT 1 AS x FROM profiles WHERE id = 'ann'")).toBeUndefined()
    expect((await all("SELECT 1 FROM passport_documents"))).toHaveLength(0); expect((await all("SELECT 1 FROM passport_shares"))).toHaveLength(0)
    expect((await all("SELECT 1 FROM investor_entity_members"))).toHaveLength(0); expect((await all("SELECT 1 FROM investor_entity_events"))).toHaveLength(0)
    expect(await all("SELECT 1 FROM kyc_document_files")).toHaveLength(0)                                       // the unseen copy at the fund was taken back
    // the entity is anonymised, not deleted, so the funds' records stay whole
    expect(await one("SELECT legal_name, country, tax_residence, category, user_id, interests, archived_at IS NOT NULL AS archived FROM investor_entities")).toEqual({ legal_name: "Erased investor", country: null, tax_residence: null, category: null, user_id: "erased", interests: {}, archived: true })
    // what funds keep, with the name removed
    const rels = await all("SELECT stage, user_id, shared, note, indicative_min, nda_ip, nda_text, nda_accepted_at IS NOT NULL AS nda FROM fund_relationships ORDER BY fund_id")
    expect(rels[0]).toMatchObject({ stage: "onboarding", user_id: "erased", note: null, indicative_min: null, nda_ip: null, nda_text: "Keep it secret.", nda: true }); expect(rels[0].shared).toEqual({ erased: true, kind: "trust" })
    expect(rels[1]).toMatchObject({ stage: "withdrawn", user_id: "erased", note: null })
    const msgs = await all("SELECT sender, body FROM relationship_messages ORDER BY created_at")
    expect(msgs).toEqual([{ sender: "fund", body: "Welcome" }, { sender: "investor", body: "[removed at the investor’s request]" }])
    expect(await all("SELECT 1 FROM relationship_attachments")).toHaveLength(0)
    expect(JSON.stringify(await all("SELECT * FROM fund_relationships"))).not.toMatch(/Ann Family|my private note|9\.9\.9\.9/)
    expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "investor.erased", actorId: "ann" }))
    expect(JSON.stringify(state.audit.mock.calls)).not.toMatch(/Ann|ann@example/)
  })
  it("keeps a copy a fund has already checked and says so", async () => {
    await addDocument("ann", E, "ubo_declaration", { filename: "p.pdf", bytes: PDF("p") })
    await shareWithFund("ann", E, REL, ["ubo_declaration"])
    await db.exec("UPDATE kyc_documents SET status = 'verified'")
    const s = await eraseInvestor("ann", "ERASE", deleteAccount)
    expect(s).toMatchObject({ sharedCopiesDeleted: 0, sharedCopiesKeptByFunds: 1 })
    expect(await all("SELECT 1 FROM kyc_document_files")).toHaveLength(1)
    expect(s.whatFundsKeep.join(" ")).toMatch(/already checked/)
  })
  it("a teammate's erasure only removes their own place, and touches nothing of the owner's", async () => {
    const s = await eraseInvestor("team", "ERASE", deleteAccount)
    expect(s).toMatchObject({ entitiesAnonymised: 0, accountDeleted: true })
    expect(await all("SELECT 1 FROM investor_entity_members")).toHaveLength(0)
    expect(await one("SELECT legal_name FROM investor_entities")).toEqual({ legal_name: "Ann Family Trust" })
    expect(await one("SELECT 1 AS x FROM investor_profiles WHERE user_id = 'ann'")).toBeTruthy(); expect((await one("SELECT note FROM fund_relationships WHERE id = $1", [REL])).note).toBe("my private note")
  })
  it("keeps the sign-in of someone who also belongs to a workspace, and removes invitations addressed to them", async () => {
    await db.exec("INSERT INTO memberships VALUES ('m9','ann','org-1','member','vc')")
    await db.query("INSERT INTO investor_entity_invites (entity_id, email, role, invited_by, expires_at) VALUES ($1,'ann@example.com','can_view','bob', now() + interval '1 day')", [E])
    const s = await eraseInvestor("ann", "ERASE", deleteAccount)
    expect(s.accountDeleted).toBe(false); expect(deleted).toEqual([]); expect(await one("SELECT 1 AS x FROM profiles WHERE id = 'ann'")).toBeTruthy()
    expect(await all("SELECT 1 FROM investor_entity_invites")).toHaveLength(0)
  })
})

describe("retention", () => {
  it("every rule the job runs is described in the policy the counsel pack is generated from, and the other way round", () => {
    expect(retentionRules().map((r) => r.key).sort()).toEqual(POLICY.map((p) => p.key).sort())
  })
  const old = (days: number) => `now() - interval '${days} days'`
  async function seed() {
    await db.exec(`INSERT INTO investor_signup_codes (email, name, code_hash, terms_version, expires_at, created_at) VALUES ('old@x.co','x','h','2026-10', ${old(1)}, ${old(2)}), ('new@x.co','x','h','2026-10', now() + interval '5 minutes', now());
      INSERT INTO investor_claim_codes (user_id, lp_id, code_hash, expires_at, created_at) VALUES ('ann','lp-1','h', ${old(1)}, ${old(2)}), ('ann','lp-1','h', now() + interval '5 minutes', now());
      INSERT INTO investor_entity_invites (entity_id, email, role, invited_by, expires_at, created_at, revoked_at) VALUES ('${E}','gone@x.co','can_view','ann', ${old(40)}, ${old(60)}, ${old(45)}), ('${E}','recent@x.co','can_view','ann', ${old(1)}, ${old(15)}, ${old(2)}), ('${E}','open@x.co','can_view','ann', now() + interval '5 days', now(), NULL);
      INSERT INTO fund_connect_invites (fund_id, entity_id, invited_by, status, created_at, answered_at, card) VALUES ('fund-1','${E}','x','sent', ${old(40)}, NULL, '{"kind":"trust"}'), ('fund-2','${E}','x','declined', ${old(300)}, ${old(200)}, '{"kind":"trust"}'), ('fund-2','${E}','y','declined', ${old(100)}, ${old(50)}, '{"kind":"trust"}');
      INSERT INTO investor_entity_events (entity_id, user_id, action, at) VALUES ('${E}','ann','old',${old(1200)}), ('${E}','ann','new', now());`)
  }
  it("removes what is past its period, leaves what is not, and a dry run changes nothing", async () => {
    await seed()
    const dry = await runRetention({ dryRun: true })
    expect(dry).toMatchObject({ signup_codes: 1, claim_codes: 1, team_invites: 1, fund_invites_expire: 1, fund_invite_cards: 1, entity_events: 1 })
    expect((await all("SELECT 1 FROM investor_signup_codes")).length).toBe(2)
    const out = await runRetention()
    expect(out).toEqual(dry)
    expect((await all("SELECT email FROM investor_signup_codes")).map((r) => r.email)).toEqual(["new@x.co"]); expect(await all("SELECT 1 FROM investor_claim_codes")).toHaveLength(1)
    expect((await all("SELECT email FROM investor_entity_invites ORDER BY email")).map((r) => r.email)).toEqual(["open@x.co", "recent@x.co"])
    expect((await all("SELECT status, card FROM fund_connect_invites ORDER BY created_at")).map((r) => [r.status, JSON.stringify(r.card)])).toEqual([["declined", "{}"], ["declined", '{"kind":"trust"}'], ["withdrawn", '{"kind":"trust"}']])
    expect((await all("SELECT action FROM investor_entity_events")).map((r) => r.action)).toEqual(["new"])
    expect(Object.values(await runRetention())).toEqual(Object.values(out).map(() => 0))                         // a second run finds nothing more
  })
  it("wipes passport files of long-archived entities and deletes never-shared superseded records, but keeps share history", async () => {
    await addDocument("ann", E, "ubo_declaration", { filename: "a.pdf", bytes: PDF("one") })
    await addDocument("ann", E, "ubo_declaration", { filename: "b.pdf", bytes: PDF("two") })                         // the first is now superseded and never shared
    await shareWithFund("ann", E, REL, ["ubo_declaration"])
    await db.exec(`UPDATE passport_documents SET created_at = ${old(60)}; UPDATE investor_entities SET archived_at = ${old(60)}`)
    const out = await runRetention()
    expect(out.passport_superseded).toBe(1); expect(out.passport_archived).toBe(1)
    const docs = await all("SELECT superseded, length(content_enc) AS len FROM passport_documents")
    expect(docs).toEqual([{ superseded: true, len: 0 }])                                                         // the shared one's record stays, its bytes are gone
    expect(await all("SELECT 1 FROM passport_shares")).toHaveLength(1)
  })
  it("removes attachments of conversations closed a year ago, keeps the messages, and never touches an open one", async () => {
    for (const [rel, stage, updated] of [[REL2, "declined", 400], [REL, "onboarding", 400]] as const) {
      await db.query("UPDATE fund_relationships SET stage = $2, updated_at = now() - ($3 || ' days')::interval WHERE id = $1", [rel, stage, String(updated)])
      const m = (await db.query<any>("INSERT INTO relationship_messages (relationship_id, fund_id, sender, sender_user_id, body) SELECT id, fund_id, 'fund', 'x', 'hi' FROM fund_relationships WHERE id = $1 RETURNING id", [rel])).rows[0].id
      await db.query("INSERT INTO relationship_attachments (message_id, relationship_id, fund_id, filename, content_type, size_bytes, sha256, content_enc) SELECT $1, id, fund_id, 'a.pdf', 'application/pdf', 1, 'x', '\\x00'::bytea FROM fund_relationships WHERE id = $2", [m, rel])
    }
    expect((await runRetention()).attachments_closed).toBe(1)
    expect((await all("SELECT relationship_id FROM relationship_attachments")).map((r) => String(r.relationship_id))).toEqual([REL])
    expect(await all("SELECT 1 FROM relationship_messages")).toHaveLength(2)
    expect(RETENTION.closedAttachmentsDays).toBe(365)
  })
  it("never removes a fund's relationship or its own messages", async () => {
    await db.query("UPDATE fund_relationships SET stage = 'declined', updated_at = now() - interval '900 days'")
    await db.exec("INSERT INTO relationship_messages (relationship_id, fund_id, sender, sender_user_id, body, created_at) SELECT id, fund_id, 'fund', 'x', 'kept', now() - interval '900 days' FROM fund_relationships")
    await runRetention()
    expect(await all("SELECT 1 FROM fund_relationships")).toHaveLength(2); expect(await all("SELECT 1 FROM relationship_messages")).toHaveLength(2)
  })
})
