/** The prepaid credit ledger against a real Postgres (PGlite) with the real entitlement tables and the real gate (docs/architecture/58 section 8). */
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
const h = vi.hoisted(() => ({ sql: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: h.sql }))
vi.mock("@/lib/notifications/store", () => ({ createNotification: vi.fn(async () => {}) }))
import { clearEntitlementCache, assertWithinLimit } from "@/lib/entitlements"
import { allowanceOf, assertCan, whyNot, spendAndLimit } from "./allowance"
import { grantCredit, adjustCredit, prepaidOf, capacityBonus, settle, settleAll, expireDue, ledgerOf, monthKey } from "./credits"
import { sweepAllowanceWarnings } from "./warnings"
import { createNotification } from "@/lib/notifications/store"

let db: PGlite
const ORG = "o1", NOW = new Date("2026-10-15T12:00:00Z")
const day = (n: number, from = NOW) => new Date(from.getTime() + n * 86_400_000)
const limit = async (usd: number | null) => { await db.query("INSERT INTO tenant_entitlements (org_id, plan, features, limits) VALUES ($1, NULL, '{}', $2) ON CONFLICT (org_id) DO UPDATE SET limits = $2", [ORG, JSON.stringify(usd === null ? {} : { ai_spend_usd_month: usd })]); clearEntitlementCache() }
const spend = async (usd: number) => { await db.query("INSERT INTO ai_calls (workspace_id, cost_usd, created_at) VALUES ($1, $2, now())", [ORG, usd]) }
const rows = async (q: string, p: unknown[] = []) => (await db.query<any>(q, p)).rows

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE memberships (org_id text, user_id text, org_role text DEFAULT 'workspace_owner');
    CREATE TABLE ai_calls (workspace_id text, cost_usd numeric, created_at timestamptz DEFAULT now());
    CREATE TABLE usage_events (org_id text, cost_usd numeric, created_at timestamptz DEFAULT now());
    CREATE TABLE usage_warnings (org_id text, month date, threshold int, used_usd numeric, limit_usd numeric, UNIQUE (org_id, month, threshold));
    CREATE TABLE organizations (id text PRIMARY KEY, fund_id text); CREATE TABLE intake_submissions (fund_id text, created_at timestamptz DEFAULT now());`)
  await db.exec(readFileSync("scripts/migrations/2026-10-04c-tenant-control.sql", "utf8")); await db.exec(readFileSync("scripts/migrations/2026-10-04d-plan-catalogue.sql", "utf8")); await db.exec(readFileSync("scripts/migrations/2026-11-01-ai-credit-ledger.sql", "utf8"))
  h.sql.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => (await db.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values.map((v) => (v instanceof Date ? v.toISOString() : v)))).rows)
}, 30000)
afterAll(async () => db.close())
beforeEach(async () => { await db.exec("DELETE FROM ai_credit_ledger; DELETE FROM ai_calls; DELETE FROM usage_events; DELETE FROM tenant_entitlements; DELETE FROM usage_warnings; DELETE FROM memberships"); clearEntitlementCache(); vi.mocked(createNotification).mockClear() })

describe("grants and adjustments", () => {
  it("a grant is positive, bounded, needs a reason and a future expiry, and one payment is recorded once however often it is submitted", async () => {
    await expect(grantCredit({ orgId: ORG, amountUsd: 0, source: "pack", reason: "a pack", by: "a" })).rejects.toThrow(/more than \$0/); await expect(grantCredit({ orgId: ORG, amountUsd: 1e9, source: "pack", reason: "a pack", by: "a" })).rejects.toThrow(/at most/)
    await expect(grantCredit({ orgId: ORG, amountUsd: 5, source: "pack", reason: "x", by: "a" })).rejects.toThrow(/reason/); await expect(grantCredit({ orgId: ORG, amountUsd: 5, source: "pack", reason: "a pack", by: "a", expiresAt: new Date(Date.now() - 1000) })).rejects.toThrow(/future/)
    const a = await grantCredit({ orgId: ORG, amountUsd: 25, source: "stripe", ref: "cs_123", reason: "Pack of $25", by: "stripe" }), b = await grantCredit({ orgId: ORG, amountUsd: 25, source: "stripe", ref: "cs_123", reason: "Pack of $25", by: "stripe" })
    expect(b).toEqual({ id: a.id, duplicate: true }); expect((await prepaidOf(ORG)).balanceUsd).toBe(25)
    await grantCredit({ orgId: ORG, amountUsd: 5, source: "manual", reason: "goodwill", by: "a" }); await grantCredit({ orgId: ORG, amountUsd: 5, source: "manual", reason: "goodwill again", by: "a" }); expect((await prepaidOf(ORG)).balanceUsd).toBe(35)   // no ref: each is its own grant
  })
  it("an adjustment is signed and can never take the balance below zero", async () => {
    await grantCredit({ orgId: ORG, amountUsd: 10, source: "manual", reason: "a grant", by: "a" })
    await adjustCredit({ orgId: ORG, amountUsd: -4, reason: "refund of a pack", by: "a" }); expect((await prepaidOf(ORG)).balanceUsd).toBe(6)
    await expect(adjustCredit({ orgId: ORG, amountUsd: -7, reason: "too much", by: "a" })).rejects.toThrow(/below zero/); await expect(adjustCredit({ orgId: ORG, amountUsd: 0, reason: "nothing", by: "a" })).rejects.toThrow(/non-zero/)
    await adjustCredit({ orgId: ORG, amountUsd: 3, reason: "a goodwill top up", by: "a" }); expect((await prepaidOf(ORG)).balanceUsd).toBe(9)
  })
  it("the ledger is readable newest first and one workspace never sees another's", async () => {
    await grantCredit({ orgId: ORG, amountUsd: 10, source: "manual", reason: "my own grant", by: "a" }); await grantCredit({ orgId: "other", amountUsd: 99, source: "manual", reason: "their grant", by: "a" })
    expect((await ledgerOf(ORG)).map((r) => [r.kind, r.amountUsd])).toEqual([["grant", 10]]); expect((await prepaidOf("other")).balanceUsd).toBe(99)
  })
})
describe("the gate", () => {
  it("is exactly the plan's allowance without credit; with credit it also covers the overage; the answer is the same before and after settling", async () => {
    await limit(10); await spend(9.99)
    await expect(assertCan(ORG, "chat")).resolves.toBeUndefined(); await spend(0.5); await expect(assertCan(ORG, "chat")).rejects.toThrow(/used this month's AI allowance/); await expect(assertWithinLimit(ORG, "ai_spend_usd_month")).rejects.toThrow()
    await grantCredit({ orgId: ORG, amountUsd: 5, source: "pack", reason: "a pack", by: "a" })              // 10.49 spent, limit 10, 5 of credit: capacity 15
    await expect(assertCan(ORG, "chat")).resolves.toBeUndefined(); await expect(assertWithinLimit(ORG, "ai_spend_usd_month")).resolves.toBeUndefined()
    const before = await allowanceOf(ORG); expect(before).toMatchObject({ limit: 10, prepaidUsd: 5, capacityUsd: 15 }); expect(before.remaining).toBeCloseTo(4.51, 5)
    const { limit: l, spent } = await spendAndLimit(ORG); const s = await settle(ORG, l, spent, new Date()); expect(s.debited).toBeCloseTo(0.49, 5)
    const after = await allowanceOf(ORG); expect(after.prepaidUsd).toBeCloseTo(4.51, 5); expect(after.capacityUsd).toBeCloseTo(15, 5); expect(after.remaining).toBeCloseTo(4.51, 5)      // settling moved a dollar between columns and changed nothing
    await spend(4.5); await expect(assertCan(ORG, "chat")).resolves.toBeUndefined(); await spend(0.1)
    await expect(assertCan(ORG, "chat")).rejects.toThrow(/used this month's AI allowance/); await expect(assertWithinLimit(ORG, "ai_spend_usd_month")).rejects.toThrow(); expect(await whyNot(ORG, "chat")).toMatch(/paused/)
  })
  it("an unlimited allowance never touches credit, and a workspace with no ledger is untouched", async () => {
    await limit(null); await spend(1000); await grantCredit({ orgId: ORG, amountUsd: 5, source: "pack", reason: "a pack", by: "a" })
    expect(await settle(ORG, null, 1000, new Date())).toEqual({ debited: 0, uncovered: 0 }); expect((await prepaidOf(ORG)).balanceUsd).toBe(5); await expect(assertCan(ORG, "chat")).resolves.toBeUndefined()
    expect((await allowanceOf("nobody")).prepaidUsd).toBe(0)
  })
})
describe("settling and expiry", () => {
  it("takes from the grant that expires soonest first, then the one that never expires; only what has not been taken yet; and repeating changes nothing", async () => {
    const never = await grantCredit({ orgId: ORG, amountUsd: 10, source: "manual", reason: "never expires", by: "a" }), soon = await grantCredit({ orgId: ORG, amountUsd: 3, source: "pack", ref: "p1", reason: "expires soon", by: "a", expiresAt: day(10, new Date()) }), later = await grantCredit({ orgId: ORG, amountUsd: 4, source: "pack", ref: "p2", reason: "expires later", by: "a", expiresAt: day(60, new Date()) })
    const now = new Date(); await settle(ORG, 10, 15, now)                                  // 5 over the limit: 3 from "soon", 2 from "later"
    const debits = (await rows("SELECT grant_id, amount_usd::float AS a FROM ai_credit_ledger WHERE kind = 'debit' ORDER BY id")).map((d: any) => [Number(d.grant_id), d.a]); expect(debits).toEqual([[soon.id, -3], [later.id, -2]])
    expect(await settle(ORG, 10, 15, now)).toEqual({ debited: 0, uncovered: 0 }); expect((await prepaidOf(ORG, now)).balanceUsd).toBe(12); expect((await prepaidOf(ORG, now)).debitedThisMonthUsd).toBe(5)
    await settle(ORG, 10, 20, now); const dd = (await rows("SELECT grant_id, amount_usd::float AS a FROM ai_credit_ledger WHERE kind = 'debit' ORDER BY id")).slice(2).map((r: any) => [Number(r.grant_id), r.a]); expect(dd).toEqual([[later.id, -2], [never.id, -3]])     // 2 left of "later", then 3 of the never-expiring one
  })
  it("overage beyond the credit is reported as uncovered, never invented", async () => {
    await grantCredit({ orgId: ORG, amountUsd: 2, source: "manual", reason: "small", by: "a" }); expect(await settle(ORG, 10, 15, new Date())).toEqual({ debited: 2, uncovered: 3 }); expect((await prepaidOf(ORG)).balanceUsd).toBe(0)
  })
  it("a new month starts clean: the allowance is a fresh limit, last month's debits do not count against the new capacity", async () => {
    await grantCredit({ orgId: ORG, amountUsd: 10, source: "manual", reason: "a grant", by: "a" }); const oct = new Date("2026-10-20T00:00:00Z"), nov = new Date("2026-11-03T00:00:00Z")
    await settle(ORG, 10, 14, oct); expect(monthKey(oct)).toBe("2026-10"); expect((await prepaidOf(ORG, oct))).toEqual({ balanceUsd: 6, debitedThisMonthUsd: 4 })
    expect((await prepaidOf(ORG, nov))).toEqual({ balanceUsd: 6, debitedThisMonthUsd: 0 }); expect(await capacityBonus(ORG, nov)).toBe(6)
    expect((await settle(ORG, 10, 12, nov)).debited).toBe(2); expect((await prepaidOf(ORG, nov)).balanceUsd).toBe(4)
  })
  it("a grant that expires is closed with what was left, once; credit past its date is not usable even before the closing row exists", async () => {
    const g = await grantCredit({ orgId: ORG, amountUsd: 8, source: "pack", ref: "x", reason: "short pack", by: "a", expiresAt: day(5, new Date()) }); await settle(ORG, 10, 12, new Date())      // 2 used
    const later = day(6, new Date()); expect((await prepaidOf(ORG, later)).balanceUsd).toBe(0)                  // expired, not yet closed: already unusable
    expect(await expireDue(later)).toBe(1); expect(await expireDue(later)).toBe(0)
    expect(await rows("SELECT kind, amount_usd::float AS a, grant_id FROM ai_credit_ledger WHERE kind = 'expiry'")).toEqual([{ kind: "expiry", a: -6, grant_id: g.id }])
    const fully = await grantCredit({ orgId: ORG, amountUsd: 1, source: "pack", ref: "y", reason: "all used", by: "a", expiresAt: day(2, new Date()) }); await settle(ORG, 0, 100, new Date()); void fully
    expect(await expireDue(day(3, new Date()))).toBe(0)                                                          // nothing left, so no empty expiry row
  })
  it("settleAll runs expiry then settlement for every workspace that holds credit, and one failing workspace does not stop the rest", async () => {
    await grantCredit({ orgId: "a", amountUsd: 5, source: "manual", reason: "grant a", by: "x" }); await grantCredit({ orgId: "b", amountUsd: 5, source: "manual", reason: "grant b", by: "x" })
    const r = await settleAll(async (o) => { if (o === "a") throw new Error("boom"); return { limit: 10, spent: 12 } }); expect(r).toEqual({ expired: 0, workspaces: 2, debited: 2 }); expect((await prepaidOf("a")).balanceUsd).toBe(5); expect((await prepaidOf("b")).balanceUsd).toBe(3)
  })
})
describe("what the customer is told", () => {
  it("the 100% warning is not sent while credit still covers the overage (nothing is paused), and is sent when it runs out", async () => {
    await db.query("INSERT INTO memberships (org_id, user_id, org_role) VALUES ($1, 'u1', 'workspace_owner')", [ORG]); await limit(10); await spend(10.5)
    await grantCredit({ orgId: ORG, amountUsd: 5, source: "pack", reason: "a pack", by: "a" })
    await sweepAllowanceWarnings(); const titles = () => vi.mocked(createNotification).mock.calls.map((c: any) => c[0].title)
    expect(titles()).toEqual(["80% of this month's AI allowance is used"])
    await spend(5); await sweepAllowanceWarnings(); expect(titles()).toContain("This month's AI allowance is used up")
  })
})

describe("the next expiry", () => {
  it("is the soonest date among the grants that still hold credit, null when nothing expires, and ignores a grant that is used up", async () => {
    const { nextExpiry } = await import("./credits")
    expect(await nextExpiry(ORG)).toBeNull(); await grantCredit({ orgId: ORG, amountUsd: 5, source: "manual", reason: "never expires", by: "a" }); expect(await nextExpiry(ORG)).toBeNull()
    await grantCredit({ orgId: ORG, amountUsd: 2, source: "pack", ref: "a", reason: "expires soon", by: "a", expiresAt: day(3, new Date()) }); await grantCredit({ orgId: ORG, amountUsd: 2, source: "pack", ref: "b", reason: "expires later", by: "a", expiresAt: day(30, new Date()) })
    expect(await nextExpiry(ORG)).toBe(day(3, new Date()).toISOString().slice(0, 10))
    await settle(ORG, 0, 2, new Date())                                     // the "soon" grant is used up
    expect(await nextExpiry(ORG)).toBe(day(30, new Date()).toISOString().slice(0, 10))
  })
})
