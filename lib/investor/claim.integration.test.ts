import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const state = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => state.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values), { unsafe: (q: string, values: unknown[]) => state.query(q, values) }) }))

import { claimable, startClaim, confirmClaim, createProfileForAccount } from "./claim"
import { requestToConnect } from "./requests"

let db: PGlite
const sent: Array<{ to: string; subject: string; text: string }> = []
const send = async (m: { to: string; subject: string; text: string }) => { sent.push(m) }
const codeOf = () => /\b(\d{6})\b/.exec(sent.at(-1)!.subject)![1]
const one = async (q: string, v: unknown[] = []) => (await db.query<any>(q, v)).rows[0]
const ENTITY = async (user = "u-ann") => String((await one("SELECT id FROM investor_entities WHERE user_id = $1 LIMIT 1", [user])).id)

beforeAll(async () => {
  db = new PGlite()
  state.query.mockImplementation(async (q, values) => (await db.query(q, values)).rows)
  await db.exec(`
    CREATE TABLE organizations(id text PRIMARY KEY, kind text, name text, fund_id text);
    CREATE TABLE memberships(id text PRIMARY KEY, user_id text, org_id text, org_role text, persona text);
    CREATE TABLE funds(id text PRIMARY KEY, name text, listed_for_lps boolean DEFAULT false);
    CREATE TABLE profiles(id text PRIMARY KEY, email text, full_name text);
    CREATE TABLE platform_flags(key text PRIMARY KEY, enabled boolean, rollout_pct int, description text, updated_by text, updated_at timestamptz);
    CREATE TABLE contacts(id text PRIMARY KEY, email text);
    CREATE TABLE fund_lps (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, fund_id text, lp_contact_id text, lp_name text NOT NULL, status text DEFAULT 'committed', contact_email text, onboarding_state text NOT NULL DEFAULT 'not_invited', metadata jsonb DEFAULT '{}', commitment_amount numeric);
    CREATE TABLE lp_accounts (lp_id text PRIMARY KEY, fund_id text NOT NULL, user_id text NOT NULL, email text NOT NULL, created_at timestamptz DEFAULT now());
  `)
  for (const f of ["2026-10-20-investor-side", "2026-10-20b-investor-talks", "2026-10-20c-investor-bridge", "2026-10-20d-investor-claim"]) await db.exec(readFileSync(`scripts/migrations/${f}.sql`, "utf8").replace("INSERT INTO platform_flags", "-- INSERT INTO platform_flags"))
})
afterAll(async () => db.close())
beforeEach(async () => {
  sent.length = 0
  await db.exec(`DELETE FROM investor_claim_codes; DELETE FROM fund_relationships; DELETE FROM lp_accounts; DELETE FROM fund_lps; DELETE FROM contacts; DELETE FROM investor_entities; DELETE FROM investor_profiles; DELETE FROM funds;
    INSERT INTO funds(id, name) VALUES ('fund-1','Alpha'), ('fund-2','Beta');
    INSERT INTO investor_profiles (user_id, display_name, terms_version, terms_accepted_at) VALUES ('u-ann','Ann','2026-10',now()), ('u-bob','Bob','2026-10',now());
    INSERT INTO investor_entities (user_id, legal_name, kind) VALUES ('u-ann','Ann Holding','company'), ('u-bob','Bob','individual');
    INSERT INTO contacts VALUES ('c1','Ann@Example.com');
    INSERT INTO fund_lps (id, fund_id, lp_name, contact_email, commitment_amount) VALUES ('lp-a','fund-1','Ann Holding GmbH','ann@example.com', 750000), ('lp-b','fund-2','Someone Else','other@example.com', 100);
    INSERT INTO fund_lps (id, fund_id, lp_contact_id, lp_name) VALUES ('lp-c','fund-2','c1','Ann via contact');`)
})

describe("what can be claimed", () => {
  it("lists only records carrying the confirmed address (typed or via the contact), with no amounts", async () => {
    const list = await claimable("u-ann", "ANN@example.com", true)
    expect(list.map((c) => c.lpId).sort()).toEqual(["lp-a", "lp-c"])
    expect(JSON.stringify(list)).not.toMatch(/750000|commitment/)
    expect(await claimable("u-ann", "ann@example.com", false)).toEqual([])                  // an unconfirmed address matches nothing
    expect(await claimable("u-ann", null, true)).toEqual([])
    expect(await claimable("u-bob", "bob@example.com", true)).toEqual([])
  })
  it("never offers a record another account holds or has linked", async () => {
    await db.exec("INSERT INTO lp_accounts VALUES ('lp-a','fund-1','u-someone','ann@example.com')")
    expect((await claimable("u-ann", "ann@example.com", true)).map((c) => c.lpId)).toEqual(["lp-c"])
    await db.exec("INSERT INTO fund_relationships (fund_id, entity_id, user_id, stage, fund_lp_id) VALUES ('fund-2', (SELECT id FROM investor_entities WHERE user_id='u-bob'), 'u-bob', 'onboarding', 'lp-c')")
    expect(await claimable("u-ann", "ann@example.com", true)).toEqual([])
  })
})

describe("claiming", () => {
  it("needs the code: wrong, expired and locked codes are refused and nothing is linked", async () => {
    const e = await ENTITY()
    await expect(confirmClaim("u-ann", "ann@example.com", true, { lpId: "lp-a", entityId: e, code: "123456" })).rejects.toMatchObject({ code: "expired" })
    const r = await startClaim("u-ann", "ann@example.com", true, "lp-a", send)
    expect(r).toEqual({ sentTo: "a***@example.com", expiresInMinutes: 10 }); expect(sent[0].to).toBe("ann@example.com"); expect(sent[0].text).not.toMatch(/Alpha|Ann Holding|750/)
    for (let i = 0; i < 3; i++) await expect(confirmClaim("u-ann", "ann@example.com", true, { lpId: "lp-a", entityId: e, code: "000000" })).rejects.toMatchObject({ code: "wrong" })
    await expect(confirmClaim("u-ann", "ann@example.com", true, { lpId: "lp-a", entityId: e, code: codeOf() })).rejects.toMatchObject({ code: "locked" })
    expect((await one("SELECT count(*)::int n FROM fund_relationships")).n).toBe(0); expect((await one("SELECT count(*)::int n FROM lp_accounts")).n).toBe(0)
    await expect(startClaim("u-ann", "ann@example.com", true, "lp-a", send)).rejects.toMatchObject({ code: "wait" })
  })
  it("with the right code it links the doc 60 account and makes a relationship started by the fund, once", async () => {
    const e = await ENTITY()
    await startClaim("u-ann", "ann@example.com", true, "lp-a", send)
    const out = await confirmClaim("u-ann", "ann@example.com", true, { lpId: "lp-a", entityId: e, code: codeOf() })
    expect(out.stage).toBe("invited_to_onboard")
    expect(await one("SELECT user_id, email FROM lp_accounts WHERE lp_id = 'lp-a'")).toEqual({ user_id: "u-ann", email: "ann@example.com" })
    expect(await one("SELECT stage, initiated_by, fund_lp_id, entity_id FROM fund_relationships")).toEqual({ stage: "invited_to_onboard", initiated_by: "fund", fund_lp_id: "lp-a", entity_id: e })
    expect((await claimable("u-ann", "ann@example.com", true)).map((c) => c.lpId)).toEqual(["lp-c"])   // no longer offered
    await expect(confirmClaim("u-ann", "ann@example.com", true, { lpId: "lp-a", entityId: e, code: codeOf() })).rejects.toMatchObject({ status: 404 })
  })
  it("the stage follows how far onboarding has gone, and the entity must be the person's own", async () => {
    await db.exec("UPDATE fund_lps SET onboarding_state = 'terms_accepted' WHERE id = 'lp-a'")
    await startClaim("u-ann", "ann@example.com", true, "lp-a", send)
    await expect(confirmClaim("u-ann", "ann@example.com", true, { lpId: "lp-a", entityId: await ENTITY("u-bob"), code: codeOf() })).rejects.toMatchObject({ status: 404 })
    expect((await confirmClaim("u-ann", "ann@example.com", true, { lpId: "lp-a", entityId: await ENTITY(), code: codeOf() })).stage).toBe("onboarding")
  })
  it("needs no second code where doc 60's code-verified portal already tied the record to this account", async () => {
    await db.exec("INSERT INTO lp_accounts VALUES ('lp-a','fund-1','u-ann','ann@example.com'); UPDATE fund_lps SET onboarding_state = 'countersigned' WHERE id = 'lp-a'")
    expect((await claimable("u-ann", "ann@example.com", true)).find((c) => c.lpId === "lp-a")?.proved).toBe(true)
    expect(await startClaim("u-ann", "ann@example.com", true, "lp-a", send)).toEqual({ proved: true }); expect(sent).toHaveLength(0)
    expect((await confirmClaim("u-ann", "ann@example.com", true, { lpId: "lp-a", entityId: await ENTITY() })).stage).toBe("active")
  })
  it("links an existing open request to the record instead of making a second relationship", async () => {
    await db.exec("UPDATE funds SET listed_for_lps = true WHERE id = 'fund-1'; INSERT INTO fund_listings (fund_id, snapshot, eligibility) VALUES ('fund-1', '{\"name\":\"Alpha\",\"status\":\"fundraising\",\"sectors\":[],\"stages\":[],\"geographies\":[]}', '{}')")
    const e = await ENTITY()
    const req = await requestToConnect("u-ann", { entityId: e, fundId: "fund-1" })
    await startClaim("u-ann", "ann@example.com", true, "lp-a", send)
    const out = await confirmClaim("u-ann", "ann@example.com", true, { lpId: "lp-a", entityId: e, code: codeOf() })
    expect(out.relationshipId).toBe(req.id)
    expect((await one("SELECT count(*)::int n FROM fund_relationships")).n).toBe(1)
    expect((await one("SELECT fund_lp_id FROM fund_relationships")).fund_lp_id).toBe("lp-a")
  })
})

describe("a profile for someone who already has an account", () => {
  it("makes one profile and a first entity, needs the terms, and a second try is refused", async () => {
    await expect(createProfileForAccount("u-new", "Nina", false)).rejects.toMatchObject({ code: "terms" })
    await expect(createProfileForAccount("u-new", "N", true)).rejects.toThrow(/your name/)
    await createProfileForAccount("u-new", "Nina Neu", true)
    expect(await one("SELECT display_name FROM investor_profiles WHERE user_id = 'u-new'")).toEqual({ display_name: "Nina Neu" })
    expect((await one("SELECT legal_name, kind FROM investor_entities WHERE user_id = 'u-new'"))).toEqual({ legal_name: "Nina Neu", kind: "individual" })
    await expect(createProfileForAccount("u-new", "Nina Neu", true)).rejects.toMatchObject({ code: "exists", status: 409 })
    expect((await one("SELECT count(*)::int n FROM investor_profiles WHERE user_id = 'u-new'")).n).toBe(1)
  })
})
