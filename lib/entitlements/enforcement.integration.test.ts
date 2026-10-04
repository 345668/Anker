/** Entitlements against a real Postgres (PGlite) with the real migration: resolution, lifecycle, limits, and each enforcement point. */
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
const h = vi.hoisted(() => ({ sql: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: h.sql }))
import { getEffective, assertAllowed, assertWithinLimit, assertSenderMayContact, clearEntitlementCache, isFlagOn, EntitlementRefusal } from "./index"
import { withAiContext } from "@/lib/assistant/context"

let db: PGlite
const set = async (org: string, plan: string | null, features: object = {}, limits: object = {}) =>
  db.query("INSERT INTO tenant_entitlements (org_id, plan, features, limits) VALUES ($1,$2,$3,$4) ON CONFLICT (org_id) DO UPDATE SET plan=$2, features=$3, limits=$4", [org, plan, JSON.stringify(features), JSON.stringify(limits)])
const state = async (org: string, s: string) => { await db.query("INSERT INTO tenant_lifecycle (org_id, state, reason) VALUES ($1,$2,'test') ON CONFLICT (org_id) DO UPDATE SET state=$2", [org, s]); clearEntitlementCache() }
const refused = async (p: Promise<unknown>) => p.then(() => null, (e) => e as EntitlementRefusal)

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE memberships (org_id text, user_id text, org_role text DEFAULT 'workspace_owner');
    CREATE TABLE ai_calls (workspace_id text, cost_usd numeric, created_at timestamptz DEFAULT now());
    CREATE TABLE outreach_messages (user_id text, sent_at timestamptz);
    CREATE TABLE organizations (id text PRIMARY KEY, fund_id text);
    CREATE TABLE intake_submissions (fund_id text, created_at timestamptz DEFAULT now());`)
  await db.exec(readFileSync("scripts/migrations/2026-10-04c-tenant-control.sql", "utf8"))
  h.sql.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => (await db.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values)).rows)
}, 30000)
afterAll(async () => db.close())
beforeEach(async () => {
  await db.exec("DELETE FROM tenant_entitlements; DELETE FROM tenant_lifecycle; DELETE FROM memberships; DELETE FROM ai_calls; DELETE FROM outreach_messages; UPDATE platform_flags SET enabled=false")
  clearEntitlementCache()
})

describe("resolution from the database", () => {
  it("seeds the plan catalogue and an unknown workspace is open", async () => {
    expect(((await db.query("SELECT plan FROM plan_catalog ORDER BY sort")).rows as any[]).map((r) => r.plan)).toEqual(["starter", "pro", "scale", "internal"])
    expect(await getEffective("nobody")).toMatchObject({ open: true, state: "active" })
  })
  it("a plan and its overrides resolve, and changes show after the cache is cleared", async () => {
    await set("o1", "starter", { linkedin: true }, { seats: null })
    const e = await getEffective("o1")
    expect(e.features).toMatchObject({ linkedin: true, intake: false, assistant: true }); expect(e.limits.seats).toBeNull(); expect(e.limits.outreach_sends_day).toBe(50)
  })
  it("fails open when the lookup itself breaks", async () => {
    h.sql.mockRejectedValueOnce(new Error("db down")); clearEntitlementCache()
    expect((await getEffective("o1")).open).toBe(true)
  })
})

describe("lifecycle and modules", () => {
  it("a paused workspace is refused for AI with a 403 and a plain reason, and resumes cleanly", async () => {
    await state("o1", "paused")
    const r = await refused(assertAllowed("o1", "ai")); expect(r).toBeInstanceOf(EntitlementRefusal); expect(r).toMatchObject({ code: "paused", status: 403 }); expect(r!.message).toMatch(/paused/)
    await state("o1", "active"); expect(await refused(assertAllowed("o1", "ai"))).toBeNull()
  })
  it("a module the plan lacks is refused", async () => {
    await set("o1", "starter"); clearEntitlementCache()
    expect(await refused(assertAllowed("o1", "intake", "intake"))).toMatchObject({ code: "module" }); expect(await refused(assertAllowed("o1", "ai", "assistant"))).toBeNull()
  })
  it("maintenance stops AI for everyone, flags roll out per workspace", async () => {
    await db.query("UPDATE platform_flags SET enabled = true WHERE key = 'maintenance'"); clearEntitlementCache()
    expect(await refused(assertAllowed("any", "ai"))).toMatchObject({ code: "maintenance", status: 503 })
    await db.query("INSERT INTO platform_flags (key, enabled, rollout_pct) VALUES ('beta', true, 100) ON CONFLICT (key) DO UPDATE SET enabled = true, rollout_pct = 100"); clearEntitlementCache()
    expect(await isFlagOn("beta", "o1")).toBe(true); expect(await isFlagOn("nope", "o1")).toBe(false)
  })
})

describe("limits", () => {
  it("the monthly AI allowance is measured from ai_calls and enforced when set", async () => {
    await set("o1", null, {}, { ai_spend_usd_month: 5 }); clearEntitlementCache()
    await db.query("INSERT INTO ai_calls (workspace_id, cost_usd) VALUES ('o1', 3), ('o1', 1.5), ('other', 100)")
    expect(await refused(assertWithinLimit("o1", "ai_spend_usd_month"))).toBeNull()
    await db.query("INSERT INTO ai_calls (workspace_id, cost_usd) VALUES ('o1', 0.5)")
    expect(await refused(assertWithinLimit("o1", "ai_spend_usd_month"))).toMatchObject({ code: "limit", status: 402 })
    await db.query("INSERT INTO ai_calls (workspace_id, cost_usd, created_at) VALUES ('o2', 99, now() - interval '40 days')")
    expect(await refused(assertWithinLimit("o2", "ai_spend_usd_month"))).toBeNull()
  })
  it("no limit means unlimited", async () => {
    await db.query("INSERT INTO ai_calls (workspace_id, cost_usd) VALUES ('o1', 9999)"); expect(await refused(assertWithinLimit("o1", "ai_spend_usd_month"))).toBeNull()
  })
})

describe("enforcement points", () => {
  const principal = (orgId: string | null) => ({ userId: "u1", orgId, scopeKey: `org:${orgId}`, persona: "founder", membership: null, lpMemberships: [], readonly: false, allowedTools: null, canWrite: true }) as any
  it("an AI run in a paused workspace never starts, one in an open workspace runs", async () => {
    await state("o1", "paused"); const ran = vi.fn(async () => "ok")
    await expect(withAiContext(principal("o1"), ran)).rejects.toMatchObject({ code: "paused" }); expect(ran).not.toHaveBeenCalled()
    await expect(withAiContext(principal("o2"), ran)).resolves.toBe("ok")
    await expect(withAiContext(principal(null), ran)).resolves.toBe("ok")
  })
  it("a sender is blocked only when every workspace they belong to refuses", async () => {
    await db.query("INSERT INTO memberships (org_id, user_id) VALUES ('a','s1'), ('b','s1'), ('a','s2')")
    await state("a", "paused")
    await expect(assertSenderMayContact("s1")).resolves.toBeUndefined()
    await expect(assertSenderMayContact("s2")).rejects.toMatchObject({ code: "paused" })
    await state("b", "paused"); await expect(assertSenderMayContact("s1")).rejects.toMatchObject({ code: "paused" })
  })
  it("platform senders, strangers and a database failure are not blocked; the daily cap is", async () => {
    await expect(assertSenderMayContact("platform:pitch-us")).resolves.toBeUndefined(); await expect(assertSenderMayContact("nobody")).resolves.toBeUndefined(); await expect(assertSenderMayContact(null)).resolves.toBeUndefined()
    await db.query("INSERT INTO memberships (org_id, user_id) VALUES ('c','s3'), ('c','s4')"); await set("c", "starter"); clearEntitlementCache()
    for (let i = 0; i < 50; i++) await db.query("INSERT INTO outreach_messages (user_id, sent_at) VALUES ('s4', now())")
    await expect(assertSenderMayContact("s3")).rejects.toMatchObject({ code: "limit", status: 402 })
    h.sql.mockRejectedValueOnce(new Error("db down")); await expect(assertSenderMayContact("s3")).resolves.toBeUndefined()
  })
})
