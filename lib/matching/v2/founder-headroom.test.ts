import { describe, it, expect } from "vitest"
import { startupContext, scoreInvestor, firmFacts, stageCommitment, checkDepth, placeDepth, leadDepth, HEADROOM } from "./founder-scoring"
import { tierFor } from "./types"

const STARTUP = {
  id: "s", name: "Acme Care", stage: "pre-seed", location: "Atlanta, Georgia", askAmount: 1_500_000,
  sectors: ["healthcare", "healthtech", "ai"], primarySector: "healthcare",
  preMoneyValuation: null, checkSizeIdealMin: null, checkSizeIdealMax: null, thesisKeywords: [],
} as any
const ctx = startupContext(STARTUP, false)
const firm = (over: Record<string, unknown> = {}) => firmFacts({
  id: "f", name: "F", firm_classification: "Venture Capital", description: "We back founders.", sectors: ["Healthcare"],
  stages: ["Pre-Seed", "Seed"], hq_location: "New York, United States", check_size_min: 250_000, check_size_max: 1_000_000,
  portfolio_count: 40, ...over,
})
const score = (over: Record<string, unknown> = {}) => scoreInvestor(firm(over), ctx, 0).score

describe("headroom: firms that all fit no longer tie at the top", () => {
  it("a stage specialist outscores a firm that lists every stage", () => {
    expect(score({ stages: ["Pre-Seed"] })).toBeGreaterThan(score({ stages: ["Pre-Seed", "Seed", "Series A", "Series B", "Growth"] }))
  })
  it("a check range centred on the lead band outscores one that merely overlaps the ideal", () => {
    // both overlap the ideal band; the second only reaches the bottom edge of the lead band
    expect(score({ check_size_min: 375_000, check_size_max: 1_500_000 })).toBeGreaterThan(score({ check_size_min: 25_000, check_size_max: 400_000 }))
  })
  it("the founder's city outscores the same country elsewhere, and both stay in the right country band", () => {
    expect(score({ hq_location: "Atlanta, Georgia, USA" })).toBeGreaterThan(score({ hq_location: "Savannah, Georgia, USA" }))
    expect(score({ hq_location: "Savannah, Georgia, USA" })).toBeGreaterThan(score({ hq_location: "New York, United States" }))
  })
  it("a check that could carry the round outscores one that is just big enough to lead", () => {
    expect(score({ check_size_min: 500_000, check_size_max: 1_500_000 })).toBeGreaterThan(score({ check_size_min: 100_000, check_size_max: 400_000 }))
  })
  it("75 near-identical Champions do not all land on one score", () => {
    const locs = ["Atlanta, Georgia, USA", "Savannah, Georgia, USA", "New York, United States", "San Francisco, United States", "Chicago, United States"]
    const stages = [["Pre-Seed"], ["Pre-Seed", "Seed"], ["Pre-Seed", "Seed", "Series A"], ["Pre-Seed", "Seed", "Series A", "Series B", "Growth"]]
    const checks = [[250_000, 1_500_000], [500_000, 2_000_000], [100_000, 500_000]]
    const scores = new Set<number>()
    for (const l of locs) for (const st of stages) for (const c of checks) scores.add(score({ hq_location: l, stages: st, check_size_min: c[0], check_size_max: c[1] }))
    expect(scores.size).toBeGreaterThan(15)
    expect(Math.max(...scores)).toBeLessThan(100)         // a 100 means every component at its best
    expect(Math.max(...scores) - Math.min(...scores)).toBeGreaterThan(5)
  })
  it("still a Champion: headroom spreads the top, it does not demote a strong match", () => {
    const worst = scoreInvestor(firm({ stages: ["Pre-Seed", "Seed", "Series A", "Series B", "Growth"], hq_location: "New York, United States", check_size_min: 100_000, check_size_max: 400_000 }), ctx, 0)
    expect(worst.tier).toBe("champion")
    expect(tierFor(worst.score)).toBe("champion")
  })
})

describe("headroom never lifts or touches a component below 1.0", () => {
  it("leaves an adjacent stage, a missing check and a foreign country exactly as before", () => {
    const adj = scoreInvestor(firm({ stages: ["Seed"] }), ctx, 0)
    expect(adj.components.stage.value).toBe(0.5)
    expect(adj.components.stage.points).toBeCloseTo(0.5 * 20)
    const none = scoreInvestor(firm({ check_size_min: null, check_size_max: null }), ctx, 0)
    expect(none.components.checkSize.points).toBeCloseTo(0.4 * 15)
    const nl = scoreInvestor(firm({ hq_location: "Amsterdam, Netherlands" }), ctx, 0)
    expect(nl.components.geography.points).toBeCloseTo(0.2 * 12)
  })
  it("the raw component values and gates are unchanged", () => {
    const r = scoreInvestor(firm({ stages: ["Pre-Seed", "Seed", "Series A", "Series B", "Growth"] }), ctx, 0)
    expect(r.components.stage.value).toBe(1)
    expect(r.gates).toEqual([])
  })
})

describe("the helpers", () => {
  it("stage commitment runs from 1.0 for one stage down to the floor", () => {
    expect(stageCommitment(["pre-seed"])).toBe(1)
    expect(stageCommitment(["pre-seed", "seed"])).toBeLessThan(1)
    expect(stageCommitment(["pre-seed", "seed", "series-a", "series-b", "growth", "late-stage", "series-c"])).toBeGreaterThanOrEqual(HEADROOM.stage)
  })
  it("place depth is neutral when the founder gave only a country", () => {
    const us = startupContext({ ...STARTUP, location: "United States" }, false)
    expect(placeDepth("New York, United States", us)).toBe(1)
    expect(placeDepth("Atlanta, Georgia, USA", ctx)).toBe(1)
    expect(placeDepth("New York, United States", ctx)).toBe(HEADROOM.place)
  })
  it("check and lead depth stay within their floors", () => {
    const f = firm()
    expect(checkDepth(f.check, ctx)).toBeGreaterThanOrEqual(HEADROOM.check)
    expect(checkDepth(f.check, ctx)).toBeLessThanOrEqual(1)
    expect(leadDepth(f, ctx.ask)).toBeGreaterThanOrEqual(HEADROOM.lead)
    expect(leadDepth(f, ctx.ask)).toBeLessThanOrEqual(1)
  })
})
