import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const state = vi.hoisted(() => ({ query: vi.fn(), invite: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => state.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values), { unsafe: (q: string, values: unknown[]) => state.query(q, values) }) }))
// The invitation itself (link, code) is tested with doc 60; here the bridge only has to call it for the right record.
vi.mock("@/lib/portfolio/lp-onboarding", () => ({ inviteLp: (...a: unknown[]) => state.invite(...a) }))

import { inviteToOnboard, syncStages, nextStepFor } from "./bridge"
import { myRequests, inbound } from "./requests"

let db: PGlite
const rel = async (stage = "in_talks", user = "inv-1", kind = "individual") => {
  const e = (await db.query<any>("INSERT INTO investor_entities (user_id, legal_name, kind) VALUES ($1, 'Ann Holding', $2) RETURNING id", [user, kind])).rows[0].id
  return String((await db.query<any>("INSERT INTO fund_relationships (fund_id, entity_id, user_id, stage) VALUES ('fund-1', $1, $2, $3) RETURNING id", [e, user, stage])).rows[0].id)
}
const one = async (q: string, v: unknown[] = []) => (await db.query<any>(q, v)).rows[0]

beforeAll(async () => {
  db = new PGlite()
  state.query.mockImplementation(async (q, values) => (await db.query(q, values)).rows)
  await db.exec(`
    CREATE TABLE organizations(id text PRIMARY KEY, kind text, name text, fund_id text);
    CREATE TABLE memberships(id text PRIMARY KEY, user_id text, org_id text, org_role text, persona text);
    CREATE TABLE funds(id text PRIMARY KEY, name text, listed_for_lps boolean DEFAULT false);
    CREATE TABLE profiles(id text PRIMARY KEY, email text, full_name text);
    CREATE TABLE platform_flags(key text PRIMARY KEY, enabled boolean, rollout_pct int, description text, updated_by text, updated_at timestamptz);
    CREATE TABLE fund_lps (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, fund_id text, lp_name text NOT NULL, lp_type text, status text DEFAULT 'committed', subscription_status text, contact_email text, contact_name text, onboarding_state text NOT NULL DEFAULT 'not_invited', metadata jsonb DEFAULT '{}', created_at timestamptz, updated_at timestamptz);
  `)
  await db.exec(readFileSync("scripts/migrations/2026-10-20-investor-side.sql", "utf8").replace("INSERT INTO platform_flags", "-- INSERT INTO platform_flags"))
  await db.exec(readFileSync("scripts/migrations/2026-10-20b-investor-talks.sql", "utf8"))
  await db.exec(readFileSync("scripts/migrations/2026-10-20c-investor-bridge.sql", "utf8"))
})
afterAll(async () => db.close())
beforeEach(async () => {
  state.invite.mockReset(); state.invite.mockResolvedValue({ sentTo: "a***@example.com", expiresAt: null })
  await db.exec(`DELETE FROM fund_relationships; DELETE FROM fund_lps; DELETE FROM investor_entities; DELETE FROM investor_profiles; DELETE FROM profiles; DELETE FROM funds;
    INSERT INTO funds(id, name) VALUES ('fund-1','Alpha'), ('fund-2','Beta');
    INSERT INTO profiles VALUES ('inv-1','ann@example.com','Ann');
    INSERT INTO investor_profiles (user_id, display_name, terms_version, terms_accepted_at) VALUES ('inv-1','Ann','2026-10',now());`)
})

describe("invite to onboard", () => {
  it("makes exactly one investor record from the entity, moves the stage and sends the doc 60 invitation for that record", async () => {
    const id = await rel("in_talks", "inv-1", "family_office")
    const r = await inviteToOnboard("fund-1", id, "owner-1", "https://app.test")
    expect(r).toMatchObject({ stage: "invited_to_onboard", emailSent: true, sentTo: "a***@example.com" })
    const lp = await one("SELECT * FROM fund_lps")
    expect(lp).toMatchObject({ fund_id: "fund-1", lp_name: "Ann Holding", lp_type: "family_office", contact_email: "ann@example.com", onboarding_state: "not_invited" })
    expect(JSON.stringify(lp.metadata)).not.toMatch(/tax|passport|identity/i)
    expect(await one("SELECT stage, fund_lp_id FROM fund_relationships WHERE id = $1", [id])).toEqual({ stage: "invited_to_onboard", fund_lp_id: lp.id })
    expect(state.invite).toHaveBeenCalledWith(lp.id, "owner-1", "https://app.test")
    await expect(inviteToOnboard("fund-1", id, "owner-1", "https://app.test")).rejects.toMatchObject({ code: "stage", status: 409 })
    expect((await one("SELECT count(*)::int n FROM fund_lps")).n).toBe(1)
  })
  it("only from in_talks, only for the fund's own request, and only with an address", async () => {
    for (const stage of ["interested", "declined", "on_hold"]) { const id = await rel(stage); await expect(inviteToOnboard("fund-1", id, "o", "https://x")).rejects.toMatchObject({ code: "stage" }); await db.exec("DELETE FROM fund_relationships; DELETE FROM investor_entities") }
    const id = await rel("in_talks")
    await expect(inviteToOnboard("fund-2", id, "o", "https://x")).rejects.toMatchObject({ status: 404 })
    await db.exec("UPDATE profiles SET email = NULL")
    await expect(inviteToOnboard("fund-1", id, "o", "https://x")).rejects.toMatchObject({ code: "no_email" })
    expect((await one("SELECT count(*)::int n FROM fund_lps")).n).toBe(0)
  })
  it("a failed email keeps the record and the stage, and says so", async () => {
    state.invite.mockRejectedValue(new Error("Email sending is not configured, so nothing was sent."))
    const id = await rel()
    const r = await inviteToOnboard("fund-1", id, "owner-1", "https://x")
    expect(r).toMatchObject({ emailSent: false, emailError: expect.stringMatching(/not configured/), stage: "invited_to_onboard" })
    expect((await one("SELECT stage FROM fund_relationships WHERE id = $1", [id])).stage).toBe("invited_to_onboard")
    expect((await one("SELECT count(*)::int n FROM fund_lps")).n).toBe(1)
  })
})

describe("the stage follows onboarding", () => {
  it("opened makes it onboarding, countersigned makes it active, and it never goes back or skips for unrelated states", async () => {
    const id = await rel(); await inviteToOnboard("fund-1", id, "o", "https://x")
    const set = (s: string) => db.query("UPDATE fund_lps SET onboarding_state = $1", [s])
    await set("invited"); expect(await syncStages()).toBe(0)
    await set("opened"); expect(await syncStages("fund-2")).toBe(0); expect(await syncStages("fund-1")).toBe(1)
    expect((await one("SELECT stage FROM fund_relationships")).stage).toBe("onboarding")
    await set("terms_accepted"); expect(await syncStages()).toBe(0)
    await set("countersigned"); expect(await syncStages()).toBe(1)
    expect((await one("SELECT stage FROM fund_relationships")).stage).toBe("active")
    expect(await syncStages()).toBe(0)
  })
  it("both sides see it when they list, and the investor is told the next step in words", async () => {
    const id = await rel(); await inviteToOnboard("fund-1", id, "o", "https://x")
    expect((await myRequests("inv-1"))[0]).toMatchObject({ stage: "invited_to_onboard", nextStep: "Waiting for the fund's invitation email." })
    await db.exec("UPDATE fund_lps SET onboarding_state = 'details_confirmed'")
    expect((await myRequests("inv-1"))[0]).toMatchObject({ stage: "onboarding", nextStep: "Accept the terms." })
    await db.exec("UPDATE fund_lps SET onboarding_state = 'countersigned'")
    const [row] = await inbound("fund-1")
    expect(row).toMatchObject({ stage: "active", onboardingState: "countersigned", contactEmail: "ann@example.com" })
    expect((await myRequests("inv-1"))[0].nextStep).toBe("You are an investor in this fund.")
    expect(nextStepFor(null)).toBeNull()
  })
  it("a request that is not invited has no next step", async () => {
    await rel("in_talks")
    expect((await myRequests("inv-1"))[0].nextStep).toBeNull()
  })
})
