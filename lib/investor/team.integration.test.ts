import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const state = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => state.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values), { unsafe: (q: string, values: unknown[]) => state.query(q, values) }) }))

import { teamOf, invite, revokeInvite, removeMember, changeRole, leave, myInvitations, answerInvitation, dashboardOf, TEAM_MAX, INVITES_OPEN_MAX } from "./team"
import { listEntities, getEntity, updateEntity, archiveEntity, entityIdsFor } from "./profile"
import { myRequests, requestToConnect, withdraw, inbound } from "./requests"
import { readThread, sendMessage } from "./talks"
import { acceptNda } from "./materials"

let db: PGlite
const sent: Array<{ to: string; subject: string; text: string }> = []
const send = async (m: { to: string; subject: string; text: string }) => { sent.push(m) }
const one = async (q: string, v: unknown[] = []) => (await db.query<any>(q, v)).rows[0]
let E: string
const join = async (user: string, role = "can_act") => {
  await invite("owner", E, { email: `${user}@example.com`, role }, send)
  await answerInvitation(user, `${user}@example.com`, true, (await myInvitations(`${user}@example.com`, true))[0].id, "accept")
}

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
    CREATE TABLE notifications(id serial PRIMARY KEY, user_id text, org_id text, kind text, severity text DEFAULT 'info', title text, body text, href text, dedupe_key text, read_at timestamptz, created_at timestamptz DEFAULT now());
    CREATE UNIQUE INDEX notifications_dedupe ON notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
    CREATE TABLE data_room_documents(id text PRIMARY KEY, fund_id text, fund_lp_id text, title text, category text, file_url text, file_name text, byte_size bigint, archived_at timestamptz, created_at timestamptz DEFAULT now());
    CREATE TABLE data_room_document_views(id text PRIMARY KEY DEFAULT gen_random_uuid()::text, document_id text NOT NULL, fund_id text, fund_lp_id text, viewer_email text, is_lp boolean DEFAULT false, viewed_at timestamptz DEFAULT now());
    CREATE TABLE fund_profiles(id text PRIMARY KEY, org_id text);
  `)
  for (const f of ["2026-10-20-investor-side", "2026-10-20b-investor-talks", "2026-10-20c-investor-bridge", "2026-10-20e-investor-materials", "2026-10-20f-investor-team", "2026-10-20i-message-attachments"]) await db.exec(readFileSync(`scripts/migrations/${f}.sql`, "utf8").replace("INSERT INTO platform_flags", "-- INSERT INTO platform_flags"))
})
afterAll(async () => db.close())
beforeEach(async () => {
  sent.length = 0
  await db.exec(`DELETE FROM investor_entity_events; DELETE FROM investor_entity_invites; DELETE FROM investor_entity_members; DELETE FROM relationship_messages; DELETE FROM fund_relationships; DELETE FROM fund_listings; DELETE FROM investor_entities; DELETE FROM investor_profiles; DELETE FROM notifications; DELETE FROM profiles; DELETE FROM memberships; DELETE FROM organizations; DELETE FROM funds;
    INSERT INTO funds(id, name, listed_for_lps) VALUES ('fund-1','Alpha',true);
    INSERT INTO organizations VALUES ('org-1','fund','Alpha Partners','fund-1');
    INSERT INTO memberships VALUES ('m1','fundowner','org-1','workspace_owner','vc');
    INSERT INTO fund_listings (fund_id, snapshot, eligibility) VALUES ('fund-1', '{"name":"Alpha","status":"fundraising","sectors":[],"stages":[],"geographies":[]}', '{}');
    INSERT INTO profiles VALUES ('owner','owner@example.com','Olga'), ('actor','actor@example.com','Ari'), ('viewer','viewer@example.com','Vic'), ('stranger','stranger@example.com','Sam');
    INSERT INTO investor_profiles (user_id, display_name, terms_version, terms_accepted_at) VALUES ('owner','Olga','2026-10',now()), ('actor','Ari','2026-10',now()), ('viewer','Vic','2026-10',now()), ('stranger','Sam','2026-10',now());`)
  E = String((await db.query<any>("INSERT INTO investor_entities (user_id, legal_name, kind, country, category) VALUES ('owner','Olga Family Trust','trust','Germany','professional') RETURNING id")).rows[0].id)
})

describe("joining a team", () => {
  it("the owner invites by email, the invited person alone accepts with the confirmed matching address, once", async () => {
    await invite("owner", E, { email: "Actor@Example.com", role: "can_act" }, send)
    expect(sent).toHaveLength(1); expect(sent[0].to).toBe("actor@example.com"); expect(sent[0].subject + sent[0].text).not.toMatch(/Trust|Olga|Germany/)
    expect(await myInvitations("stranger@example.com", true)).toEqual([])
    expect(await myInvitations("actor@example.com", false)).toEqual([])                                 // not a confirmed address
    const [inv] = await myInvitations("actor@example.com", true)
    expect(inv).toMatchObject({ entityName: "Olga Family Trust", role: "can_act", from: "Olga" })
    await expect(answerInvitation("stranger", "stranger@example.com", true, inv.id, "accept")).rejects.toMatchObject({ status: 404 })
    await answerInvitation("actor", "actor@example.com", true, inv.id, "accept")
    expect((await listEntities("actor")).map((e) => [e.legalName, e.role])).toEqual([["Olga Family Trust", "can_act"]].map((x) => x).concat([["Ari", "owner"]] as any).slice(0, 1))
    await expect(answerInvitation("actor", "actor@example.com", true, inv.id, "accept")).rejects.toMatchObject({ status: 404 })
  })
  it("only the owner invites; not themselves; not twice; with limits; an invitation can be revoked, declined or expire", async () => {
    await join("actor")
    await expect(invite("actor", E, { email: "x@example.com", role: "can_view" }, send)).rejects.toMatchObject({ code: "owner_only" })
    await expect(invite("owner", E, { email: "owner@example.com", role: "can_view" }, send)).rejects.toMatchObject({ code: "self" })
    await expect(invite("owner", E, { email: "actor@example.com", role: "can_view" }, send)).rejects.toMatchObject({ code: "member" })
    await expect(invite("owner", E, { email: "nope", role: "can_view" }, send)).rejects.toThrow(/valid email/)
    await expect(invite("owner", E, { email: "v@example.com", role: "boss" }, send)).rejects.toThrow(/role/)
    await invite("owner", E, { email: "viewer@example.com", role: "can_view" }, send)
    await expect(invite("owner", E, { email: "viewer@example.com", role: "can_view" }, send)).rejects.toMatchObject({ code: "pending" })
    const [i] = await myInvitations("viewer@example.com", true)
    await revokeInvite("owner", E, i.id)
    expect(await myInvitations("viewer@example.com", true)).toEqual([])
    await invite("owner", E, { email: "viewer@example.com", role: "can_view" }, send)                   // can be invited again after a revoke
    await db.exec("UPDATE investor_entity_invites SET expires_at = now() - interval '1 minute' WHERE accepted_at IS NULL AND revoked_at IS NULL")
    expect(await myInvitations("viewer@example.com", true)).toEqual([])
    await invite("owner", E, { email: "viewer@example.com", role: "can_view" }, send)
    await answerInvitation("viewer", "viewer@example.com", true, (await myInvitations("viewer@example.com", true))[0].id, "decline")
    expect(await listEntities("viewer")).toHaveLength(0)
  })
  it("limits the open invitations and the size of the team", async () => {
    for (let i = 0; i < INVITES_OPEN_MAX; i++) await invite("owner", E, { email: `p${i}@example.com`, role: "can_view" }, send)
    await expect(invite("owner", E, { email: "late@example.com", role: "can_view" }, send)).rejects.toMatchObject({ code: "limit", status: 429 })
    expect(TEAM_MAX).toBe(10)
  })
})

describe("what each role may do", () => {
  async function withRequest() {
    await join("actor", "can_act"); await join("viewer", "can_view")
    const { id } = await requestToConnect("actor", { entityId: E, fundId: "fund-1" })       // a person who can act asks on the entity's behalf
    await db.exec("UPDATE fund_relationships SET stage = 'in_talks'")
    return id
  }
  it("the owner and a person who can act ask a fund; a viewer cannot, and is told why; a stranger sees nothing", async () => {
    await join("actor", "can_act"); await join("viewer", "can_view")
    await expect(requestToConnect("viewer", { entityId: E, fundId: "fund-1" })).rejects.toMatchObject({ code: "view_only", status: 403 })
    await expect(requestToConnect("stranger", { entityId: E, fundId: "fund-1" })).rejects.toMatchObject({ code: "not_found" })
    await requestToConnect("actor", { entityId: E, fundId: "fund-1" })
    expect((await myRequests("owner")).map((r) => r.entityName)).toEqual(["Olga Family Trust"])        // the owner sees what the team did
    expect((await myRequests("viewer"))).toHaveLength(1)
    expect(await myRequests("stranger")).toEqual([])
    expect(await entityIdsFor("viewer", "act")).toEqual([]); expect(await entityIdsFor("actor", "act")).toContain(E); expect(await entityIdsFor("actor", "own")).not.toContain(E)
  })
  it("conversation: the owner and the actor write, the viewer reads only, the stranger reaches nothing", async () => {
    const id = await withRequest()
    await sendMessage("investor", { userId: "actor", senderId: "actor" }, id, "From the actor", send)
    await sendMessage("investor", { userId: "owner", senderId: "owner" }, id, "From the owner", send)
    await expect(sendMessage("investor", { userId: "viewer", senderId: "viewer" }, id, "no", send)).rejects.toMatchObject({ code: "view_only" })
    await expect(sendMessage("investor", { userId: "stranger", senderId: "stranger" }, id, "no", send)).rejects.toMatchObject({ status: 404 })
    expect((await readThread("investor", { userId: "viewer" }, id)).messages).toHaveLength(2)
    await expect(readThread("investor", { userId: "stranger" }, id)).rejects.toMatchObject({ status: 404 })
    await expect(withdraw("viewer", id)).rejects.toMatchObject({ status: 404 })
    await withdraw("actor", id)
  })
  it("the NDA is accepted by someone who can act, not by a viewer, and the fund learns nothing about the team", async () => {
    const id = await withRequest()
    await db.exec(`UPDATE fund_listings SET eligibility = '{"ndaRequired":true,"ndaText":"Keep it secret."}'`)
    await expect(acceptNda("viewer", id, null, null)).rejects.toMatchObject({ code: "view_only" })
    expect((await acceptNda("actor", id, null, null)).accepted).toBe(true)
    const [row] = await inbound("fund-1")
    expect(JSON.stringify(row)).not.toMatch(/actor|viewer|Ari|Vic/)
    expect(row.contactEmail).toBe("owner@example.com")                                                  // the contact is the owner's, not whoever clicked
  })
  it("notices reach the owner and the people who can act, not viewers", async () => {
    const id = await withRequest()
    sent.length = 0
    await db.exec("INSERT INTO relationship_messages (relationship_id, fund_id, sender, sender_user_id, body) SELECT id, fund_id, 'fund', 'fundowner', 'hi' FROM fund_relationships")
    const { notifyOther } = await import("./talks")
    await notifyOther("fund", await one("SELECT * FROM fund_relationships WHERE id = $1", [id]), send)
    expect(sent.map((m) => m.to).sort()).toEqual(["actor@example.com", "owner@example.com"])
  })
  it("only the owner edits or archives the entity", async () => {
    await join("actor")
    await expect(updateEntity("actor", E, { legalName: "Hijacked", kind: "trust" })).rejects.toMatchObject({ status: 404 })
    await expect(archiveEntity("actor", E)).rejects.toMatchObject({ status: 404 })
    expect((await updateEntity("owner", E, { legalName: "Olga Trust II", kind: "trust" })).legalName).toBe("Olga Trust II")
  })
})

describe("changes, leaving and removal", () => {
  it("changing a role takes effect at once, and removing someone ends their access", async () => {
    await join("actor", "can_act")
    const { id } = await requestToConnect("actor", { entityId: E, fundId: "fund-1" })
    await db.exec("UPDATE fund_relationships SET stage = 'in_talks'")
    await changeRole("owner", E, "actor", "can_view")
    await expect(sendMessage("investor", { userId: "actor", senderId: "actor" }, id, "now blocked", send)).rejects.toMatchObject({ code: "view_only" })
    await expect(changeRole("actor", E, "actor", "can_act")).rejects.toMatchObject({ code: "owner_only" })
    await removeMember("owner", E, "actor")
    expect(await myRequests("actor")).toEqual([]); expect(await getEntity("actor", E)).toBeNull()
    await expect(readThread("investor", { userId: "actor" }, id)).rejects.toMatchObject({ status: 404 })
    await expect(removeMember("owner", E, "actor")).rejects.toMatchObject({ status: 404 })
  })
  it("a member leaves; the owner cannot", async () => {
    await join("viewer", "can_view")
    await leave("viewer", E)
    expect(await listEntities("viewer")).toHaveLength(0)
    await expect(leave("owner", E)).rejects.toMatchObject({ status: 404 })
  })
})

describe("the dashboard and the record of who did what", () => {
  it("shows the entity, its requests, the team (emails to the owner only) and the activity, attributed to people", async () => {
    await join("actor", "can_act"); await join("viewer", "can_view")
    await requestToConnect("actor", { entityId: E, fundId: "fund-1" })
    const o = await dashboardOf("owner", E), v = await dashboardOf("viewer", E)
    expect(o.entity).toMatchObject({ legalName: "Olga Family Trust", role: "owner" }); expect(v.entity.role).toBe("can_view")
    expect(o.requests).toHaveLength(1); expect(v.requests).toHaveLength(1)
    expect(o.team.members.map((m) => m.email).sort()).toEqual(["actor@example.com", "viewer@example.com"]); expect(v.team.members.every((m) => m.email === null)).toBe(true); expect(v.team.invites).toEqual([])
    expect(o.events.map((e) => [e.by, e.action])).toEqual(expect.arrayContaining([["Ari", "request_sent"], ["Ari", "team_joined"], ["Vic", "team_joined"], ["Olga", "team_invited"]]))
    await expect(dashboardOf("stranger", E)).rejects.toMatchObject({ status: 404 })
    expect((await dashboardOf("owner", E)).requests.every((r) => r.entityId === E)).toBe(true)
  })
})
