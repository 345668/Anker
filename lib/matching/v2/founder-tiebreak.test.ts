import { describe, it, expect } from "vitest"
import { startupContext, scoreInvestor, firmFacts, checkCentrality, proximity, tieBreak, TIE_WEIGHTS } from "./founder-scoring"
import { compareRanked, groupByFirm, type Scored } from "./founder-grouping"

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

describe("proximity", () => {
  it("reads the founder's city, then state, in the firm's recorded place", () => {
    expect(proximity("Atlanta, Georgia, USA", ctx)).toBe(1)
    expect(proximity("Atlanta, United States", ctx)).toBeCloseTo(0.7)
    expect(proximity("Savannah, Georgia, USA", ctx)).toBeCloseTo(0.3)
    expect(proximity("New York, United States", ctx)).toBe(0)
    expect(proximity(undefined, ctx)).toBe(0)
  })
  it("is zero when the founder gave only a country, so a whole country is not 'nearby'", () => {
    const us = startupContext({ ...STARTUP, location: "United States" }, false)
    expect(proximity("Atlanta, United States", us)).toBe(0)
    expect(proximity("New York, United States", us)).toBe(0)
  })
  it("matches whole words only", () => {
    expect(proximity("Atlantic City, New Jersey", ctx)).toBe(0)
  })
})

describe("check centrality", () => {
  const ideal = { min: 75_000, max: 750_000 }
  it("prefers a typical check near the one the round wants over one that merely overlaps", () => {
    const near = checkCentrality({ min: 150_000, max: 400_000 }, ideal)
    const wide = checkCentrality({ min: 50_000, max: 5_000_000 }, ideal)
    expect(near).toBeGreaterThan(wide)
    expect(near).toBeGreaterThan(0.8)
  })
  it("treats a missing range as neutral, not as a mismatch", () => {
    expect(checkCentrality(null, ideal)).toBe(0.4)
    expect(checkCentrality({ min: null, max: null }, ideal)).toBe(0.4)
  })
})

describe("tie-break inside a score band", () => {
  it("separates two firms that score the same, by the founder's city", () => {
    const local = firm({ hq_location: "Atlanta, Georgia, USA" })
    const away = firm({ hq_location: "New York, United States" })
    const a = scoreInvestor(local, ctx, 0), b = scoreInvestor(away, ctx, 0)
    expect(a.score).toBe(b.score)
    expect(a.tie).toBeGreaterThan(b.tie)
    expect(a.why).toContain("based in Atlanta")
    expect(b.why).not.toContain("based in")
  })
  it("separates them by recent activity, with 'unknown' in between", () => {
    const recent = tieBreak({ ...firm(), activityRecency: 1 }, ctx, { thesisRaw: 1, sem: null })
    const unknown = tieBreak({ ...firm(), activityRecency: null }, ctx, { thesisRaw: 1, sem: null })
    const stale = tieBreak({ ...firm(), activityRecency: 0 }, ctx, { thesisRaw: 1, sem: null })
    expect(recent).toBeGreaterThan(unknown)
    expect(unknown).toBeGreaterThan(stale)
  })
  it("uses the thesis match beyond the point where the score clamps it", () => {
    const f = firm()
    expect(tieBreak(f, ctx, { thesisRaw: 1.15, sem: null })).toBeGreaterThan(tieBreak(f, ctx, { thesisRaw: 1, sem: null }))
  })
  it("stays in [0, 1] and its weights sum to 1", () => {
    expect(Object.values(TIE_WEIGHTS).reduce((x, y) => x + y, 0)).toBeCloseTo(1)
    for (const t of [tieBreak(firm(), ctx, { thesisRaw: 5, sem: 1 }), tieBreak(firm({ check_size_min: null, check_size_max: null }), ctx, { thesisRaw: -1, sem: 0 })]) {
      expect(t).toBeGreaterThanOrEqual(0)
      expect(t).toBeLessThanOrEqual(1)
    }
  })
})

const scored = (id: string, name: string, score: number, tieValue: number): Scored => ({
  id, kind: "firm", name, type: "VC", location: "", sectors: [], website: null, linkedin: null, score, tier: "champion",
  factors: {} as any, reasons: [], whyMatch: "", tags: [], stage: "identified", segments: [], tieValue,
}) as Scored

describe("ordering", () => {
  it("never lets the tie-break lift a lower score above a higher one", () => {
    expect(compareRanked(scored("1", "Low tie", 100, 0.1), scored("2", "High tie", 99.9, 0.99))).toBeLessThan(0)
  })
  it("orders equal scores by the tie value before the name", () => {
    const list = [scored("1", "Aardvark Capital", 100, 0.3), scored("2", "Zephyr Ventures", 100, 0.8), scored("3", "Middle Fund", 100, 0.5)]
    expect(list.sort(compareRanked).map((f) => f.name)).toEqual(["Zephyr Ventures", "Middle Fund", "Aardvark Capital"])
  })
  it("still falls back to the name when everything else is equal", () => {
    const list = [scored("1", "Beta", 100, 0.5), scored("2", "Alpha", 100, 0.5)]
    expect(list.sort(compareRanked).map((f) => f.name)).toEqual(["Alpha", "Beta"])
  })
  it("carries through firm grouping", () => {
    const r = groupByFirm([scored("1", "Aardvark Capital", 100, 0.2), scored("2", "Zephyr Ventures", 100, 0.9)], [], new Set(["1", "2"]), 40)
    expect(r.groups.map((g) => g.firm.name)).toEqual(["Zephyr Ventures", "Aardvark Capital"])
  })
})
