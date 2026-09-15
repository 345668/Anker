import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { NextRequest } from "next/server"
import { POST as save, GET as list } from "@/app/api/lp/fund-profiles/route"
import { POST as match } from "@/app/api/lp/matching/run-v2/route"
import { cacheSession, getCachedSession } from "./v2/founder-session-cache"
import { authorizedSession } from "./access"

const state = vi.hoisted(() => ({ user: "alice" as string | null, org: "fund-a", query: vi.fn(), run: vi.fn(), persist: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user ? { id: state.user } : null } }) } }) }))
vi.mock("@/lib/org/active", () => ({ resolveActiveMembership: async () => ({ active: { orgId: state.org, persona: "vc" } }) }))
vi.mock("@/lib/db", () => ({ sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => state.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values), { unsafe: (q: string, values: unknown[]) => state.query(q, values) }) }))
vi.mock("@/lib/matching/v2", () => ({ runLpMatchingV2: state.run, saveSessionV2: state.persist }))
let db: PGlite
const migration = readFileSync("scripts/migrations/2026-09-11-matching-profile-contract.sql", "utf8")
const request = (body: unknown) => new NextRequest("http://localhost/api/lp/fund-profiles", { method: "POST", body: JSON.stringify(body) })
beforeAll(async () => {
  db = new PGlite()
  state.query.mockImplementation(async (q, values) => (await db.query(q, values)).rows)
  await db.exec("CREATE TABLE organizations(id text PRIMARY KEY,kind text); CREATE TABLE memberships(user_id text,org_id text,persona text);")
  await db.exec(readFileSync("scripts/create-lp-tables.sql", "utf8"))
  await db.exec(readFileSync("scripts/migrations/2026-04-25-matching-v2.sql", "utf8"))
  await db.exec("INSERT INTO organizations VALUES ('fund-a','fund'),('fund-b','fund'); INSERT INTO memberships VALUES ('alice','fund-a','vc'),('bob','fund-b','vc');")
  await db.exec(migration)
  await db.exec(migration) // Migration must be safely repeatable.
})
afterAll(async () => db.close())
beforeEach(() => { state.user = "alice"; state.org = "fund-a"; state.run.mockReset(); state.persist.mockReset() })

it("requires authentication and does not run on incomplete profiles", async () => {
  state.user = null
  expect((await list()).status).toBe(401)
  expect((await save(request({ name: "Draft" }))).status).toBe(401)
  state.user = "alice"
  const response = await save(request({ name: "Draft" }))
  expect(response.status).toBe(200)
  const { profile } = await response.json()
  const result = await match(request({ fundProfileId: profile.id }))
  expect(result.status).toBe(422)
  expect((await result.json()).missingFields.map((i: any) => i.field)).toContain("geographicFocus")
  expect(state.run).not.toHaveBeenCalled()
})

it("roundtrips all matching inputs and passes the saved canonical profile to the engine", async () => {
  const response = await save(request({ name: "Climate II", targetRaise: 5000000000, sectors: ["climate"], geographicFocus: ["Germany"], headquartersLocation: "Berlin", thesisKeywords: ["energy"], averageTicket: 1000000, fundNumber: 2 }))
  expect(response.status).toBe(200)
  const { profile } = await response.json()
  expect(profile.targetRaise).toBe(5000000000)
  state.run.mockResolvedValue({ sessionId: "result", totals: {}, tierCounts: {}, segmentCounts: {}, funnel: {} })
  expect((await match(request({ fundProfileId: profile.id, enableAi: false }))).status).toBe(200)
  expect(state.run.mock.calls[0][0]).toMatchObject({ headquartersLocation: "Berlin", geographicFocus: ["Germany"], thesisKeywords: ["energy"], sectors: ["climate"], averageTicket: 1000000, fundNumber: 2 })
  expect(state.persist).toHaveBeenCalledWith(expect.anything(), "alice")
  state.org = "fund-b"
  expect((await match(request({ fundProfileId: profile.id }))).status).toBe(404)
  expect((await save(request({ ...profile, name: "Wrong workspace" }))).status).toBe(404)
  expect((await (await list()).json()).profiles).toHaveLength(0)
  state.org = "fund-a"; state.user = "bob"
  expect((await save(request({ ...profile, name: "Wrong user" }))).status).toBe(404)
})

it("persists founder exports across calls and isolates user, workspace and expiration", async () => {
  const scope = { userId: "alice", orgId: "fund-a" }
  await cacheSession({ sessionId: "founder-result" } as any, { name: "Company" } as any, scope)
  expect(await getCachedSession("founder-result", scope)).toMatchObject({ startup: { name: "Company" } })
  expect(await getCachedSession("founder-result", { ...scope, userId: "bob" })).toBeNull()
  expect(await getCachedSession("founder-result", { ...scope, orgId: "fund-b" })).toBeNull()
  await db.exec("UPDATE founder_match_sessions SET expires_at=now()-interval '1 second'")
  expect(await getCachedSession("founder-result", scope)).toBeNull()
})

it("does not expose partial LP results", async () => {
  const { profile } = await (await save(request({ name: "Partial" }))).json()
  await db.query("INSERT INTO lp_match_sessions(id,fund_profile_id,user_id,status) VALUES ('partial',$1,'alice','running')", [profile.id])
  await expect(authorizedSession("partial")).rejects.toMatchObject({ status: 404 })
})

it("migrates legacy fund_name schemas and satisfies legacy NOT NULL constraints on new saves", async () => {
  const legacy = new PGlite()
  try {
    await legacy.exec("CREATE TABLE organizations(id text PRIMARY KEY,kind text); CREATE TABLE memberships(user_id text,org_id text,persona text); CREATE TABLE lp_match_sessions(id text); CREATE TABLE fund_profiles(id text PRIMARY KEY, user_id text, fund_name text NOT NULL, target_fund_size numeric, target_sectors jsonb, target_geographies jsonb); INSERT INTO fund_profiles VALUES ('legacy','owner','Old Fund',5000000,'[\"climate\"]','[\"Germany\"]');")
    await legacy.exec(migration)
    const row = (await legacy.query("SELECT name,target_raise,sectors FROM fund_profiles WHERE id='legacy'")).rows[0]
    expect(row).toMatchObject({ name: "Old Fund", sectors: ["climate"] })
    await legacy.exec("INSERT INTO fund_profiles(id,name) VALUES ('new','New Fund')")
    expect((await legacy.query("SELECT fund_name FROM fund_profiles WHERE id='new'")).rows[0]).toEqual({ fund_name: "New Fund" })
  } finally { await legacy.close() }
})
