/**
 * LP scoring v2 — the four defects doc 18 §8.3 found, as tests
 * (docs/architecture/19 §8).
 *
 * Pure: no database, no provider.
 */
import { describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))

import { computeFirmScore, computeContactScore, demoteOneBand, detectRegions, scoreGeography, LP_WEIGHTS, LP_WEIGHTS_NO_CAPACITY } from "./scoring"
import { raiseBand, scoreCapacity, ALLOCATION_RATE } from "./lp-capacity"
import { checkPerson } from "./lp-person"
import { tierFor, type FundProfileV2 } from "./types"

/** The fund from the run that exposed all four defects: $40M target, $1M minimum. */
const FUND = {
  id: "f1", name: "Test Fund II", targetRaise: 40_000_000, averageTicket: null,
  sectors: ["software", "healthtech", "ai/ml"], primarySectors: ["software"],
  geographicFocus: ["us"], headquartersLocation: "Utah, United States",
  thesisKeywords: ["university tech transfer", "venture studio", "emerging manager"],
  minimumCommitment: 1_000_000,
} as FundProfileV2 & { minimumCommitment: number }

const firm = (over: Partial<Parameters<typeof computeFirmScore>[0]> = {}) => computeFirmScore({
  type: "Family Office", description: "A single family office backing emerging managers and venture studios.",
  aum: "$300M", sectors: ["software", "healthtech"], location: "Salt Lake City, Utah, United States",
  fund: FUND, ...over,
})

// ─── 1. Capacity: the cheque, not the balance sheet ─────────────────────────

describe("capacity is measured against this fund's raise", () => {
  const band = raiseBand(40_000_000, 1_000_000)!

  it("reads the band from the fund's own terms", () => {
    expect(band.floor).toBe(1_000_000)
    expect(band.ceiling).toBe(12_000_000)  // 30% of target
    expect(band.anchorFloor).toBe(4_000_000) // 10% of target
  })

  it("assumes a minimum when the fund does not state one", () => {
    expect(raiseBand(40_000_000)!.floor).toBe(1_000_000) // 2.5% of target
    expect(raiseBand(null)).toBeNull()
    expect(raiseBand(0)).toBeNull()
  })

  it("scores a $300M family office — a $4.5M cheque — as a perfect fit and an anchor", () => {
    const c = scoreCapacity(300_000_000, "family_office", band)
    expect(c.expectedTicket).toBe(4_500_000)
    expect(c.value).toBe(1)
    expect(c.isAnchor).toBe(true)
  })

  it("refuses to call a $27B endowment an anchor for a $40M fund", () => {
    // 0.5% of $27B is $135M — eleven times what this fund should take from one LP.
    const c = scoreCapacity(27_000_000_000, "endowment", band)
    expect(c.isAnchor).toBe(false)
    expect(c.value).toBeLessThan(0.2)
    expect(c.gate).toBe("capacity_mismatch")
    expect(c.reason).toMatch(/more than this fund should take/)
  })

  it("marks an allocator that cannot meet the minimum", () => {
    const c = scoreCapacity(10_000_000, "family_office", band) // $150K
    expect(c.value).toBe(0.1)
    expect(c.gate).toBe("capacity_mismatch")
    expect(c.isAnchor).toBe(false)
  })

  it("treats unknown AUM as unknown — never top, never zero", () => {
    const c = scoreCapacity(null, "family_office", band)
    expect(c.value).toBe(0.5)
    expect(c.known).toBe(false)
    expect(c.isAnchor).toBe(false)
    expect(c.gate).toBeNull()
  })

  it("expects a smaller share of a bigger, more diversified allocator", () => {
    expect(ALLOCATION_RATE.fund_of_funds).toBeGreaterThan(ALLOCATION_RATE.family_office)
    expect(ALLOCATION_RATE.family_office).toBeGreaterThan(ALLOCATION_RATE.endowment)
    expect(ALLOCATION_RATE.endowment).toBeGreaterThan(ALLOCATION_RATE.pension)
  })

  it("demotes, rather than disqualifies, a wrong-sized LP", () => {
    const huge = firm({ aum: "$27B", type: "Endowment", description: "University endowment." })
    expect(huge.gates).toContain("capacity_mismatch")
    expect(huge.total).toBeGreaterThan(0)
    expect(huge.isAnchor).toBe(false)
    const right = firm({ aum: "$300M" })
    expect(right.total).toBeGreaterThan(huge.total)
  })
})

// ─── 2. The scale, and the gates ────────────────────────────────────────────

describe("the model", () => {
  it("weights sum to 100, with and without capacity", () => {
    const sum = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0)
    expect(sum(LP_WEIGHTS)).toBe(100)
    expect(sum(LP_WEIGHTS_NO_CAPACITY)).toBe(100)
  })

  it("records every component and the points it contributed", () => {
    const s = firm()
    const c = s.components!
    expect(Object.keys(c)).toEqual(["capacity", "lpType", "thesis", "sector", "geography", "evidence"])
    for (const k of Object.keys(c) as (keyof typeof c)[]) {
      expect(c[k].value).toBeGreaterThanOrEqual(0)
      expect(c[k].value).toBeLessThanOrEqual(1)
    }
    expect(s.total).toBeLessThanOrEqual(100)
  })

  it("keeps a venture fund out of a list of LPs", () => {
    const vc = firm({ type: "Venture Capital", description: "Seed-stage venture capital firm." })
    expect(vc.factors.lpType).toBe(0)
  })

  it("moves a score exactly one band down", () => {
    expect(demoteOneBand(90)).toBeGreaterThanOrEqual(70)
    expect(demoteOneBand(90)).toBeLessThan(80)
    expect(tierFor(demoteOneBand(85))).toBe("priority_a")
    expect(tierFor(demoteOneBand(65))).toBe("priority_b")
    expect(demoteOneBand(30)).toBe(30) // nothing below the last band
  })

  it("keeps a Champion from being one on size alone", () => {
    // Right type, right size, but nothing the fund invests in or writes about.
    const noFit = firm({ sectors: [], description: "A family office.", aum: "$300M" })
    if (noFit.total >= 80) expect(noFit.gates).toContain("champion_gate")
    expect(tierFor(noFit.total)).not.toBe("champion")
  })
})

// ─── 3. People are scored on the same scale ─────────────────────────────────

describe("people", () => {
  const person = (over: Partial<Parameters<typeof computeContactScore>[0]> = {}) => computeContactScore({
    type: "Family Office", bio: "Allocates to emerging managers and university spinout venture studios.",
    email: "cio@office.example", linkedin: "https://linkedin.com/in/x",
    sectors: ["software", "healthtech"], location: "Provo, Utah, United States",
    title: "Chief Investment Officer", fund: FUND, ...over,
  })

  it("can reach the top tiers — the defect was a ceiling of 93 on a 118 scale", () => {
    const p = person()
    expect(p.total).toBeGreaterThanOrEqual(60)
    expect(["champion", "priority_a"]).toContain(tierFor(p.total))
  })

  it("inherits the capacity of the firm it belongs to", () => {
    const band = raiseBand(FUND.targetRaise, 1_000_000)!
    const capacity = scoreCapacity(300_000_000, "family_office", band)
    const withFirm = person({ firmCapacity: capacity })
    expect(withFirm.components!.capacity.known).toBe(true)
    expect(withFirm.components!.capacity.value).toBe(1)
    expect(withFirm.expectedTicket).toBe(4_500_000)
  })

  it("redistributes capacity's weight when no firm is known, rather than scoring zero", () => {
    const alone = person()
    expect(alone.components!.capacity.points).toBe(0)
    expect(alone.components!.lpType.points).toBeGreaterThan(LP_WEIGHTS.lpType * 0.9)
  })

  it("counts seniority as evidence of a decision-maker, not as capacity", () => {
    const cio = person({ title: "Chief Investment Officer" })
    const analyst = person({ title: "Analyst" })
    expect(cio.components!.evidence.value).toBeGreaterThan(analyst.components!.evidence.value)
    expect(cio.components!.capacity.value).toBe(analyst.components!.capacity.value)
    expect(cio.tags).toContain("DM")
  })
})

// ─── 4. Records that are not people ─────────────────────────────────────────

describe("checkPerson", () => {
  it("keeps people", () => {
    for (const name of ["Jane Doe", "Pat O'Brien", "Jean-Luc de la Vega", "Li Wei"]) {
      expect(checkPerson(name).isPerson).toBe(true)
    }
  })

  it("refuses the organisations the directory files as people", () => {
    const cases: [string, RegExp][] = [
      ["Harvard Management Company Management Company", /repeated phrase/],
      ["Acme Capital", /organisation/],
      ["Stanford University", /organisation/],
      ["Oak Foundation", /organisation/],
      ["Bridge Ventures LLC", /organisation/],
      ["", /no name/],
    ]
    for (const [name, reason] of cases) {
      const r = checkPerson(name)
      expect(r.isPerson, name).toBe(false)
      expect(r.reason, name).toMatch(reason)
    }
  })

  it("refuses names that cannot be personal", () => {
    expect(checkPerson("Fund II Co-Investment Vehicle 2026").isPerson).toBe(false)
    expect(checkPerson("The Investment Office").isPerson).toBe(false)
  })
})

// ─── 5. Tie-breaking ────────────────────────────────────────────────────────

describe("ties", () => {
  it("carries the key that breaks them", () => {
    const s = firm()
    expect(s.rank).toMatchObject({ capacityKnown: 1 })
    expect(s.rank!.thesisMatched).toBeGreaterThanOrEqual(0)
    expect(s.rank!.sectorMatched).toBeGreaterThan(0)
  })

  it("prefers known capacity to assumed, at the same score", () => {
    const known = firm({ aum: "$300M" }).rank!
    const unknown = firm({ aum: null }).rank!
    expect(known.capacityKnown).toBe(1)
    expect(unknown.capacityKnown).toBe(0)
  })
})

// ─── 6. Geography and fund size (2026-09-25, doc 19 §10) ────────────────────
//
// The defect these come from: a $5M North American consumer fund whose measured
// top five was four university endowments, three of them overseas.

describe("a continent is a geography", () => {
  // The AI extractor returns "North America" for a fund that says "North
  // American" and nothing more specific. That used to resolve to no region at
  // all, and since every US branch was gated on the fund's own regions, an LP in
  // New York scored the same 1 point as one in Daejeon.
  const NA = { ...FUND, geographicFocus: ["us", "canada"], headquartersLocation: "North America" } as FundProfileV2

  it("resolves North America instead of discarding it", () => {
    expect(detectRegions("North America")).toEqual(["north_america"])
  })

  it("still refuses to read Latin America as the US", () => {
    expect(detectRegions("Latin America")).toEqual([])
    expect(detectRegions("South America")).toEqual([])
  })

  it("places a US LP inside a North American fund's geography", () => {
    const g = scoreGeography("New York, United States", NA)
    expect(g.tag).toBe("TARGET-GEO")
    expect(g.outOfFocus).toBe(false)
    expect(g.points).toBeGreaterThan(10)
  })

  it("matches a sub-region against a continent-level focus", () => {
    const continent = { ...FUND, geographicFocus: ["north america"], headquartersLocation: "North America" } as FundProfileV2
    expect(scoreGeography("Toronto, Canada", continent).outOfFocus).toBe(false)
    expect(scoreGeography("Salt Lake City, Utah", continent).outOfFocus).toBe(false)
  })

  it("marks an LP we can place outside the stated geography", () => {
    const outside = scoreGeography("Mumbai, India", NA)
    const inside = scoreGeography("New York, United States", NA)
    expect(outside.outOfFocus).toBe(true)
    expect(outside.points).toBeLessThan(inside.points)
  })

  // GEO_REGIONS is a keyword list, not a gazetteer: "Austin, Texas" resolves to
  // nothing just as "Daejeon, South Korea" does. Demoting everything we cannot
  // place would therefore punish real US allocators, so an unplaceable location
  // scores low but is never gated. It still loses decisively to a located match.
  it("does not gate a location it cannot place, but still ranks it below one it can", () => {
    const unplaceable = scoreGeography("Daejeon, South Korea", NA)
    expect(unplaceable.outOfFocus).toBe(false)
    expect(unplaceable.points).toBeLessThan(scoreGeography("New York, United States", NA).points)
  })

  it("does not demote anyone when the fund's stated geography cannot be resolved", () => {
    const vague = { ...FUND, geographicFocus: ["everywhere"], headquartersLocation: "Mars" } as FundProfileV2
    expect(scoreGeography("Daejeon, South Korea", vague).outOfFocus).toBe(false)
  })
})

describe("being outside the fund's geography demotes", () => {
  const NA = { ...FUND, geographicFocus: ["us", "canada"], headquartersLocation: "North America" } as FundProfileV2

  it("gates an otherwise identical LP that sits in the wrong region", () => {
    const here = computeFirmScore({ type: "Family Office", description: "Backs emerging managers.", aum: "$300M", sectors: ["software"], location: "New York, United States", fund: NA })
    const away = computeFirmScore({ type: "Family Office", description: "Backs emerging managers.", aum: "$300M", sectors: ["software"], location: "Mumbai, India", fund: NA })
    expect(away.gates).toContain("geography_mismatch")
    expect(here.gates).not.toContain("geography_mismatch")
    expect(away.total).toBeLessThan(here.total)
  })
})

describe("fund size is judged even when AUM is missing", () => {
  const SMALL = { ...FUND, targetRaise: 5_000_000, minimumCommitment: null, geographicFocus: ["us"], headquartersLocation: "North America" } as FundProfileV2
  const band = raiseBand(5_000_000)!

  it("infers that an endowment is structurally too large for a $5M fund", () => {
    const c = scoreCapacity(null, "endowment", band)
    expect(c.known).toBe(false)          // still not evidence about this LP
    expect(c.gate).toBe("capacity_mismatch")
    expect(c.value).toBeLessThan(0.5)     // worse than neutral, not better
  })

  it("leaves types whose size genuinely varies as unknown", () => {
    for (const t of ["family_office", "fund_of_funds", "hnw_angel"] as const) {
      const c = scoreCapacity(null, t, band)
      expect(c.gate).toBeNull()
      expect(c.value).toBe(0.5)
    }
  })

  it("never lets an inferred size promote — only demote", () => {
    // A big fund can take an endowment cheque, so the inference must stay silent.
    const big = scoreCapacity(null, "endowment", raiseBand(400_000_000)!)
    expect(big.gate).toBeNull()
    expect(big.value).toBe(0.5)
    expect(big.expectedTicket).toBeNull()
  })

  it("ranks a plausible local allocator above an oversized overseas one", () => {
    const endowment = computeFirmScore({ type: "University Endowment", description: "University endowment.", aum: null, sectors: ["software"], location: "Cambridge, United Kingdom", fund: SMALL })
    const family = computeFirmScore({ type: "Family Office", description: "Single family office backing emerging managers.", aum: "$120M", sectors: ["software"], location: "New York, United States", fund: SMALL })
    expect(family.total).toBeGreaterThan(endowment.total)
  })
})

describe("some allocators will not look at a small fund at any cheque size", () => {
  const SMALL = raiseBand(5_000_000)!      // ceiling $1.5M
  const MID = raiseBand(40_000_000)!       // ceiling $12M

  it("refuses the arithmetic that made a $300M endowment a perfect fit for $5M", () => {
    // 0.5% of $300M is $1.5M, which lands exactly on the $5M fund's ceiling and
    // used to score a flat 1.0. The manager minimum is what actually rules it out.
    const c = scoreCapacity(300_000_000, "institutional_other", SMALL)
    expect(c.value).toBeLessThan(0.2)
    expect(c.gate).toBe("capacity_mismatch")
    expect(c.isAnchor).toBe(false)
    expect(c.reason).toMatch(/manager minimum/)
  })

  it("lets the same allocator through for a fund large enough to interest it", () => {
    const c = scoreCapacity(300_000_000, "institutional_other", MID)
    expect(c.gate).toBeNull()
    expect(c.value).toBeGreaterThan(0.5)
  })

  it("does not apply a manager minimum to the types that back small funds", () => {
    for (const t of ["family_office", "hnw_angel", "fund_of_funds"] as const) {
      expect(scoreCapacity(120_000_000, t, SMALL).reason).not.toMatch(/manager minimum/)
    }
  })

  it("keeps a sovereign wealth fund out of a $5M raise", () => {
    expect(scoreCapacity(500_000_000, "sovereign_wealth", SMALL).gate).toBe("capacity_mismatch")
  })
})
