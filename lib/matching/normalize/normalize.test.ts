import { describe, it, expect } from "vitest"
import { sectorProfile, sectorOverlap } from "./sectors"
import { normalizeStages } from "./stages"
import { investorClass, seniority } from "./classes"
import { parseMoneyRange, checkRange } from "./money"
import { resolveGeo, resolveTargets } from "./geo"

describe("sectors — whole words only", () => {
  it("does not find AR/VR inside software or healthcare, or AI inside retail", () => {
    expect(sectorProfile(["Software", "Healthcare"]).groups).not.toContain("ar")
    expect(sectorProfile(["Retail", "Supply Chain"]).groups).not.toContain("ai")
    expect(sectorProfile(["AR/VR"]).groups).toEqual(["ar"])
  })

  it("separates verticals from horizontals", () => {
    const p = sectorProfile(["sports technology", "healthtech", "SaaS", "AI"])
    expect(p.verticals).toEqual(["sports", "healthcare"])
    expect(p.horizontals).toEqual(["saas", "ai"])
  })

  it("reads a sector-agnostic list as generalist, not as a match", () => {
    expect(sectorProfile(["Technology", "Generalist"])).toMatchObject({ groups: [], generalist: true })
    expect(sectorProfile([])).toMatchObject({ empty: true, generalist: false })
  })

  it("does not make games funds sports specialists", () => {
    expect(sectorProfile(["Gaming"]).groups).not.toContain("sports")
  })

  it("keeps the overlap shape the old matcher returned", () => {
    expect(sectorOverlap(["Fintech", "Payments"], ["financial services"])).toMatchObject({ overlap: true, matched: ["fintech"] })
    expect(sectorOverlap(["Climate Tech", "Software"], ["sports technology"]).overlap).toBe(false)
  })
})

describe("stages", () => {
  it("maps the directory's vocabulary", () => {
    expect(normalizeStages(["Pre-Seed", "Seed"])).toEqual(["pre-seed", "seed"])
    expect(normalizeStages("Early Stage")).toEqual(["pre-seed", "seed", "series-a"])
    expect(normalizeStages(["Idea/First Check"])).toEqual(["pre-seed"])
    expect(normalizeStages('["Series B+"]')).toEqual(["series-b", "series-c"])
    expect(normalizeStages(["Debt", "Grant", "Bridge"])).toEqual([])
  })
})

describe("investor classes and seniority", () => {
  it("classifies the directory's types", () => {
    expect(investorClass("Venture Capital")).toBe("vc")
    expect(investorClass("Corporate VC")).toBe("cvc")
    expect(investorClass("Accelerator, VC")).toBe("accelerator")
    expect(investorClass("Family Office")).toBe("family_office")
    expect(investorClass("Fund of Funds")).toBe("fund_of_funds")
    expect(investorClass("Sovereign Wealth Fund")).toBe("sovereign_wealth")
    expect(investorClass("Asset & Wealth Manager")).toBe("asset_manager")
    expect(investorClass("Private Equity / Growth Equity")).toBe("pe")
    expect(investorClass("insurance company")).toBe("insurance")
    expect(investorClass("Angel Investor / HNW")).toBe("angel")
    expect(investorClass(null, "VC")).toBe("vc")
  })

  it("reads seniority from titles, and a venture partner is not a partner", () => {
    expect(seniority("Managing Partner")).toBe(1)
    expect(seniority("General Partner & Co-Founder")).toBe(1)
    expect(seniority("Venture Partner")).toBe(0.7)
    expect(seniority("Principal")).toBe(0.7)
    expect(seniority("Associate")).toBe(0.4)
    expect(seniority(null)).toBe(0.5)
  })
})

describe("money", () => {
  it.each([
    ["$50K-$250K", { min: 50_000, max: 250_000 }],
    ["$1M+", { min: 1_000_000, max: null }],
    ["Up to $500K", { min: null, max: 500_000 }],
    ["$50,000 - $100,000", { min: 50_000, max: 100_000 }],
    ["$1-5M", { min: 1_000_000, max: 5_000_000 }],
    ["RAISING $2MM", { min: 2_000_000, max: 2_000_000 }],
    ["€500k – €2m", { min: 500_000, max: 2_000_000 }],
  ])("%s", (text, expected) => expect(parseMoneyRange(text)).toEqual(expected))

  it("prefers numeric columns and falls back to text", () => {
    expect(checkRange(100000, 500000, "$1M")).toEqual({ min: 100000, max: 500000 })
    expect(checkRange(null, null, null, "$50K-$250K")).toEqual({ min: 50000, max: 250000 })
    expect(checkRange(null, null, "")).toBeNull()
  })
})

describe("geography — whole words only", () => {
  it.each([
    ["Amsterdam, Netherlands", "NL", "europe"],
    ["Zurich, Switzerland; Geneva, Switzerland", "CH", "europe"],
    ["Helsinki, Finland", "FI", "europe"],
    ["Lagos, Nigeria", "NG", "mea"],
    ["Cayman Islands", "KY", "latam"],
    ["Warsaw, Poland", "PL", "europe"],
    ["Salt Lake City Metropolitan Area", "US", "north_america"],
    ["Austin, TX", "US", "north_america"],
    ["New York, United States", "US", "north_america"],
    ["Indianapolis, Indiana", "US", "north_america"],
    ["Mumbai, India", "IN", "apac"],
    ["Berlin, DE", "DE", "europe"],
  ])("%s → %s", (text, country, region) => {
    const g = resolveGeo(text)
    expect(g.country).toBe(country)
    expect(g.region).toBe(region)
  })

  it("keeps Latin America out of the US", () => {
    expect(resolveGeo("Latin America")).toMatchObject({ country: null, region: "latam" })
  })

  it("prefers an explicit country field", () => {
    expect(resolveGeo("United States", "London").country).toBe("US")
  })

  it("resolves target lists into countries and regions", () => {
    const t = resolveTargets(["United States", "Europe", "Global"])
    expect([...t.countries]).toEqual(["US"])
    expect([...t.regions]).toEqual(["europe"])
    expect(t.global).toBe(true)
  })
})
