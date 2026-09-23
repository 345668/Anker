import { describe, it, expect } from "vitest"
import {
  startupContext, scoreInvestor, sectorScore, stageScore, checkScore, geographyScore, firmFacts, personFacts, WEIGHTS,
} from "./founder-scoring"
import { groupByFirm, chooseContacts, type Scored } from "./founder-grouping"
import { sectorProfile } from "../normalize/sectors"
import { tierFor } from "./types"

const STARTUP = {
  id: "s", name: "Northwind Sports", stage: "pre-seed", location: "United States", askAmount: 1_000_000,
  sectors: ["sports technology", "healthtech", "saas", "ai"], primarySector: "sports technology",
  preMoneyValuation: null, checkSizeIdealMin: null, checkSizeIdealMax: null, thesisKeywords: ["athlete performance"],
} as any
const ctx = startupContext(STARTUP, false)
const firm = (over: Record<string, unknown>) => firmFacts({
  id: "f", name: "F", firm_classification: "Venture Capital", description: "We back founders.", sectors: ["Sports Tech"],
  stages: ["Pre-Seed", "Seed"], hq_location: "New York, United States", check_size_min: 250_000, check_size_max: 1_000_000,
  portfolio_count: 40, ...over,
})

describe("weights", () => {
  it("sum to 100", () => expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100))
})

describe("components", () => {
  it("rank a specialist above a vertical match above a generalist above a horizontal-only fund", () => {
    const s = (sectors: string[]) => sectorScore(sectorProfile(sectors), ctx)
    expect(s(["Sports Technology"])).toBe(1)
    expect(s(["Digital Health"])).toBe(0.8)
    expect(s(["Technology", "Generalist"])).toBe(0.45)
    expect(s(["SaaS", "Software"])).toBe(0.35)
    expect(s([])).toBe(0.3)
    expect(s(["Climate Tech"])).toBe(0)
  })

  it("scores stage, check and geography continuously", () => {
    expect(stageScore(["pre-seed"], "pre-seed")).toBe(1)
    expect(stageScore(["series-a"], "seed")).toBe(0.5)
    expect(stageScore(["growth"], "pre-seed")).toBe(0)
    expect(stageScore([], "pre-seed")).toBe(0.35)
    const ideal = { min: 50_000, max: 500_000 }
    expect(checkScore({ min: 100_000, max: 250_000 }, ideal)).toBe(1)
    expect(checkScore({ min: 1_000_000, max: 5_000_000 }, ideal)).toBeCloseTo(1 - 1 / 3) // 2× above
    expect(checkScore(null, ideal)).toBe(0.4)
    expect(geographyScore({ country: "US", region: "north_america", global: false }, ctx)).toBe(1)
    expect(geographyScore({ country: "CA", region: "north_america", global: false }, ctx)).toBe(0.6)
    expect(geographyScore({ country: "NL", region: "europe", global: false }, ctx)).toBe(0.2)
    expect(geographyScore({ country: null, region: null, global: false }, ctx)).toBe(0.4)
  })
})

describe("composite and gates", () => {
  it("makes a US pre-seed sports specialist a Champion", () => {
    const r = scoreInvestor(firm({}), ctx, 0)
    expect(r.tier).toBe("champion")
    expect(r.gates).toEqual([])
    expect(r.why).toMatch(/^Sports tech specialist · invests at pre-seed/)
  })

  it("keeps a stage-perfect horizontal generalist out of Champion and Priority A", () => {
    const r = scoreInvestor(firm({ sectors: ["SaaS", "AI"] }), ctx, 0)
    expect(r.score).toBeLessThan(60)
    expect(r.gates).toContain("priority_a_gate")
    expect(r.why).toMatch(/thesis not confirmed$/)
  })

  it("lets strong semantic evidence promote a generalist, and orders specialists by it without dropping them below 85%", () => {
    const semCtx = startupContext(STARTUP, true)
    const generalist = scoreInvestor(firm({ sectors: ["SaaS"] }), semCtx, 0.9)
    expect(generalist.components.thesis.value).toBeGreaterThanOrEqual(0.45)
    const cold = scoreInvestor(firm({}), semCtx, 0)
    const warm = scoreInvestor(firm({}), semCtx, 1)
    expect(cold.components.thesis.value).toBeCloseTo(0.85)
    expect(warm.components.thesis.value).toBe(1)
    expect(warm.score).toBeGreaterThan(cold.score)
    expect(cold.tier).toBe("champion")
  })

  it("does not treat a fund listing ten sectors as a specialist", () => {
    const broad = firm({ sectors: ["Consumer Electronics", "AI Robotics", "Fintech", "Drone Delivery", "Cybersecurity", "Insurtech", "Fitness and Wellness", "Edtech", "Proptech", "Travel"] })
    const r = scoreInvestor(broad, ctx, 0)
    expect(r.components.thesis.sector).toBeLessThan(0.75)
    expect(r.tier).not.toBe("champion")
    expect(r.why).toMatch(/among \d+ sectors/)
  })

  it("does not let an off-thesis, wrong-region fund reach Priority B on stage and check alone", () => {
    const r = scoreInvestor(firm({ sectors: ["Climate Tech"], hq_location: "Amsterdam, Netherlands" }), ctx, 0)
    expect(r.gates).toContain("off_thesis")
    expect(r.score).toBeLessThanOrEqual(45)
    expect(r.components.geography.value).toBe(0.2)
  })

  it("halves a stage mismatch", () => {
    const r = scoreInvestor(firm({ stages: ["Growth"] }), ctx, 0)
    expect(r.gates).toContain("stage_mismatch")
    expect(r.tier).not.toBe("champion")
  })

  it("maps gated scores into the band below without collapsing them onto one value", () => {
    const a = scoreInvestor(firm({ sectors: ["SaaS"], portfolio_count: 5 }), ctx, 0)
    const b = scoreInvestor(firm({ sectors: ["SaaS"], portfolio_count: 500 }), ctx, 0)
    expect(a.score).not.toBe(b.score)
    expect(tierFor(a.score)).toBe(a.tier)
  })

  it("reads people's check size from typical_investment", () => {
    const p = personFacts({ id: "p", sectors: ["sports"], stages: ["pre-seed"], check_min: 50000, check_max: 250000, email: "a@b.co", bio: "x".repeat(50) }, "valid")
    expect(p.check).toEqual({ min: 50000, max: 250000 })
    expect(scoreInvestor(p, ctx, 0).components.checkSize.value).toBe(1)
  })
})

describe("grouping", () => {
  const scored = (id: string, over: Partial<Scored>): Scored => ({
    id, kind: "person", name: id, type: "VC", location: "", sectors: [], website: null, linkedin: null,
    score: 50, tier: "priority_b", factors: {} as any, reasons: [], whyMatch: "", tags: [], stage: "identified", segments: [], ...over,
  } as Scored)

  it("groups people under their firm, at most one primary and two alternates, never a person twice", () => {
    const firms = [scored("F1", { kind: "firm", score: 90 }), scored("F2", { kind: "firm", score: 70 })]
    const people = [
      scored("a", { firmId: "F1", score: 80, email: "a@f1.com", emailStatus: "valid", seniority: 1 }),
      scored("b", { firmId: "F1", score: 85, email: "b@f1.com", emailStatus: "invalid", seniority: 1 }),
      scored("c", { firmId: "F1", score: 60, email: "c@f1.com", seniority: 0.4 }),
      scored("d", { firmId: "F1", score: 55, email: "d@f1.com", seniority: 0.4 }),
      scored("e", { firmId: null, score: 70, email: "e@x.com" }),
      scored("dup", { firmId: null, score: 40, email: "E@x.com" }),
      scored("gone", { firmId: "F-not-qualified", score: 90 }),
    ]
    const r = groupByFirm(firms, people, new Set(["F1", "F2", "F-not-qualified"]), 40)
    expect(r.groups.map((g) => g.firm.id)).toEqual(["F1", "F2"])
    const g1 = r.groups[0]
    expect(g1.primary?.id).toBe("a") // b ranks higher but its email is invalid
    expect(g1.alternates).toHaveLength(2)
    expect(new Set([g1.primary!.id, ...g1.alternates.map((p) => p.id)]).size).toBe(3)
    expect(r.independents.map((p) => p.id)).toEqual(["e"]) // duplicate email merged; person at a directory firm is not independent
  })

  it("lets partners carry a sparse firm, and says so", () => {
    const r = groupByFirm(
      [scored("F", { kind: "firm", score: 30, sparse: true })],
      [scored("p", { firmId: "F", score: 75 })], new Set(["F"]), 40)
    expect(r.groups[0]).toMatchObject({ scoreFrom: "people" })
    expect(r.groups[0].firm.score).toBe(70)
  })

  it("prefers a verified address among near-equal contacts", () => {
    const { primary } = chooseContacts([
      scored("x", { score: 80, email: "x@f.com", emailStatus: "unknown", seniority: 1 }),
      scored("y", { score: 79, email: "y@f.com", emailStatus: "valid", seniority: 1 }),
    ])
    expect(primary?.id).toBe("y")
  })
})
