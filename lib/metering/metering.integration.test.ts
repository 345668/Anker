import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
const st = vi.hoisted(() => ({ q: null as any, org: null as string | null, fail: false }))
vi.mock("@/lib/db", () => { const f: any = (s: TemplateStringsArray, ...v: unknown[]) => { if (st.fail) throw new Error("db down"); return st.q(s.reduce((q, t, i) => q + (i ? `$${i}` : "") + t, ""), v) }; return { sql: f } })
vi.mock("@/lib/assistant/context", () => ({ currentAiContext: () => (st.org ? { principal: { orgId: st.org } } : null) }))
import { meter, resetUnitPriceCache, guessAudioSeconds, guessTokens } from "./index"

let db: PGlite
const rows = async () => (await db.query("SELECT * FROM usage_events ORDER BY id")).rows as any[]
beforeAll(async () => { db = new PGlite(); st.q = async (q: string, v: unknown[] = []) => (await db.query(q, v)).rows; await db.exec(readFileSync("scripts/migrations/2026-10-16o-metering-m2.sql", "utf8")) }, 30000)
afterAll(async () => db.close())
beforeEach(async () => { await db.exec("DELETE FROM usage_events"); await db.exec("UPDATE unit_prices SET price_usd = 0.00003 WHERE unit = 'asr_second'"); st.org = null; st.fail = false; resetUnitPriceCache() })

describe("meter", () => {
  it("costs a quantity at the unit's list price and records who pays", async () => {
    await meter({ unit: "asr_second", qty: 100, source: "telegram-voice", owner: "o1", ref: "u-1" })
    const [r] = await rows(); expect(r).toMatchObject({ org_id: "o1", cost_center: "workspace:o1", unit: "asr_second", cost_state: "exact", source: "telegram-voice", ref: "u-1" })
    expect(Number(r.qty)).toBe(100); expect(Number(r.cost_usd)).toBeCloseTo(0.003, 9)
  })
  it("takes the workspace from the running request when no owner is given, and calls a job with none a platform job", async () => {
    st.org = "o9"; await meter({ unit: "tts_char", qty: 500, source: "studio-speech" })
    st.org = null; await meter({ unit: "embed_token", qty: 1000, source: "embeddings", estimated: true })
    const r = await rows(); expect(r[0].cost_center).toBe("workspace:o9"); expect(r[1]).toMatchObject({ org_id: null, cost_center: "platform:embeddings", cost_state: "estimated" })
  })
  it("an explicit null owner is a platform job even inside a request", async () => {
    st.org = "o9"; await meter({ unit: "image", qty: 1, source: "studio", owner: null }); expect((await rows())[0].cost_center).toBe("platform:studio")
  })
  it("a unit with no price is 'unpriced', never zero; the price table drives the cost", async () => {
    await db.exec("DELETE FROM unit_prices WHERE unit = 'vision_page'"); resetUnitPriceCache()
    await meter({ unit: "vision_page", qty: 3, source: "pdf-ocr", owner: "o1" })
    expect((await rows())[0]).toMatchObject({ cost_state: "unpriced", cost_usd: null })
    await db.exec("UPDATE unit_prices SET price_usd = 0.001 WHERE unit = 'asr_second'"); resetUnitPriceCache()
    await meter({ unit: "asr_second", qty: 10, source: "t", owner: "o1" }); expect(Number((await rows())[1].cost_usd)).toBeCloseTo(0.01, 9)
  })
  it("a zero, negative or invalid quantity records nothing", async () => {
    for (const q of [0, -5, NaN]) await meter({ unit: "image", qty: q, source: "x", owner: "o1" })
    expect(await rows()).toHaveLength(0)
  })
  it("never throws, even when the database is down", async () => {
    st.fail = true; const err = vi.spyOn(console, "error").mockImplementation(() => {})
    await expect(meter({ unit: "image", qty: 1, source: "x", owner: "o1" })).resolves.toBeUndefined(); err.mockRestore()
  })
  it("size guesses are plain arithmetic", () => { expect(guessAudioSeconds(120_000)).toBe(10); expect(guessAudioSeconds(1)).toBe(1); expect(guessTokens(401)).toBe(101) })
})
