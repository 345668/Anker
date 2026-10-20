import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const state = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => state.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values), { unsafe: (q: string, values: unknown[]) => state.query(q, values) }) }))

import { setDiscoverable, discoverableState, searchForFund, inviteEntity, withdrawInvite, invitesOfFund, invitesForMe, answerInvite, FUND_INVITES_PER_DAY } from "./discovery"
import { inbound } from "./requests"
import { setPrefs } from "./talks"

let db: PGlite
const sent: Array<{ to: string; subject: string; text: string }> = []
const send = async (m: { to: string; subject: string; text: string }) => { sent.push(m) }
const one = async (q: string, v: unknown[] = []) => (await db.query<any>(q, v)).rows[0]
const all = async (q: string, v: unknown[] = []) => (await db.query<any>(q, v)).rows
const FUND_SNAPSHOT = { name: "Alpha Climate", status: "fundraising", sectors: ["climate"], stages: ["seed"], geographies: ["Europe"], strategy: "Backs climate founders.", whoMayInvest: "Professional investors from DE.", minCommitment: 100000, termYears: 10 }
const setFlag = (on: boolean) => db.query("UPDATE platform_flags SET enabled = $1 WHERE key = 'investor_discoverability'", [on])
let E1: string, E2: string, E3: string

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
    CREATE TABLE notifications(id serial PRIMARY KEY, user_id text, org_id text, kind text, severity text DEFAULT 'info', title text, body text, href text, dedupe_key text, read_at timestamptz, created_at timestamptz DEFAULT now());
    CREATE UNIQUE INDEX notifications_dedupe ON notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
  `)
  for (const f of ["2026-10-20-investor-side", "2026-10-20b-investor-talks", "2026-10-20c-investor-bridge", "2026-10-20e-investor-materials", "2026-10-20f-investor-team", "2026-10-20h-investor-discovery"]) await db.exec(readFileSync(`scripts/migrations/${f}.sql`, "utf8"))
})
afterAll(async () => db.close())
beforeEach(async () => {
  sent.length = 0
  await db.exec(`DELETE FROM fund_connect_invites; DELETE FROM investor_entity_events; DELETE FROM investor_entity_members; DELETE FROM relationship_messages; DELETE FROM fund_relationships; DELETE FROM fund_listings; DELETE FROM investor_entities; DELETE FROM investor_profiles; DELETE FROM notifications; DELETE FROM profiles; DELETE FROM memberships; DELETE FROM organizations; DELETE FROM funds;
    UPDATE platform_flags SET enabled = true WHERE key = 'investor_discoverability';
    INSERT INTO funds(id, name, listed_for_lps) VALUES ('fund-1','Alpha',true), ('fund-2','Beta',false);
    INSERT INTO organizations VALUES ('org-1','fund','Alpha Partners','fund-1'), ('org-2','fund','Beta Partners','fund-2');
    INSERT INTO memberships VALUES ('m1','fundowner','org-1','workspace_owner','vc'), ('m2','fundadmin','org-1','admin','vc'), ('m3','otherowner','org-2','workspace_owner','vc');
    INSERT INTO fund_listings (fund_id, snapshot, eligibility) VALUES ('fund-1', '${JSON.stringify(FUND_SNAPSHOT)}', '{"categories":["professional"],"countries":["DE","FR"]}');
    INSERT INTO profiles VALUES ('owner1','o1@example.com','Olga'), ('owner2','o2@example.com','Omar'), ('actor','actor@example.com','Ari'), ('viewer','viewer@example.com','Vic'), ('owner3','o3@example.com','Otto');
    INSERT INTO investor_profiles (user_id, display_name, terms_version, terms_accepted_at) SELECT id, full_name, '2026-10', now() FROM profiles;`)
  const mk = async (user: string, name: string, country: string, category: string, interests: object) => String((await db.query<any>("INSERT INTO investor_entities (user_id, legal_name, kind, country, category, interests) VALUES ($1,$2,'individual',$3,$4,$5) RETURNING id", [user, name, country, category, JSON.stringify(interests)])).rows[0].id)
  E1 = await mk("owner1", "Secret Name One", "Germany", "professional", { sectors: ["climate"], stages: ["seed"], geographies: ["Europe"], ticketMin: 100000, ticketMax: 500000, horizonYears: 10 })
  E2 = await mk("owner2", "Secret Name Two", "France", "professional", { sectors: ["fintech"], ticketMax: 300000 })
  E3 = await mk("owner3", "Secret Name Three", "Brazil", "other", { sectors: ["climate"], ticketMax: 300000 })    // ineligible for fund-1's rules
  await db.query("INSERT INTO investor_entity_members (entity_id, user_id, role, added_by) VALUES ($1,'actor','can_act','owner1'), ($1,'viewer','can_view','owner1')", [E1])
})

describe("the investor's switch", () => {
  it("is off to begin with, only the owner can change it, and the platform flag gates turning it on", async () => {
    expect(await discoverableState("owner1", E1)).toEqual({ discoverable: false, open: true })
    await expect(setDiscoverable("actor", E1, true)).rejects.toMatchObject({ code: "owner_only" })
    await setFlag(false)
    await expect(setDiscoverable("owner1", E1, true)).rejects.toMatchObject({ code: "closed", status: 403 })
    await setFlag(true)
    expect(await setDiscoverable("owner1", E1, true)).toEqual({ discoverable: true })
    expect((await one("SELECT discoverable, discoverable_at FROM investor_entities WHERE id = $1", [E1])).discoverable_at).not.toBeNull()
    await setFlag(false)
    expect(await setDiscoverable("owner1", E1, false)).toEqual({ discoverable: false })               // switching off always works
    await expect(discoverableState("owner2", E1)).rejects.toMatchObject({ status: 404 })
  })
})

describe("what a fund can find", () => {
  beforeEach(async () => { for (const [u, e] of [["owner1", E1], ["owner2", E2], ["owner3", E3]]) await setDiscoverable(u, e, true) })
  it("returns cards only: no name, address, team or user, no ineligible entity, best fit first", async () => {
    const cards = await searchForFund("fund-1")
    expect(cards.map((c) => c.cardId)).toEqual([E1, E2])
    expect(cards[0].score!).toBeGreaterThan(cards[1].score ?? -1)
    const text = JSON.stringify(cards)
    expect(text).not.toMatch(/Secret Name|owner\d|@example|actor|viewer|Olga|Omar|user_id/)
    expect(cards[0]).toMatchObject({ kind: "individual", country: "Germany", category: "professional", categoryNote: "self-declared by the investor", eligibility: "eligible", invited: false })
  })
  it("is closed while the flag is off, to a fund that is not listed, and an entity switched off disappears at once", async () => {
    await setFlag(false)
    await expect(searchForFund("fund-1")).rejects.toMatchObject({ code: "closed" })
    await setFlag(true)
    await expect(searchForFund("fund-2")).rejects.toMatchObject({ code: "not_listed" })
    await setDiscoverable("owner1", E1, false)
    expect((await searchForFund("fund-1")).map((c) => c.cardId)).toEqual([E2])
  })
  it("leaves out an entity the fund already has a relationship with, or that declined it recently", async () => {
    await db.query("INSERT INTO fund_relationships (fund_id, entity_id, user_id, stage) VALUES ('fund-1', $1, 'owner2', 'interested')", [E2])
    expect((await searchForFund("fund-1")).map((c) => c.cardId)).toEqual([E1])
  })
})

describe("inviting and answering", () => {
  beforeEach(async () => { await setDiscoverable("owner1", E1, true); await setDiscoverable("owner2", E2, true) })
  it("the fund invites with no message; the entity's owner and actors are told with no content, a viewer is not", async () => {
    const { id } = await inviteEntity("fund-1", "fundowner", E1, send)
    expect(sent.map((m) => m.to).sort()).toEqual(["actor@example.com", "o1@example.com"]); expect(sent[0].subject + sent[0].text).not.toMatch(/Alpha|Climate|Secret/)
    expect((await searchForFund("fund-1")).find((c) => c.cardId === E1)?.invited).toBe(true)
    await expect(inviteEntity("fund-1", "fundowner", E1, send)).rejects.toMatchObject({ code: "exists" })
    const mine = await invitesForMe("viewer")
    expect(mine).toEqual([expect.objectContaining({ id, entityName: "Secret Name One", fundName: "Alpha Climate", summary: "Backs climate founders." })])
    expect(await invitesForMe("owner3")).toEqual([])
    expect((await invitesOfFund("fund-1"))[0]).toMatchObject({ id, status: "sent" }); expect(JSON.stringify(await invitesOfFund("fund-1"))).not.toMatch(/Secret Name|o1@/)
  })
  it("accepting starts a conversation in talks, started by the fund, with the stored check, sharing only what was ticked; the fund is told", async () => {
    const { id } = await inviteEntity("fund-1", "fundowner", E1, send)
    await expect(answerInvite("viewer", id, "accept")).rejects.toMatchObject({ code: "view_only" })
    const r = await answerInvite("actor", id, "accept", { name: false, interests: false })
    expect(r.stage).toBe("in_talks")
    const [row] = await inbound("fund-1")
    expect(row).toMatchObject({ stage: "in_talks", eligibility: { status: "eligible" }, contactEmail: "o1@example.com" })
    expect(row.shared.name).toBeUndefined(); expect(row.shared.interests).toBeUndefined(); expect(row.shared.country).toBe("Germany")
    expect((await one("SELECT initiated_by, decided_by FROM fund_relationships")).initiated_by).toBe("fund")
    expect((await one("SELECT status, relationship_id FROM fund_connect_invites")).status).toBe("accepted")
    expect((await all("SELECT user_id FROM notifications WHERE kind = 'investor_request' ORDER BY user_id")).map((n) => n.user_id)).toEqual(["fundadmin", "fundowner"])
    await expect(answerInvite("actor", id, "accept")).rejects.toMatchObject({ status: 404 })                  // answered once
  })
  it("declining tells the fund only that it was not taken forward, and the same fund cannot invite again for 90 days", async () => {
    const { id } = await inviteEntity("fund-1", "fundowner", E1, send)
    await answerInvite("owner1", id, "decline")
    expect((await invitesOfFund("fund-1"))[0].status).toBe("not taken forward")
    expect((await searchForFund("fund-1")).map((c) => c.cardId)).toEqual([E2])
    await expect(inviteEntity("fund-1", "fundowner", E1, send)).rejects.toMatchObject({ status: 404 })
    await db.exec("UPDATE fund_connect_invites SET answered_at = now() - interval '91 days'")
    expect((await searchForFund("fund-1")).map((c) => c.cardId)).toContain(E1)
  })
  it("limits invitations a day, lets the fund withdraw a waiting one, and refuses an entity that already has a relationship", async () => {
    const { id } = await inviteEntity("fund-1", "fundowner", E1, send)
    await withdrawInvite("fund-1", id)
    await expect(withdrawInvite("fund-1", id)).rejects.toMatchObject({ status: 404 })
    await expect(answerInvite("owner1", id, "accept")).rejects.toMatchObject({ status: 404 })
    const second = await inviteEntity("fund-1", "fundowner", E1, send)                                        // can invite again after a withdrawal
    await db.query("INSERT INTO fund_relationships (fund_id, entity_id, user_id, stage) VALUES ('fund-1', $1, 'owner1', 'interested')", [E1])
    await expect(answerInvite("owner1", second.id, "accept")).rejects.toMatchObject({ code: "open" })
    await db.exec("DELETE FROM fund_connect_invites")
    for (let i = 0; i < FUND_INVITES_PER_DAY; i++) await db.query("INSERT INTO fund_connect_invites (fund_id, entity_id, invited_by, status) VALUES ('fund-1', $1, 'x', 'withdrawn')", [E3])
    await expect(inviteEntity("fund-1", "fundowner", E2, send)).rejects.toMatchObject({ code: "cap", status: 429 })
  })
  it("another fund sees and answers nothing, and everything is closed when the flag is off", async () => {
    const { id } = await inviteEntity("fund-1", "fundowner", E1, send)
    expect(await invitesOfFund("fund-2")).toEqual([])
    await expect(withdrawInvite("fund-2", id)).rejects.toMatchObject({ status: 404 })
    await setFlag(false)
    await expect(inviteEntity("fund-1", "fundowner", E2, send)).rejects.toMatchObject({ code: "closed" })
    expect((await one("SELECT discoverable FROM investor_entities WHERE id = $1", [E1])).discoverable).toBe(true)   // the entity's own choice is kept, but nothing can be done with it
  })
  it("the activity log records invitations and answers for the entity's team", async () => {
    const { id } = await inviteEntity("fund-1", "fundowner", E1, send)
    await answerInvite("owner1", id, "decline")
    expect((await all("SELECT action FROM investor_entity_events WHERE entity_id = $1 ORDER BY at", [E1])).map((e) => e.action)).toEqual(expect.arrayContaining(["discoverable_on", "fund_invited", "invitation_declined"]))
    void setPrefs
  })
})
