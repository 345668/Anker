import { describe, it, expect } from "vitest"
import { projectRunway, calculateCapTable, DEFAULT_CAP_TABLE, DEFAULT_RUNWAY } from "./models"
describe("runway cash-flow model", () => {
  it("accumulates profitable cash flow", () => {
    const result = projectRunway({ ...DEFAULT_RUNWAY, cashOnHand: 100, monthlyBurn: 10, monthlyRevenue: 30, burnGrowth: 0, revenueGrowth: 0 }, 3)
    expect(result.points.map(p => p.cash)).toEqual([100, 120, 140, 160])
    expect(result.zeroMonth).toBeNull()
  })
  it("does not add funding when month zero means none", () => {
    expect(projectRunway({ ...DEFAULT_RUNWAY, newRaiseMonth: 0, newRaiseAmount: 1000 }).points[0].cash).toBe(DEFAULT_RUNWAY.cashOnHand)
  })
  it("retains a liquidity gap before a later financing", () => {
    const result = projectRunway({ ...DEFAULT_RUNWAY, cashOnHand: 100, monthlyBurn: 150, monthlyRevenue: 0, burnGrowth: 0, revenueGrowth: 0, newRaiseMonth: 1, newRaiseAmount: 1000 }, 3)
    expect(result.zeroMonth).toBe(1)
    expect(result.points[1].cash).toBe(950)
  })
  it("distinguishes horizon censoring and zero opening cash", () => {
    expect(projectRunway({ ...DEFAULT_RUNWAY, monthlyBurn: 0, monthlyRevenue: 0 }).zeroMonth).toBeNull()
    expect(projectRunway({ ...DEFAULT_RUNWAY, cashOnHand: 0 }).zeroMonth).toBe(0)
  })
})
describe("priced equity and ESOP", () => {
  it("solves ownership and conserves 100 percent", () => {
    const final = calculateCapTable(DEFAULT_CAP_TABLE).at(-1)!
    expect(final.holders.find(h => h.type === "investor")!.pct).toBeCloseTo(.2)
    expect(final.holders.find(h => h.type === "esop")!.pct).toBeCloseTo(.1)
    expect(final.holders.reduce((n, h) => n + h.pct, 0)).toBeCloseTo(1)
    expect(final.total).toBeCloseTo(9000000 / .7)
  })
  it("never cancels an existing pool when a lower target is requested", () => {
    const final = calculateCapTable({ ...DEFAULT_CAP_TABLE, rounds: [{ ...DEFAULT_CAP_TABLE.rounds[0], esopTarget: 0 }] }).at(-1)!
    expect(final.holders.find(h => h.type === "esop")!.shares).toBe(1000000)
    expect(final.total).toBeCloseTo(12500000)
  })
  it("rejects impossible dilution and empty ownership instead of inventing output", () => {
    expect(() => calculateCapTable({ ...DEFAULT_CAP_TABLE, rounds: [{ ...DEFAULT_CAP_TABLE.rounds[0], esopTarget: .9 }] })).toThrow(/below 100/)
    expect(() => calculateCapTable({ holders: [], rounds: [] })).toThrow()
  })
})
