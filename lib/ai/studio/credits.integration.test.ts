import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import type { AiPrincipal } from "@/lib/assistant/context"

const state = vi.hoisted(() => ({ query: null as any, allowance: 1000 as number | null | undefined }))
vi.mock("@/lib/db", () => ({
  sql: Object.assign(
    (s: TemplateStringsArray, ...v: unknown[]) =>
      state.query(
        s.reduce((q, p, i) => q + (i ? `$${i}` : "") + p, ""),
        v,
      ),
    { unsafe: (q: string, v: unknown[] = []) => state.query(q, v) },
  ),
}))
vi.mock("@/lib/entitlements", () => ({
  assertAllowed: vi.fn(async () => {}),
  assertWithinLimit: vi.fn(async () => {}),
  getEffective: vi.fn(async () => ({ limits: { ai_studio_daily_credits: state.allowance } })),
}))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/ai/runtime-config", () => ({ readRouterConfig: async () => null }))
vi.mock("./provider", async (orig) => ({
  ...(await orig<typeof import("./provider")>()),
  submitGeneration: vi.fn(async () => "task:abc"),
  generationStatus: vi.fn(),
}))
vi.mock("@vercel/blob", () => ({ put: vi.fn(async () => ({})), get: vi.fn(async () => null) }))
vi.mock("@/lib/net/safe-fetch", () => ({ safeFetch: vi.fn() }))

import { inputSchema, type GenerationInput } from "./catalog"
import { createJob } from "./service"
import { ProviderError, submitGeneration } from "./provider"
import { costOf, DEFAULT_RATES, NoRateError } from "./credit-cost"
import { _resetRateCache, allowanceFor, creditsView, loadRates, nextResetUtc, refundFailed } from "./credits"

let db: PGlite
const me = (userId = "u1", scopeKey = "org:one"): AiPrincipal => ({
  userId,
  scopeKey,
  orgId: scopeKey.slice(4),
  persona: "founder",
  membership: null,
  lpMemberships: [],
  canWrite: true,
  readonly: false,
  allowedTools: null,
})
const img = (extra: Partial<GenerationInput> = {}, scopeKey = "org:one") =>
  inputSchema.parse({
    scopeKey,
    requestKey: randomUUID(),
    model: "qwen-image-2.0",
    prompt: "Cover",
    aspectRatio: "1:1",
    resolution: "standard",
    ...extra,
  })
const grant = (scope: string, n: number) =>
  db.query(
    "INSERT INTO ai_studio_credit_ledger(scope_key,org_id,kind,credits,source,reason,actor) VALUES($1,$2,'grant',$3,'bonus','test','op')",
    [scope, scope.slice(4), n],
  )
const view = (scope = "org:one") => allowanceFor(scope.slice(4)).then((a) => creditsView(scope, a))

beforeAll(async () => {
  db = new PGlite()
  state.query = async (q: string, v: unknown[]) => (await db.query(q, v)).rows
  await db.exec(
    "CREATE TABLE platform_flags (key text PRIMARY KEY, enabled boolean DEFAULT false, rollout_pct int DEFAULT 100, description text)",
  )
  await db.exec("CREATE TABLE plan_catalog (plan text PRIMARY KEY, limits jsonb)")
  for (const f of [
    "2026-10-07b-ai-media-studio",
    "2026-10-09-ai-media-studio-v2",
    "2026-10-10-ai-media-studio-comfy",
    "2026-10-14-ai-studio-credits",
  ])
    await db.exec(readFileSync(`scripts/migrations/${f}.sql`, "utf8"))
}, 30000)
afterAll(() => db.close())
beforeEach(async () => {
  await db.exec(
    "TRUNCATE ai_studio_jobs,ai_studio_assets,ai_studio_scope_locks,ai_studio_credit_ledger CASCADE",
  )
  vi.clearAllMocks()
  vi.mocked(submitGeneration).mockResolvedValue("task:abc")
  vi.stubEnv("DASHSCOPE_API_KEY", "sk-test")
  vi.stubEnv("MEDIA_BLOB_READ_WRITE_TOKEN", "test")
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://anker.example")
  state.allowance = 1000
  _resetRateCache()
})

describe("what things cost", () => {
  it("prices images per job and videos per second at the chosen resolution", () => {
    const r = DEFAULT_RATES
    expect(costOf({ model: "qwen-image-2.0", resolution: "standard" }, r)).toBe(30)
    expect(costOf({ model: "qwen-image-2.0-pro", resolution: "standard" }, r)).toBe(60)
    expect(costOf({ model: "z-image-turbo", resolution: "standard" }, r)).toBe(10)
    expect(costOf({ model: "qwen-image-edit-plus-2025-12-15", resolution: "standard" }, r)).toBe(40)
    expect(costOf({ model: "wan2.7", resolution: "720p", duration: 5 }, r)).toBe(250)
    expect(costOf({ model: "wan2.7", resolution: "720p", duration: 10 }, r)).toBe(500)
    expect(costOf({ model: "wan2.7", resolution: "1080p", duration: 15 }, r)).toBe(1500)
    expect(costOf({ model: "happyhorse-1.1", resolution: "720p", duration: 4 }, r)).toBe(240)
  })
  it("every model the studio offers has a price, and none is ever free", async () => {
    const { MODELS } = await import("./catalog")
    for (const m of MODELS)
      for (const res of m.resolutions) {
        const c = costOf(
          { model: m.id, resolution: res, duration: m.kind === "video" ? m.min : undefined },
          DEFAULT_RATES,
        )
        expect(c, `${m.id} ${res}`).toBeGreaterThan(0)
      }
  })
  it("a model with no rate is refused, not charged zero", () => {
    expect(() => costOf({ model: "mystery-model", resolution: "standard" }, DEFAULT_RATES)).toThrow(
      NoRateError,
    )
  })
  it("the table's active rows override the defaults and an inactive row removes one", async () => {
    await db.query("UPDATE ai_studio_credit_rates SET credits=45 WHERE model='qwen-image-2.0'")
    await db.query("UPDATE ai_studio_credit_rates SET active=false WHERE model='z-image-turbo'")
    try {
      _resetRateCache()
      const r = await loadRates()
      expect(costOf({ model: "qwen-image-2.0", resolution: "standard" }, r)).toBe(45)
      expect(() => costOf({ model: "z-image-turbo", resolution: "standard" }, r)).toThrow(NoRateError)
    } finally {
      await db.query("UPDATE ai_studio_credit_rates SET credits=30 WHERE model='qwen-image-2.0'")
      await db.query("UPDATE ai_studio_credit_rates SET active=true WHERE model='z-image-turbo'")
    }
  })
})

describe("the allowance", () => {
  it("uses the workspace's limit, the platform default when none is set, and unlimited for -1", async () => {
    state.allowance = 2500
    expect(await allowanceFor("one")).toBe(2500)
    state.allowance = null
    expect(await allowanceFor("one")).toBe(1000)
    state.allowance = undefined
    expect(await allowanceFor("one")).toBe(1000)
    state.allowance = -1
    expect(await allowanceFor("one")).toBeNull()
    expect(await allowanceFor(null)).toBe(1000)
  })
  it("resets at 00:00 UTC", () => {
    expect(nextResetUtc(new Date("2026-10-14T15:03:00Z"))).toBe("2026-10-15T00:00:00.000Z")
    expect(nextResetUtc(new Date("2026-12-31T23:59:59Z"))).toBe("2027-01-01T00:00:00.000Z")
  })
})

describe("charging", () => {
  it("charges the cost at reservation and shows the balance", async () => {
    await createJob(me(), img())
    expect(await view()).toMatchObject({
      allowance: 1000,
      usedToday: 30,
      bonus: 0,
      remaining: 970,
      unlimited: false,
    })
  })
  it("a repeated request key is not charged twice", async () => {
    const body = img()
    await createJob(me(), body)
    await createJob(me(), body)
    expect((await view()).usedToday).toBe(30)
    expect(submitGeneration).toHaveBeenCalledTimes(1)
  })
  it("refuses with 402 and says exactly what is missing", async () => {
    state.allowance = 50
    await createJob(me(), img()) // 30 of 50
    const err: any = await createJob(me(), img()).catch((e) => e)
    expect(err.status).toBe(402)
    expect(err.message).toBe(
      "This needs 30 credits and 20 are left today. Credits reset at 00:00 UTC. Ask your administrator for more, or choose a smaller option.",
    )
    expect((await view()).usedToday).toBe(30)
  })
  it("uses the day's allowance first, then bonus credits", async () => {
    state.allowance = 50
    await grant("org:one", 100)
    await createJob(me(), img({ model: "qwen-image-2.0-pro" })) // 60: 50 daily + 10 bonus
    expect(await view()).toMatchObject({ usedToday: 50, bonus: 90, remaining: 90 })
    const rows = (
      await db.query("SELECT source, credits FROM ai_studio_credit_ledger WHERE kind='spend' ORDER BY source")
    ).rows as any[]
    expect(rows).toEqual([
      { source: "bonus", credits: -10 },
      { source: "daily", credits: -50 },
    ])
  })
  it("bonus credits alone can pay when the day's allowance is gone", async () => {
    state.allowance = 0
    await grant("org:one", 100)
    await createJob(me(), img())
    expect(await view()).toMatchObject({ usedToday: 0, bonus: 70 })
    state.allowance = 0
    await expect(createJob(me(), img({ model: "qwen-image-max" }))).rejects.toMatchObject({ status: 402 }) // 80 > 70
  })
  it("yesterday's spending does not count today, and bonus credits do not reset", async () => {
    state.allowance = 100
    await db.query(
      "INSERT INTO ai_studio_credit_ledger(scope_key,org_id,job_id,kind,credits,source,day) VALUES('org:one','one','old','spend',-100,'daily',(now() AT TIME ZONE 'UTC')::date - 1)",
    )
    expect((await view()).usedToday).toBe(0)
    await createJob(me(), img())
    expect((await view()).remaining).toBe(70)
  })
  it("unlimited workspaces are not refused but their spending is still recorded", async () => {
    state.allowance = -1
    await createJob(me(), img({ model: "qwen-image-max" }))
    const v = await view()
    expect(v).toMatchObject({ unlimited: true, allowance: null, remaining: null, usedToday: 80 })
  })
  it("two people cannot spend the same credits at the same moment", async () => {
    state.allowance = 100
    const r = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => createJob(me(`u${i}`), img())))
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(3) // 3 x 30 = 90 of 100
    expect(r.filter((x) => x.status === "rejected" && (x.reason as any).status === 402)).toHaveLength(2)
    expect((await view()).usedToday).toBe(90)
  })
  it("keeps the cap of three running jobs per person, and a backstop of 300 a day", async () => {
    const r = await Promise.allSettled(Array.from({ length: 4 }, () => createJob(me(), img())))
    expect(r.filter((x) => x.status === "rejected" && (x.reason as any).status === 429)).toHaveLength(1)
    await db.exec("TRUNCATE ai_studio_jobs, ai_studio_credit_ledger CASCADE")
    for (let i = 0; i < 300; i++)
      await db.query(
        "INSERT INTO ai_studio_jobs(id,user_id,scope_key,request_key,request_hash,model,kind,prompt,settings,status) VALUES($1,$2,'org:one',$1,'h','qwen-image-2.0','image','p','{}','completed')",
        [randomUUID(), `bulk${i}`],
      )
    const err: any = await createJob(me(), img()).catch((e) => e)
    expect(err.status).toBe(429)
    expect(err.message).toMatch(/safety limit of 300/)
  })
  it("one workspace's spending never reduces another's", async () => {
    await createJob(me(), img())
    expect((await view("org:two")).usedToday).toBe(0)
    await createJob(me("u9", "org:two"), img({}, "org:two"))
    expect((await view("org:one")).usedToday).toBe(30)
  })
})

describe("refunds", () => {
  it("returns the credits of a job the provider refused with certainty, once", async () => {
    vi.mocked(submitGeneration).mockRejectedValueOnce(new ProviderError(422, "Blocked prompt"))
    const j = await createJob(me(), img())
    expect(j.status).toBe("blocked")
    expect((await view()).usedToday).toBe(0)
    expect(await refundFailed(j.id)).toBe(0)
    expect(await refundFailed()).toBe(0)
    expect((await view()).remaining).toBe(1000)
  })
  it("returns bonus credits to the bonus balance", async () => {
    state.allowance = 0
    await grant("org:one", 100)
    vi.mocked(submitGeneration).mockRejectedValueOnce(new ProviderError(400, "Bad request"))
    await createJob(me(), img())
    expect((await view()).bonus).toBe(100)
  })
  it("keeps the charge while a job is uncertain, and returns it if the job later fails", async () => {
    vi.mocked(submitGeneration).mockRejectedValueOnce(new Error("Timeout"))
    const j = await createJob(me(), img())
    expect(j.status).toBe("uncertain")
    expect((await view()).usedToday).toBe(30)
    expect(await refundFailed()).toBe(0)
    await db.query("UPDATE ai_studio_jobs SET status='failed' WHERE id=$1", [j.id])
    expect(await refundFailed()).toBe(1)
    expect(await refundFailed()).toBe(0)
    expect((await view()).usedToday).toBe(0)
  })
  it("never returns the credits of a job that completed", async () => {
    const j = await createJob(me(), img())
    await db.query("UPDATE ai_studio_jobs SET status='completed' WHERE id=$1", [j.id])
    expect(await refundFailed()).toBe(0)
    expect((await view()).usedToday).toBe(30)
  })
  it("a refund counts against the day of the spend, not the day it is made", async () => {
    state.allowance = 100
    const j = await createJob(me(), img())
    await db.query(
      "UPDATE ai_studio_credit_ledger SET day=(now() AT TIME ZONE 'UTC')::date - 1 WHERE job_id=$1",
      [j.id],
    )
    await db.query("UPDATE ai_studio_jobs SET status='failed' WHERE id=$1", [j.id])
    await refundFailed()
    const rows = (
      await db.query("SELECT kind, day::text d FROM ai_studio_credit_ledger WHERE job_id=$1 ORDER BY kind", [
        j.id,
      ])
    ).rows as any[]
    expect(rows[0].d).toBe(rows[1].d)
    expect((await view()).usedToday).toBe(0)
  })
})
