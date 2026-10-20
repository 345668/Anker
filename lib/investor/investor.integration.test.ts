import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const state = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => state.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values), { unsafe: (q: string, values: unknown[]) => state.query(q, values) }) }))
// The existing listing switch writes an audit record; here it is the switch itself that matters.
vi.mock("@/lib/platform/listings", () => ({
  ListingError: class ListingError extends Error { constructor(m: string, public status = 400) { super(m) } },
  setFundListing: async (scope: { orgId: string; userId: string }, listed: boolean) => { await state.query("UPDATE funds SET listed_for_lps = $1 WHERE id = (SELECT fund_id FROM organizations WHERE id = $2)", [listed, scope.orgId]) },
}))

import { startSignup, verifySignup, CODE_MAX_TRIES, CODE_PER_HOUR, IP_PER_HOUR, type AdminAuth } from "./signup"
import { createEntity, updateEntity, archiveEntity, listEntities, getProfile, updateProfile, readEntity, isInvestorOnly, MAX_ENTITIES, InvestorError } from "./profile"
import { readRules, saveListing, getListingState, listedFunds, whoMayInvest, DEFAULT_RULES } from "./listing"
import { requestToConnect, myRequests, withdraw, inbound, decide, sharedCopy, DEFAULT_SHARE } from "./requests"

let db: PGlite
const ctx = { actor: "x" } as any
const sent: Array<{ to: string; subject: string; text: string }> = []
const send = async (m: { to: string; subject: string; text: string }) => { sent.push(m) }
const codeOf = () => /\b(\d{6})\b/.exec(sent.at(-1)!.subject)![1]
let created: Array<{ email: string; password: string }> = []
const fakeAdmin = (existing: string[] = []): (() => AdminAuth) => () => ({
  createUser: async (a) => {
    if (existing.includes(a.email)) return { data: { user: null }, error: { message: "A user with this email address has already been registered" } }
    created.push({ email: a.email, password: a.password })
    return { data: { user: { id: `u-${created.length}` } }, error: null }
  },
})

beforeAll(async () => {
  db = new PGlite()
  state.query.mockImplementation(async (q, values) => (await db.query(q, values)).rows)
  await db.exec(`
    CREATE TABLE organizations(id text PRIMARY KEY, kind text, name text, fund_id text);
    CREATE TABLE memberships(id text PRIMARY KEY, user_id text, org_id text, org_role text, persona text);
    CREATE TABLE funds(id text PRIMARY KEY, name text, description text, vintage_year int, target_size numeric, currency text, status text, vehicle_kind text, listed_for_lps boolean DEFAULT false, listed_for_lps_at timestamptz, listed_for_lps_by text);
    CREATE TABLE profiles(id text PRIMARY KEY, email text, full_name text);
    CREATE TABLE platform_flags(key text PRIMARY KEY, enabled boolean, rollout_pct int, description text, updated_by text, updated_at timestamptz);
    CREATE TABLE notifications(id serial PRIMARY KEY, user_id text, org_id text, kind text, severity text DEFAULT 'info', title text, body text, href text, dedupe_key text, read_at timestamptz, created_at timestamptz DEFAULT now());
    CREATE UNIQUE INDEX notifications_dedupe ON notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
    CREATE TABLE fund_lps (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, fund_id text, lp_name text, onboarding_state text NOT NULL DEFAULT 'not_invited');
    CREATE TABLE fund_profiles(id text PRIMARY KEY, org_id text, is_active boolean DEFAULT true, sectors jsonb, geographic_focus jsonb, investment_stage text, minimum_commitment numeric, thesis_description text, fund_life int, updated_at timestamptz DEFAULT now());
  `)
  await db.exec(readFileSync("scripts/migrations/2026-10-20-investor-side.sql", "utf8").replace("INSERT INTO platform_flags", "-- INSERT INTO platform_flags"))
  await db.exec(readFileSync("scripts/migrations/2026-10-20b-investor-talks.sql", "utf8"))
  await db.exec(readFileSync("scripts/migrations/2026-10-20c-investor-bridge.sql", "utf8"))
  await db.exec("CREATE TABLE data_room_documents(id text PRIMARY KEY, fund_id text, fund_lp_id text, title text, category text, file_url text, file_name text, byte_size bigint, archived_at timestamptz, created_at timestamptz DEFAULT now())")
  await db.exec(readFileSync("scripts/migrations/2026-10-20e-investor-materials.sql", "utf8"))
})
afterAll(async () => db.close())
beforeEach(async () => {
  sent.length = 0; created = []
  await db.exec(`DELETE FROM fund_relationships; DELETE FROM fund_listings; DELETE FROM investor_entities; DELETE FROM investor_profiles; DELETE FROM investor_signup_codes; DELETE FROM notifications; DELETE FROM profiles; DELETE FROM memberships; DELETE FROM fund_profiles; DELETE FROM organizations; DELETE FROM funds; DELETE FROM platform_flags;
    INSERT INTO platform_flags VALUES ('investor_signup', true, 100, NULL, NULL, now());
    INSERT INTO funds(id, name, description, vintage_year, target_size, currency, status, vehicle_kind) VALUES ('fund-1','Alpha Climate Fund I','A climate fund.',2026,50000000,'USD','fundraising','LP'), ('fund-2','Beta Growth Fund','Growth.',2025,100000000,'USD','closed','LP');
    INSERT INTO organizations VALUES ('org-1','fund','Alpha Partners','fund-1'), ('org-2','fund','Beta Partners','fund-2');
    INSERT INTO memberships VALUES ('m1','owner-1','org-1','workspace_owner','vc'), ('m2','admin-1','org-1','admin','vc'), ('m3','member-1','org-1','member','vc'), ('m4','owner-2','org-2','workspace_owner','vc');
    INSERT INTO fund_profiles(id, org_id, sectors, geographic_focus, investment_stage, minimum_commitment, thesis_description, fund_life) VALUES ('p1','org-1','["climate","AI"]','["Europe"]','seed, series a',250000,'Backs climate and AI founders in Europe.',10), ('p2','org-2','["fintech"]','["US"]','growth',1000000,'Growth fintech.',8);`)
})

describe("sign-up", () => {
  it("is closed while the platform flag is off, for both steps", async () => {
    await db.exec("UPDATE platform_flags SET enabled = false")
    await expect(startSignup({ email: "a@b.co", name: "Ann", termsAccepted: true, ip: null }, send)).rejects.toMatchObject({ status: 403, code: "closed" })
    await expect(verifySignup({ email: "a@b.co", code: "123456", password: "a-long-password" }, fakeAdmin())).rejects.toMatchObject({ code: "closed" })
    expect(sent).toHaveLength(0)
  })
  it("checks the address, the name and the terms before anything is stored or sent", async () => {
    await expect(startSignup({ email: "nope", name: "Ann", termsAccepted: true, ip: null }, send)).rejects.toThrow(/valid email/)
    await expect(startSignup({ email: "a@b.co", name: "A", termsAccepted: true, ip: null }, send)).rejects.toThrow(/your name/)
    await expect(startSignup({ email: "a@b.co", name: "Ann", termsAccepted: false, ip: null }, send)).rejects.toMatchObject({ code: "terms" })
    expect((await db.query<any>("SELECT count(*)::int n FROM investor_signup_codes")).rows[0].n).toBe(0)
  })
  it("emails only the code, stores a hash and not the code, and creates no account", async () => {
    const r = await startSignup({ email: "Ann@Example.com", name: "Ann Investor", termsAccepted: true, ip: "1.2.3.4" }, send)
    expect(r).toEqual({ sentTo: "a***@example.com", expiresInMinutes: 10 })
    expect(sent[0].to).toBe("ann@example.com")
    expect(sent[0].text).not.toContain("Ann Investor"); expect(sent[0].text).not.toMatch(/fund|invest/i)
    const row = (await db.query<any>("SELECT * FROM investor_signup_codes")).rows[0]
    expect(row.code_hash).not.toContain(codeOf()); expect(row.code_hash).toHaveLength(64)
    expect(created).toEqual([]); expect((await db.query<any>("SELECT count(*)::int n FROM investor_profiles")).rows[0].n).toBe(0)
  })
  it("limits codes: one a minute and five an hour per address, twenty an hour per network", async () => {
    await startSignup({ email: "a@b.co", name: "Ann", termsAccepted: true, ip: null }, send)
    await expect(startSignup({ email: "a@b.co", name: "Ann", termsAccepted: true, ip: null }, send)).rejects.toMatchObject({ code: "wait", status: 429 })
    await db.exec("UPDATE investor_signup_codes SET created_at = now() - interval '2 minutes'")
    for (let i = 0; i < CODE_PER_HOUR - 1; i++) { await startSignup({ email: "a@b.co", name: "Ann", termsAccepted: true, ip: null }, send); await db.exec("UPDATE investor_signup_codes SET created_at = now() - interval '2 minutes'") }
    await expect(startSignup({ email: "a@b.co", name: "Ann", termsAccepted: true, ip: null }, send)).rejects.toMatchObject({ code: "limit" })
    await db.exec("DELETE FROM investor_signup_codes")
    for (let i = 0; i < IP_PER_HOUR; i++) await db.query("INSERT INTO investor_signup_codes (email, name, code_hash, ip, terms_version, expires_at) VALUES ($1,'x','h','9.9.9.9','2026-10', now() + interval '5 minutes')", [`p${i}@x.co`])
    await expect(startSignup({ email: "new@b.co", name: "Ann", termsAccepted: true, ip: "9.9.9.9" }, send)).rejects.toMatchObject({ code: "limit" })
  })
  it("makes the account only when the code is right, then a profile and a first entity; the code works once", async () => {
    await startSignup({ email: "ann@example.com", name: "Ann Investor", termsAccepted: true, ip: null }, send)
    await expect(verifySignup({ email: "ann@example.com", code: "000000", password: "a-long-password" }, fakeAdmin())).rejects.toMatchObject({ code: "wrong" })
    expect(created).toEqual([])
    const r = await verifySignup({ email: "ann@example.com", code: codeOf(), password: "a-long-password" }, fakeAdmin())
    expect(r).toEqual({ email: "ann@example.com", userId: "u-1" })
    expect(created).toEqual([{ email: "ann@example.com", password: "a-long-password" }])
    expect(await getProfile("u-1")).toMatchObject({ displayName: "Ann Investor" })
    expect((await listEntities("u-1")).map((e) => [e.legalName, e.kind])).toEqual([["Ann Investor", "individual"]])
    expect((await db.query<any>("SELECT email FROM profiles WHERE id = 'u-1'")).rows[0].email).toBe("ann@example.com")
    await expect(verifySignup({ email: "ann@example.com", code: codeOf(), password: "a-long-password" }, fakeAdmin())).rejects.toMatchObject({ code: "expired" })
  })
  it("locks after three wrong tries, and an expired code is refused", async () => {
    await startSignup({ email: "ann@example.com", name: "Ann", termsAccepted: true, ip: null }, send)
    for (let i = 0; i < CODE_MAX_TRIES; i++) await expect(verifySignup({ email: "ann@example.com", code: "111111", password: "a-long-password" }, fakeAdmin())).rejects.toMatchObject({ code: "wrong" })
    await expect(verifySignup({ email: "ann@example.com", code: codeOf(), password: "a-long-password" }, fakeAdmin())).rejects.toMatchObject({ code: "locked" })
    await db.exec("DELETE FROM investor_signup_codes")
    await startSignup({ email: "ann@example.com", name: "Ann", termsAccepted: true, ip: null }, send)
    await db.exec("UPDATE investor_signup_codes SET expires_at = now() - interval '1 second'")
    await expect(verifySignup({ email: "ann@example.com", code: codeOf(), password: "a-long-password" }, fakeAdmin())).rejects.toMatchObject({ code: "expired" })
  })
  it("a weak password is refused without spending the code, and an address that already has an account is told so only after proving it", async () => {
    await startSignup({ email: "ann@example.com", name: "Ann", termsAccepted: true, ip: null }, send)
    await expect(verifySignup({ email: "ann@example.com", code: codeOf(), password: "short" }, fakeAdmin())).rejects.toThrow(/at least 10/)
    await expect(verifySignup({ email: "ann@example.com", code: codeOf(), password: "ann@example.com" }, fakeAdmin())).rejects.toThrow(/different password/)
    await expect(verifySignup({ email: "ann@example.com", code: codeOf(), password: "a-long-password" }, fakeAdmin(["ann@example.com"]))).rejects.toMatchObject({ status: 409, code: "exists" })
    expect((await db.query<any>("SELECT count(*)::int n FROM investor_profiles")).rows[0].n).toBe(0)
    // starting never says whether an account exists
    await db.exec("UPDATE investor_signup_codes SET created_at = now() - interval '2 minutes'")
    await expect(startSignup({ email: "ann@example.com", name: "Ann", termsAccepted: true, ip: null }, send)).resolves.toMatchObject({ sentTo: "a***@example.com" })
  })
})

describe("the profile and its entities", () => {
  const signedUp = async (email = "ann@example.com") => { await startSignup({ email, name: "Ann Investor", termsAccepted: true, ip: null }, send); return (await verifySignup({ email, code: codeOf(), password: "a-long-password" }, fakeAdmin())).userId }
  it("reads an entity strictly: name, kind, category, a sane range and horizon", () => {
    expect(() => readEntity({ legalName: "A", kind: "individual" })).toThrow(/at least two/)
    expect(() => readEntity({ legalName: "Ann", kind: "robot" })).toThrow(/Choose individual/)
    expect(() => readEntity({ legalName: "Ann", kind: "trust", category: "king" })).toThrow(/Choose professional/)
    expect(() => readEntity({ legalName: "Ann", kind: "trust", interests: { ticketMin: 500, ticketMax: 100 } })).toThrow(/cannot be larger/)
    expect(() => readEntity({ legalName: "Ann", kind: "trust", interests: { horizonYears: 99 } })).toThrow(/between 1 and 40/)
    expect(readEntity({ legalName: " Ann   Trust ", kind: "trust", category: "unsure", interests: { sectors: "AI, climate, AI", ticketMax: "1000000", horizonYears: "10" } }))
      .toMatchObject({ legalName: "Ann Trust", category: "unsure", interests: { sectors: ["AI", "climate"], ticketMax: 1_000_000, horizonYears: 10, ticketMin: null } })
  })
  it("a person manages several entities, up to a limit, and sees only their own", async () => {
    const a = await signedUp("ann@example.com"), b = await signedUp("bob@example.com")
    await createEntity(a, { legalName: "Ann Family Trust", kind: "trust", category: "professional" })
    expect((await listEntities(a)).map((e) => e.legalName)).toEqual(["Ann Investor", "Ann Family Trust"])
    expect((await listEntities(b)).map((e) => e.legalName)).toEqual(["Ann Investor"].map(() => "Ann Investor"))   // Bob's own first entity carries his own name here
    for (let i = (await listEntities(a)).length; i < MAX_ENTITIES; i++) await createEntity(a, { legalName: `Entity ${i}`, kind: "company" })
    await expect(createEntity(a, { legalName: "One too many", kind: "company" })).rejects.toMatchObject({ code: "limit" })
    const e = (await listEntities(a))[1]
    await expect(updateEntity(b, e.id, { legalName: "Hijack", kind: "trust" })).rejects.toMatchObject({ status: 404 })
    expect((await updateEntity(a, e.id, { legalName: "Ann Trust II", kind: "trust", country: "Germany" })).legalName).toBe("Ann Trust II")
  })
  it("updates the profile; an entity with an open request or the last entity cannot be removed", async () => {
    const a = await signedUp()
    expect((await updateProfile(a, { displayName: "Ann I.", country: "Germany", languages: "English, German", about: "Hello" })).languages).toEqual(["English", "German"])
    const [only] = await listEntities(a)
    await expect(archiveEntity(a, only.id)).rejects.toMatchObject({ code: "last" })
    const second = await createEntity(a, { legalName: "Second", kind: "company" })
    await db.query("INSERT INTO fund_relationships (fund_id, entity_id, user_id, stage) VALUES ('fund-1', $1, $2, 'interested')", [second.id, a])
    await expect(archiveEntity(a, second.id)).rejects.toMatchObject({ code: "open" })
    await db.exec("UPDATE fund_relationships SET stage = 'withdrawn'")
    await archiveEntity(a, second.id)
    expect((await listEntities(a))).toHaveLength(1)
  })
  it("sends an investor with no workspace to the investor area, and no one else", async () => {
    const a = await signedUp()
    expect(await isInvestorOnly(a)).toBe(true)
    await db.query("INSERT INTO memberships VALUES ('mx', $1, 'org-1', 'member', 'vc')", [a])
    expect(await isInvestorOnly(a)).toBe(false)
    expect(await isInvestorOnly("owner-1")).toBe(false)   // a fund manager with no investor profile
  })
})

describe("a fund's listing", () => {
  const scope = { orgId: "org-1", userId: "owner-1" }
  it("reads the rules strictly and says them in words", () => {
    expect(() => readRules({ countries: ["Germany"] })).toThrow(/two-letter country codes/)
    expect(() => readRules({ countries: ["DE"], excludedCountries: ["de"] })).toThrow(/both allowed and excluded/)
    expect(() => readRules({ categories: ["king"] })).toThrow(/Choose professional/)
    expect(() => readRules({ minTicket: -1 })).toThrow(/minimum cheque/)
    expect(() => readRules({ dailyCap: 0 })).toThrow(/between 1 and 100/)
    expect(() => readRules({ ndaRequired: true })).toThrow(/Paste the text of your NDA/)
    const r = readRules({ categories: ["professional", "professional"], countries: "de, fr", minTicket: "250000", dailyCap: 5, ndaRequired: true, ndaText: "  Confidential.  " })
    expect(r).toMatchObject({ categories: ["professional"], countries: ["DE", "FR"], minTicket: 250000, dailyCap: 5, ndaRequired: true })
    expect(whoMayInvest(r)).toBe("Open to professional investors, from DE, FR, minimum 250,000.")
    expect(whoMayInvest({ ...DEFAULT_RULES, professionalOnly: true, excludedCountries: ["US"] })).toBe("Professional investors only, not from US.")
  })
  it("cannot be listed before its rules are set, and no fund is listed to begin with", async () => {
    expect((await getListingState("org-1")).listed).toBe(false)
    expect(await listedFunds()).toEqual([])
    await expect(saveListing(scope, { listed: true }, ctx)).rejects.toMatchObject({ code: "rules" })
    expect(await listedFunds()).toEqual([])
  })
  it("takes a snapshot of the fund and its manager's profile, lists it, refreshes it, and unlists it", async () => {
    const s = await saveListing(scope, { rules: { professionalOnly: true, countries: ["DE"], minTicket: 250000 }, listed: true }, ctx)
    expect(s).toMatchObject({ listed: true, version: 1, snapshot: { name: "Alpha Climate Fund I", manager: "Alpha Partners", sectors: ["climate", "AI"], stages: ["seed", "series a"], geographies: ["Europe"], minCommitment: 250000, termYears: 10, status: "fundraising" } })
    expect(s.snapshot!.whoMayInvest).toBe("Professional investors only, from DE, minimum 250,000.")
    const [f] = await listedFunds()
    expect(f.facts).toMatchObject({ fundId: "fund-1", name: "Alpha Climate Fund I", rules: { professionalOnly: true, countries: ["DE"], minTicket: 250000 } })
    await db.exec("UPDATE fund_profiles SET minimum_commitment = 500000 WHERE id = 'p1'")
    expect((await listedFunds())[0].facts.minCommitment).toBe(250000)            // investors see the snapshot, not live edits
    const r = await saveListing(scope, {}, ctx)
    expect(r.version).toBe(2); expect((await listedFunds())[0].facts.minCommitment).toBe(500000)
    expect((await saveListing(scope, { listed: false }, ctx)).listed).toBe(false)
    expect(await listedFunds()).toEqual([])                                       // a delisted fund disappears
  })
  it("will not list a fund that says nothing about itself, or a workspace that manages no fund", async () => {
    await db.exec("UPDATE fund_profiles SET sectors = '[]', thesis_description = NULL WHERE id = 'p1'")
    await expect(saveListing(scope, { rules: {}, listed: true }, ctx)).rejects.toMatchObject({ code: "thin" })
    await db.exec("INSERT INTO organizations VALUES ('org-3','company','Acme',NULL)")
    await expect(saveListing({ orgId: "org-3", userId: "x" }, { rules: {} }, ctx)).rejects.toMatchObject({ status: 404 })
  })
})

describe("asking a fund to talk, and the fund's answer", () => {
  const owner = { orgId: "org-1", userId: "owner-1" }
  async function setUp() {
    await saveListing(owner, { rules: { professionalOnly: false, categories: ["professional", "semi_professional"], countries: ["DE", "GB"], minTicket: 250000, dailyCap: 2 }, listed: true }, ctx)
    const a = await (async () => { await startSignup({ email: "ann@example.com", name: "Ann Investor", termsAccepted: true, ip: null }, send); return (await verifySignup({ email: "ann@example.com", code: codeOf(), password: "a-long-password" }, fakeAdmin())).userId })()
    const e = (await listEntities(a))[0]
    await updateEntity(a, e.id, { legalName: "Ann Investor", kind: "individual", country: "Germany", category: "professional", interests: { sectors: ["climate"], stages: ["seed"], geographies: ["Europe"], ticketMin: 250000, ticketMax: 1000000, horizonYears: 10 } })
    return { a, entityId: e.id }
  }
  it("cannot ask a fund that is not listed, a closed one, or with another person's entity", async () => {
    const { a, entityId } = await setUp()
    await db.exec("INSERT INTO fund_listings (fund_id, snapshot, eligibility) VALUES ('fund-2', '{\"name\":\"Beta\",\"status\":\"closed\"}', '{}')")
    await expect(requestToConnect(a, { entityId, fundId: "fund-2" })).rejects.toMatchObject({ code: "not_listed" })    // present but not switched on
    await db.exec("UPDATE funds SET listed_for_lps = true WHERE id = 'fund-2'")
    await expect(requestToConnect(a, { entityId, fundId: "fund-2" })).rejects.toMatchObject({ code: "closed" })
    await expect(requestToConnect(a, { entityId: "00000000-0000-0000-0000-000000000000", fundId: "fund-1" })).rejects.toMatchObject({ code: "not_found" })
    const b = await (async () => { await db.exec("UPDATE investor_signup_codes SET created_at = now() - interval '2 minutes'"); await startSignup({ email: "bob@example.com", name: "Bob", termsAccepted: true, ip: null }, send); return (await verifySignup({ email: "bob@example.com", code: codeOf(), password: "a-long-password" }, fakeAdmin())).userId })()
    await expect(requestToConnect(b, { entityId, fundId: "fund-1" })).rejects.toMatchObject({ code: "not_found" })      // Ann's entity is not Bob's
  })
  it("a fund that blocked a person refuses their next request", async () => {
    const { a, entityId } = await setUp()
    const { id } = await requestToConnect(a, { entityId, fundId: "fund-1" })
    await decide("fund-1", id, "accept", "owner-1")
    await db.query("UPDATE fund_relationships SET blocked_by = 'fund', stage = 'declined' WHERE id = $1", [id])
    await expect(requestToConnect(a, { entityId, fundId: "fund-1" })).rejects.toMatchObject({ code: "blocked", status: 403 })
  })
  it("sends a request with what the investor chose to share, stores the eligibility and fit, and tells the fund's owners and admins, not its members", async () => {
    const { a, entityId } = await setUp()
    const r = await requestToConnect(a, { entityId, fundId: "fund-1", indicativeMin: 250000, indicativeMax: 500000, timing: "this_quarter", note: "Interested in the climate thesis.", share: { interests: false } })
    expect(r.fit.eligibility.status).toBe("eligible")
    const [row] = (await inbound("fund-1"))
    expect(row).toMatchObject({ stage: "interested", timing: "this_quarter", note: "Interested in the climate thesis.", indicative: { min: 250000, max: 500000 }, eligibility: { status: "eligible" }, contactEmail: null })
    expect(row.shared).toMatchObject({ name: "Ann Investor", country: "Germany", category: "professional", categoryNote: "self-declared by the investor" })
    expect(row.shared.interests).toBeUndefined()                                  // not shared: the investor said no
    expect(JSON.stringify(row)).not.toContain("ann@example.com")                  // the address does not travel yet
    const n = (await db.query<any>("SELECT user_id, body FROM notifications WHERE kind = 'investor_request' ORDER BY user_id")).rows
    expect(n.map((x: any) => x.user_id)).toEqual(["admin-1", "owner-1"])
    expect(n[0].body).not.toMatch(/Ann|climate/)
  })
  it("allows one open request per entity per fund, and the fund's daily limit", async () => {
    const { a, entityId } = await setUp()
    await requestToConnect(a, { entityId, fundId: "fund-1" })
    await expect(requestToConnect(a, { entityId, fundId: "fund-1" })).rejects.toMatchObject({ code: "open", status: 409 })
    const second = await createEntity(a, { legalName: "Ann Trust", kind: "trust", category: "professional", country: "Germany", interests: { ticketMax: 500000 } })
    await requestToConnect(a, { entityId: second.id, fundId: "fund-1" })
    const third = await createEntity(a, { legalName: "Ann GmbH", kind: "company", category: "professional", country: "Germany", interests: { ticketMax: 500000 } })
    await expect(requestToConnect(a, { entityId: third.id, fundId: "fund-1" })).rejects.toMatchObject({ code: "cap", status: 429 })
  })
  it("an ineligible investor can still ask; the fund sees why, held for it rather than dropped", async () => {
    const { a, entityId } = await setUp()
    await updateEntity(a, entityId, { legalName: "Ann Investor", kind: "individual", country: "Brazil", category: "other", interests: { ticketMax: 1000000 } })
    const r = await requestToConnect(a, { entityId, fundId: "fund-1" })
    expect(r.fit.eligibility.status).toBe("ineligible")
    const [row] = await inbound("fund-1")
    expect(row.eligibility!.failed.join(" ")).toMatch(/accepts a professional investor and a semi-professional investor/)
    expect(row.eligibility!.failed.join(" ")).toMatch(/your country is Brazil/)
  })
  it("the fund accepts or declines a waiting request, once; the address is shared only on acceptance; another fund cannot answer", async () => {
    const { a, entityId } = await setUp()
    const { id } = await requestToConnect(a, { entityId, fundId: "fund-1" })
    await expect(decide("fund-2", id, "accept", "owner-2")).rejects.toMatchObject({ status: 404 })
    expect((await inbound("fund-2"))).toEqual([])                                 // another fund sees nothing
    expect(await decide("fund-1", id, "accept", "owner-1")).toEqual({ stage: "in_talks" })
    await expect(decide("fund-1", id, "decline", "owner-1")).rejects.toMatchObject({ status: 404 })
    const [row] = await inbound("fund-1")
    expect(row).toMatchObject({ stage: "in_talks", contactEmail: "ann@example.com" })
    const mine = await myRequests(a)
    expect(mine[0]).toMatchObject({ stage: "in_talks", fundName: "Alpha Climate Fund I", message: "The fund accepted and wants to talk." })
  })
  it("a decline carries no verdict to the investor; they can withdraw until onboarding; and see only their own", async () => {
    const { a, entityId } = await setUp()
    const { id } = await requestToConnect(a, { entityId, fundId: "fund-1" })
    await decide("fund-1", id, "decline", "owner-1", "not a fit for us")
    const mine = (await myRequests(a))[0]
    expect(mine.message).toBe("The fund is not able to take this forward."); expect(JSON.stringify(mine)).not.toContain("not a fit for us")
    expect((await inbound("fund-1"))[0].contactEmail).toBeNull()
    await expect(withdraw(a, id)).rejects.toMatchObject({ status: 404 })           // already answered
    const second = await requestToConnect(a, { entityId, fundId: "fund-1" })       // a new one is allowed after a decline
    await withdraw(a, second.id)
    expect((await myRequests(a))[0].message).toBe("You withdrew this request.")
    await db.exec("INSERT INTO investor_profiles (user_id, display_name, terms_version, terms_accepted_at) VALUES ('other','Other','2026-10', now())")
    expect(await myRequests("other")).toEqual([])
  })
  it("the copy for a fund is built only from what was chosen", () => {
    const e = { id: "e", legalName: "Ann", kind: "individual" as const, country: "Germany", taxResidence: "Germany", category: "professional" as const, interests: { stages: ["seed"], sectors: [], geographies: [], ticketMin: null, ticketMax: null, horizonYears: null }, createdAt: "", updatedAt: "" }
    const c = sharedCopy(e, { name: false, country: false, category: false, interests: false }, new Date("2026-10-20T10:00:00Z"))
    expect(c).toEqual({ at: "2026-10-20T10:00:00.000Z", choice: { name: false, country: false, category: false, interests: false }, kind: "individual" })
    expect(sharedCopy(e, DEFAULT_SHARE)).not.toHaveProperty("taxResidence")      // tax residence is never in the copy
  })
})
