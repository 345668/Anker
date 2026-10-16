import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
const st = vi.hoisted(() => ({ q: null as any, limit: null as number | null, used: 0, notes: [] as any[], failEntitlements: false }))
vi.mock("@/lib/db", () => { const f: any = (s: TemplateStringsArray, ...v: unknown[]) => st.q(s.reduce((q, t, i) => q + (i ? `$${i}` : "") + t, ""), v); return { sql: f } })
vi.mock("@/lib/assistant/context", () => ({ currentAiContext: () => null }))
vi.mock("@/lib/entitlements", () => {
  class EntitlementRefusal extends Error { constructor(readonly code: string, m: string) { super(m) } }
  return {
    EntitlementRefusal,
    getEffective: async () => { if (st.failEntitlements) throw new Error("down"); return { limits: { ai_spend_usd_month: st.limit } } },
    usageThisMonth: async () => ({ aiSpendUsd: st.used, intakeSubmissions: 0 }),
  }
})
vi.mock("@/lib/notifications/store", () => ({ createNotification: async (n: any) => { st.notes.push(n); return { created: true } } }))
import { allowanceOf, assertCan, estimateUsd, usageByArea, whyNot } from "./allowance"
import { sweepAllowanceWarnings } from "./warnings"
import { resetUnitPriceCache } from "./index"

let db: PGlite
const rows = async (q: string, p: unknown[] = []) => (await db.query(q, p)).rows as any[]
beforeAll(async () => {
  db = new PGlite(); st.q = async (q: string, v: unknown[] = []) => (await db.query(q, v)).rows
  await db.exec(`CREATE TABLE ai_calls (id serial PRIMARY KEY, created_at timestamptz DEFAULT now(), task text, workspace_id text, cost_usd numeric);
    CREATE TABLE memberships (id serial PRIMARY KEY, user_id text, org_id text, org_role text);`)
  for (const f of ["2026-10-16o-metering-m2", "2026-10-16q-metering-m3"]) await db.exec(readFileSync(`scripts/migrations/${f}.sql`, "utf8"))
}, 30000)
afterAll(async () => db.close())
beforeEach(async () => {
  st.limit = null; st.used = 0; st.notes.length = 0; st.failEntitlements = false; resetUnitPriceCache()
  await db.exec("DELETE FROM ai_calls; DELETE FROM usage_events; DELETE FROM usage_warnings; DELETE FROM memberships; INSERT INTO memberships (user_id, org_id, org_role) VALUES ('boss','o1','workspace_owner'), ('adm','o1','admin'), ('mem','o1','member'); UPDATE unit_prices SET price_usd = 0.00003 WHERE unit = 'asr_second'")
})

describe("the estimate-based check", () => {
  it("estimates a capability as quantity times the unit's list price, and chat as a small flat amount", async () => {
    expect(await estimateUsd("speech_in", 100)).toBeCloseTo(0.003, 9); expect(await estimateUsd("chat")).toBeCloseTo(0.006, 9); expect(await estimateUsd("image", 2)).toBeCloseTo(0.08, 9)
  })
  it("no limit means no refusal", async () => { st.limit = null; st.used = 9999; expect(await whyNot("o1", "video", 100)).toBeNull(); expect(await allowanceOf("o1")).toMatchObject({ limit: null, remaining: null }) })
  it("a job that fits is allowed; one that would overshoot is refused with the reason in words; a used-up allowance pauses everything", async () => {
    st.limit = 10; st.used = 9.95
    expect(await whyNot("o1", "image", 1)).toBeNull()      // 0.04 fits (9.99)
    st.used = 9.97; expect(await whyNot("o1", "image", 1)).toMatch(/more than what is left/)
    st.used = 9.9; expect(await whyNot("o1", "image", 1)).toBeNull()
    st.used = 10; expect(await whyNot("o1", "chat")).toMatch(/used this month's AI allowance/)
    await expect(assertCan("o1", "speech_in", 60)).rejects.toThrow(/used this month/)
  })
  it("work that fits under the limit goes ahead; work that tips over it, or arrives at the limit, does not", async () => {
    st.limit = 1; st.used = 0.99; expect(await whyNot("o1", "chat")).toBeNull(); st.used = 0.995; expect(await whyNot("o1", "chat")).toMatch(/more than what is left/); st.used = 1; expect(await whyNot("o1", "chat")).toMatch(/used this month/)
  })
  it("a failing check never stops the work", async () => { st.limit = 1; st.used = 5; st.failEntitlements = true; expect(await whyNot("o1", "chat")).toBeNull() })
})

describe("the warnings", () => {
  const spend = async (used: number, limit: number) => { st.used = used; st.limit = limit; await db.query("INSERT INTO ai_calls (task, workspace_id, cost_usd) VALUES ('assistant_chat','o1',$1)", [used]) }
  it("nothing below 80%", async () => { await spend(7.9, 10); expect(await sweepAllowanceWarnings()).toMatchObject({ warned: 0 }); expect(st.notes).toHaveLength(0) })
  it("80% warns owners and admins once, with amounts and no content; the same month never warns again", async () => {
    await spend(8.2, 10)
    expect(await sweepAllowanceWarnings()).toMatchObject({ checked: 1, warned: 1 })
    expect(st.notes.map((n) => n.userId).sort()).toEqual(["adm", "boss"]); expect(st.notes[0]).toMatchObject({ kind: "usage_limit", severity: "warning", href: "/dashboard/usage" }); expect(st.notes[0].body).toContain("$8.20 of $10.00")
    await sweepAllowanceWarnings(); expect(st.notes).toHaveLength(2)
  })
  it("100% is a second, urgent warning; both thresholds are recorded once per month", async () => {
    await spend(8.2, 10); await sweepAllowanceWarnings(); st.notes.length = 0
    st.used = 10.4; await sweepAllowanceWarnings()
    expect(st.notes.every((n) => n.severity === "urgent" && /used up/.test(n.title))).toBe(true)
    expect((await rows("SELECT threshold FROM usage_warnings ORDER BY threshold")).map((r) => r.threshold)).toEqual([80, 100])
  })
  it("jumping straight past 100% records both, and a new month warns again", async () => {
    await spend(12, 10); await sweepAllowanceWarnings()
    expect((await rows("SELECT threshold FROM usage_warnings")).length).toBe(2)
    await sweepAllowanceWarnings(new Date(Date.UTC(2099, 0, 5))); expect((await rows("SELECT month FROM usage_warnings")).length).toBe(4)
  })
  it("a workspace without a limit is never warned", async () => { await spend(500, 10); st.limit = null; expect(await sweepAllowanceWarnings()).toMatchObject({ warned: 0 }) })
})

describe("usage by area", () => {
  it("groups this month's chat by task and the metered units, largest first, with amounts and no content", async () => {
    await db.query("INSERT INTO ai_calls (task, workspace_id, cost_usd) VALUES ('assistant_chat','o1',0.5), ('assistant_chat','o1',0.25), ('matchmaking','o1',0.1), ('assistant_chat','o2',9)")
    await db.query("INSERT INTO usage_events (org_id, cost_center, unit, qty, cost_usd, cost_state, source) VALUES ('o1','workspace:o1','asr_second',600,0.018,'exact','t'), ('o2','workspace:o2','asr_second',60,0.002,'exact','t')")
    const a = await usageByArea("o1")
    expect(a.map((x) => x.area)).toEqual(["AI: assistant chat", "AI: matchmaking", "Listening to voice notes"]); expect(a[0]).toMatchObject({ usd: 0.75, detail: "2 calls" }); expect(a[2].detail).toBe("600 seconds")
  })
})
