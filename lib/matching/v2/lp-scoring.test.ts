/**
 * LP scoring v2 — the four defects doc 18 §8.3 found, as tests
 * (docs/architecture/19 §8).
 *
 * Pure: no database, no provider.
 */
import { describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))

import { computeFirmScore, computeContactScore, demoteOneBand, LP_WEIGHTS, LP_WEIGHTS_NO_CAPACITY } from "./scoring"
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
