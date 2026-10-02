import { describe, it, expect } from "vitest"
import { ScoredBatches, type ScoredRow } from "./score-merge"

const row = (name: string, score: number, over: Partial<ScoredRow> = {}): ScoredRow =>
  ({ name, type: "VC", location: "NY", website: "", score, tier: "A", reason: "", ...over })
const THESIS = "Pre-seed healthcare workforce platform"

describe("ScoredBatches", () => {
  it("merges batches scored against the same thesis into one ranking", () => {
    const b = new ScoredBatches()
    const first = b.add(THESIS, [row("Alpha", 9), row("Bravo", 6)])
    expect(first.batches).toBe(1)
    const second = b.add(THESIS, [row("Charlie", 8), row("Delta", 3)])
    expect(second.batches).toBe(2)
    expect(second.added).toBe(2)
    expect(second.ranked.map((r) => r.name)).toEqual(["Alpha", "Charlie", "Bravo", "Delta"])
  })
  it("treats a thesis written with different spacing and case as the same question", () => {
    const b = new ScoredBatches()
    b.add("Pre-seed  healthcare workforce platform", [row("Alpha", 9)])
    const r = b.add("pre-seed healthcare workforce PLATFORM ", [row("Bravo", 7)])
    expect(r.ranked).toHaveLength(2)
    expect(r.batches).toBe(2)
  })
  it("keeps a different thesis apart: scores for one question mean nothing next to another's", () => {
    const b = new ScoredBatches()
    b.add(THESIS, [row("Alpha", 9)])
    const other = b.add("Late-stage fintech infrastructure", [row("Bravo", 4)])
    expect(other.ranked.map((r) => r.name)).toEqual(["Bravo"])
    expect(other.batches).toBe(1)
  })
  it("lists a firm once when two batches both return it, keeping the higher score", () => {
    const b = new ScoredBatches()
    b.add(THESIS, [row("Courtside VC", 6)])
    const r = b.add(THESIS, [row("CourtsideVC", 9), row("Other", 5)])
    expect(r.ranked.map((x) => `${x.name}:${x.score}`)).toEqual(["CourtsideVC:9", "Other:5"])
    expect(r.added).toBe(1)
  })
  it("orders equal scores by name so the list is stable", () => {
    const b = new ScoredBatches()
    const r = b.add(THESIS, [row("Zeta", 7), row("Alpha", 7), row("Mid", 7)])
    expect(r.ranked.map((x) => x.name)).toEqual(["Alpha", "Mid", "Zeta"])
  })

  it("folds a firm's old name, new name and the record that states both into one row", () => {
    const b = new ScoredBatches()
    b.add(THESIS, [row("500 Startups", 4), row("500 Global", 6), row("Other", 5)])
    const r = b.add(THESIS, [row("500 Global (prev 500 Startups)", 5)])
    const names = r.ranked.map((x) => `${x.name}:${x.score}`)
    expect(names).toEqual(["500 Global:6", "Other:5"])        // one row, the highest score of the three
    expect(r.ranked).toHaveLength(2)
  })
  it("keeps a former name working when the record that states it arrives first", () => {
    const b = new ScoredBatches()
    b.add(THESIS, [row("500 Global (prev 500 Startups)", 5)])
    const r = b.add(THESIS, [row("500 Startups", 8)])
    expect(r.ranked.map((x) => `${x.name}:${x.score}`)).toEqual(["500 Startups:8"])
  })
  it("does not merge firms that merely share brackets or a word", () => {
    const b = new ScoredBatches()
    const r = b.add(THESIS, [row("AAF Management (AAF VC)", 7), row("AAF Capital Partners", 6), row("Cashmere Fund (Josh Allen)", 5)])
    expect(r.ranked).toHaveLength(3)
  })
})
