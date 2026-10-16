import { describe, it, expect, vi, beforeEach } from "vitest"
vi.mock("server-only", () => ({}))
const rows = vi.hoisted(() => ({ v: [] as any[], fail: false }))
vi.mock("@/lib/db", () => ({ sql: async () => { if (rows.fail) throw new Error("no table"); return rows.v } }))
import { costCenterOf, priceCall, ratesFor, resetPriceCache, warmPrices } from "./pricing"
import { costCoverage, unpricedModel, type Snapshot } from "@/lib/ops/alerts/rules"

beforeEach(() => { rows.v = []; rows.fail = false; resetPriceCache() })

describe("priceCall", () => {
  it("prices a call with provider tokens at the catalogue list price (high end of a range) and calls it exact", () => {
    const r = priceCall({ model: "qwen-flash", ok: true, promptTokens: 1_000_000, outputTokens: 1_000_000 })
    expect(r.state).toBe("exact"); expect(r.costUsd).toBeCloseTo(0.25 + 2, 6)
  })
  it("the price table wins over the catalogue and applies without a deploy", async () => {
    rows.v = [{ model: "qwen-flash", price_in: 1, price_out: 2 }]; await warmPrices(true)
    expect(priceCall({ model: "qwen-flash", ok: true, promptTokens: 2_000_000, outputTokens: 500_000 }).costUsd).toBeCloseTo(3, 6)
    expect(ratesFor("mistral-small-latest")).toBeNull()
  })
  it("a model with no price anywhere is 'unpriced', never zero", () => {
    expect(priceCall({ model: "mystery-1", ok: true, promptTokens: 100, outputTokens: 50 })).toEqual({ costUsd: null, state: "unpriced" })
    expect(priceCall({ model: null, ok: true, promptTokens: 100 })).toEqual({ costUsd: null, state: "unpriced" })
  })
  it("no usage from the provider: estimated from text length (4 characters a token) when the model is priced", async () => {
    rows.v = [{ model: "mistral-small-latest", price_in: 0.2, price_out: 0.6 }]; await warmPrices(true)
    const r = priceCall({ model: "mistral-small-latest", ok: true, promptChars: 4000, outputChars: 2000 })
    expect(r.state).toBe("estimated"); expect(r.costUsd).toBeCloseTo((1000 * 0.2 + 500 * 0.6) / 1e6, 9)
    expect(priceCall({ model: "mistral-small-latest", ok: true }).state).toBe("unpriced")
  })
  it("a failed call with no usage, and a disabled or rejected pick, consumed nothing: state 'none'", () => {
    expect(priceCall({ model: "qwen-flash", ok: false }).state).toBe("none")
    expect(priceCall({ model: null, provider: "disabled", ok: false }).state).toBe("none")
    expect(priceCall({ model: null, provider: "rejected", ok: false }).state).toBe("none")
  })
  it("a failed call that did report tokens is still charged (it consumed the prompt)", () => {
    const r = priceCall({ model: "qwen-flash", ok: false, promptTokens: 1000 }); expect(r.state).toBe("exact"); expect(r.costUsd).toBeGreaterThan(0)
  })
  it("a missing price table does not break pricing: the catalogue still applies", async () => {
    rows.fail = true; await warmPrices(true)
    expect(priceCall({ model: "qwen-flash", ok: true, promptTokens: 10, outputTokens: 10 }).state).toBe("exact")
  })
})

describe("cost centre", () => {
  it("is the workspace, else the platform job, else 'unknown' (which an alert can count)", () => {
    expect(costCenterOf("org1", "assistant_chat")).toBe("workspace:org1")
    expect(costCenterOf(null, "ai_rationale")).toBe("platform:ai_rationale")
    expect(costCenterOf(null, null)).toBe("unknown")
  })
})

describe("alert rules", () => {
  const snap = (m: Snapshot["metering"]): Snapshot => ({ now: 0, latest: {}, lastOk: {}, recent: {}, deps: [], metering: m })
  it("cost coverage fires under 95% with enough calls, and stays quiet otherwise", () => {
    expect(costCoverage(snap({ costed: 50, unpriced: 50, unpricedModels: [] }))[0]).toMatchObject({ rule: "cost_coverage", severity: 3, evidence: { coveragePct: 50 } })
    expect(costCoverage(snap({ costed: 97, unpriced: 3, unpricedModels: [] }))).toEqual([])
    expect(costCoverage(snap({ costed: 2, unpriced: 10, unpricedModels: [] }))).toEqual([])
    expect(costCoverage(snap(undefined))).toEqual([])
  })
  it("one finding per unpriced model, naming the model and the count", () => {
    const f = unpricedModel(snap({ costed: 100, unpriced: 3, unpricedModels: [{ model: "glm-9", calls: 3 }] }))
    expect(f).toHaveLength(1); expect(f[0]).toMatchObject({ rule: "unpriced_model", subject: "glm-9", severity: 2 }); expect(f[0].summary).toContain("glm-9")
  })
})
