import { describe, it, expect } from "vitest"
import { dedupFirms, normalizeFirmName } from "./dedup"

const firm = (id: string, name: string, score: number, over: Record<string, unknown> = {}): any => ({
  firmId: id, name, normalizedName: normalizeFirmName(name), type: "Family Office", location: "NY", aumRaw: null, aumUsd: null,
  sectors: [], website: null, linkedin: null, description: null, score, tier: "priority_a", factors: {}, reasons: [], whyThisLp: "",
  tags: [], segments: [], isAnchor: false, ...over,
})
const names = (r: { merged: any[] }) => r.merged.map((f) => f.name)

describe("LP engine firm merge", () => {
  it("still merges what it always merged: the same name past its legal suffix", () => {
    const r = dedupFirms([firm("1", "GROVE STREET ADVISORS LLC", 70), firm("2", "GroveStreet", 80), firm("3", "Other Office", 60)])
    expect(r.mergedCount).toBe(1)
    expect(names(r)).toEqual(["GroveStreet", "Other Office"])
  })
  it("merges a firm listed under its old name, its new name and a record that states both", () => {
    const r = dedupFirms([
      firm("1", "Harbor Family Office (formerly Anchor Partners)", 60),
      firm("2", "Anchor Partners", 75),
      firm("3", "Harbor Family Office", 70),
      firm("4", "Unrelated Office", 65),
    ])
    expect(r.mergedCount).toBe(2)
    expect(names(r)).toEqual(["Anchor Partners", "Unrelated Office"])           // best-scored record of the three
  })
  it("merges the same name written with and without spaces", () => {
    const r = dedupFirms([firm("1", "Family Wealth Group", 70), firm("2", "FamilyWealth Group", 72)])
    expect(r.mergedCount).toBe(1)
  })
  it("keeps the winner's score and fills what it lacks from the others", () => {
    const r = dedupFirms([
      firm("1", "Harbor (fka Anchor)", 60, { website: "https://harbor.example", tags: ["A"] }),
      firm("2", "Anchor", 80, { tags: ["B"] }),
    ])
    const w = r.merged[0]
    expect(r.merged).toHaveLength(1)
    expect(w.score).toBe(80)
    expect(w.website).toBe("https://harbor.example")
    expect(w.tags.sort()).toEqual(["A", "B"])
  })
  it("never lends a merged duplicate's ANCHOR status to a winner that is not one", () => {
    const r = dedupFirms([firm("1", "Harbor (fka Anchor)", 60, { isAnchor: true, tags: ["ANCHOR"] }), firm("2", "Anchor", 80)])
    expect(r.merged[0].tags).not.toContain("ANCHOR")
  })
  it("does not treat brackets, slash lists or shared words as the same firm", () => {
    const r = dedupFirms([
      firm("1", "Alpha Management (Alpha FO)", 70), firm("2", "Alpha Capital Group", 71),
      firm("3", "North / South Office", 72), firm("4", "North Office", 73),
    ])
    expect(r.mergedCount).toBe(0)
  })
  it("leaves a list of distinct firms alone", () => {
    const list = [firm("1", "One", 50), firm("2", "Two", 60), firm("3", "Three", 70)]
    const r = dedupFirms(list)
    expect(r.mergedCount).toBe(0)
    expect(r.merged).toHaveLength(3)
  })
})
