import { describe, it, expect } from "vitest"
import { startupContext, scoreInvestor, firmFacts, checkFit, proximity, tieBreak, TIE_WEIGHTS, LEAD_FIT_MIN } from "./founder-scoring"
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

describe("check band", () => {
  it("is a lead band, a quarter of the round up to the whole round, unless the founder gave their own ideal", () => {
    expect(ctx.checkSweet).toEqual({ min: 375_000, max: 1_500_000 })          // $1.5M round
    const own = startupContext({ ...STARTUP, checkSizeIdealMin: 100_000, checkSizeIdealMax: 400_000 }, false)
    expect(own.checkSweet).toEqual({ min: 100_000, max: 400_000 })
    expect(startupContext({ ...STARTUP, askAmount: 0 }, false).checkSweet).toEqual({ min: 0, max: 0 })
  })
})

describe("check fit", () => {
  const sweet = { min: 375_000, max: 1_500_000 }            // a $1.5M round
  it("ranks the range that spans the lead band first, then ones that cover most of it, then followers", () => {
    const spans = checkFit({ min: 250_000, max: 2_000_000 }, sweet)
    const leadsBig = checkFit({ min: 500_000, max: 2_000_000 }, sweet)
    const follower = checkFit({ min: 50_000, max: 500_000 }, sweet)
    const tooSmall = checkFit({ min: 25_000, max: 150_000 }, sweet)
    const tooBig = checkFit({ min: 5_000_000, max: 10_000_000 }, sweet)
    expect(spans).toBeGreaterThan(leadsBig)
    expect(leadsBig).toBeGreaterThan(follower)
    expect(follower).toBeGreaterThan(tooSmall)
    expect(follower).toBeGreaterThan(tooBig)
  })
  it("does not count touching the band as covering it: an angel at the band's lower edge scores low", () => {
    const edge = { min: 250_000, max: 1_000_000 }
    const angel = checkFit({ min: 25_000, max: 250_000 }, edge)    // reaches $250K at a single point
    const lead = checkFit({ min: 250_000, max: 2_000_000 }, edge)
    expect(angel).toBeLessThanOrEqual(0.3)
    expect(lead).toBeGreaterThan(0.8)
    expect(lead - angel).toBeGreaterThan(0.5)
  })
  it("treats a range that misses the band as at most 0.3, falling with the distance", () => {
    expect(checkFit({ min: 100_000, max: 200_000 }, sweet)).toBeLessThanOrEqual(0.3)
    expect(checkFit({ min: 200_000, max: 300_000 }, sweet)).toBeGreaterThan(checkFit({ min: 20_000, max: 30_000 }, sweet))
    expect(checkFit({ min: 2_000_000, max: 3_000_000 }, sweet)).toBeGreaterThan(checkFit({ min: 20_000_000, max: 30_000_000 }, sweet))
  })
  it("between two ranges that cover the band equally, prefers the one centred on it", () => {
    const centred = checkFit({ min: 300_000, max: 2_000_000 }, sweet)
    const stretched = checkFit({ min: 10_000, max: 200_000_000 }, sweet)
    expect(centred).toBeGreaterThan(stretched)
    expect(centred).toBeLessThanOrEqual(1)
  })
  it("handles a single target size: covered or not", () => {
    const target = { min: 300_000, max: 300_000 }
    expect(checkFit({ min: 100_000, max: 500_000 }, target)).toBeGreaterThan(0.7)
    expect(checkFit({ min: 400_000, max: 900_000 }, target)).toBeLessThanOrEqual(0.3)
  })
  it("is neutral, not a mismatch, when the range or the band is unknown", () => {
    expect(checkFit(null, sweet)).toBe(0.4)
    expect(checkFit({ min: null, max: null }, sweet)).toBe(0.4)
    expect(checkFit({ min: 100_000, max: 200_000 }, { min: 0, max: 0 })).toBe(0.4)
  })
  it("orders two otherwise identical firms by it: the lead fund before the angel", () => {
    const edge = startupContext({ ...STARTUP, askAmount: 1_000_000 }, false)
    const angel = tieBreak(firm({ check_size_min: 25_000, check_size_max: 250_000 }), edge, { thesisRaw: 1, sem: null })
    const lead = tieBreak(firm({ check_size_min: 250_000, check_size_max: 2_000_000 }), edge, { thesisRaw: 1, sem: null })
    expect(lead).toBeGreaterThan(angel)
  })
})

describe("tie-break inside a score band", () => {
  it("puts the firm in the founder's city above one elsewhere in the country, in the score and in the tie value", () => {
    const local = firm({ hq_location: "Atlanta, Georgia, USA" })
    const away = firm({ hq_location: "New York, United States" })
    const a = scoreInvestor(local, ctx, 0), b = scoreInvestor(away, ctx, 0)
    expect(a.score).toBeGreaterThan(b.score)     // headroom: nearness is in the score now, not only the tie-break
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

const scored = (id: string, name: string, score: number, tieValue: number, leadTier?: number): Scored => ({
  id, kind: "firm", name, type: "VC", location: "", sectors: [], website: null, linkedin: null, score, tier: "champion",
  factors: {} as any, reasons: [], whyMatch: "", tags: [], stage: "identified", segments: [], tieValue, leadTier,
}) as Scored

describe("ordering", () => {
  it("never lets the tie-break lift a lower SHOWN score above a higher one", () => {
    expect(compareRanked(scored("1", "Low tie", 100, 0.1), scored("2", "High tie", 98.9, 0.99))).toBeLessThan(0)
  })
  it("treats scores that show as the same whole number as tied, so a founder-invisible 99.4 vs 98.8 does not decide", () => {
    const angel = scored("1", "Angel", 99.4, 0.5, 0)
    const lead = scored("2", "Lead Fund", 98.8, 0.5, 1)
    expect(compareRanked(lead, angel)).toBeLessThan(0)             // both show 99; the one that can lead comes first
    expect([angel, lead].sort(compareRanked).map((f) => f.name)).toEqual(["Lead Fund", "Angel"])
  })
  it("never crosses a tier boundary when rounding: 79.6 is Priority A, 80.0 is Champion", () => {
    const champion = scored("1", "Champion", 80.0, 0.1, 0), nearly = scored("2", "Nearly", 79.6, 0.9, 1)
    expect(compareRanked(champion, nearly)).toBeLessThan(0)
  })
  it("puts firms that can lead before those that cannot inside a shown score, then by tie value", () => {
    const list = [scored("1", "Follower A", 99, 0.9, 0), scored("2", "Lead B", 99, 0.4, 1), scored("3", "Lead C", 99, 0.6, 1), scored("4", "Follower D", 99, 0.3, 0)]
    expect(list.sort(compareRanked).map((f) => f.name)).toEqual(["Lead C", "Lead B", "Follower A", "Follower D"])
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

describe("lead tier", () => {
  const edge = startupContext({ ...STARTUP, askAmount: 1_000_000 }, false)            // band $250K-$1M
  const tier = (min: number, max: number) => scoreInvestor(firm({ check_size_min: min, check_size_max: max }), edge, 0).leadTier
  it("is 1 for ranges that can anchor the round and 0 for ones that only touch the band or sit outside it", () => {
    expect(LEAD_FIT_MIN).toBe(0.45)
    expect(tier(250_000, 2_000_000)).toBe(1)
    expect(tier(500_000, 5_000_000)).toBe(1)          // a big fund still covers half the band
    expect(tier(25_000, 250_000)).toBe(0)             // the angel: reaches the band at one point
    expect(tier(50_000, 250_000)).toBe(0)
    expect(tier(10_000_000, 20_000_000)).toBe(0)
  })
  it("is 0, below confirmed leads, when the firm's check size is unknown", () => {
    expect(scoreInvestor(firm({ check_size_min: null, check_size_max: null }), edge, 0).leadTier).toBe(0)
  })
})
