import { describe, it, expect } from "vitest"
import { groupByFirm, type Scored } from "./founder-grouping"
import { firmDedupKey, siteHost, clusterFirms } from "./dedup"

const firm = (id: string, name: string, score: number, website: string | null = null): Scored => ({
  id, kind: "firm", name, type: "VC", location: "SF", sectors: [], website, linkedin: null, score, tier: "champion",
  factors: {} as any, reasons: [], whyMatch: "", tags: [], stage: "identified", segments: [],
}) as Scored

describe("firm dedup", () => {
  it("treats the spacing and casing of a name as the same firm", () => {
    expect(firmDedupKey("CourtsideVC")).toBe(firmDedupKey("Courtside VC"))
    expect(firmDedupKey("COURTSIDE VC, LLC")).toBe(firmDedupKey("Courtside VC"))
    expect(firmDedupKey("Sports Colab")).toBe(firmDedupKey("SportsColab"))
  })
  it("keeps different firms apart, including ones that differ by a stripped suffix word", () => {
    expect(firmDedupKey("Lead VC")).not.toBe(firmDedupKey("Lead Capital"))
    expect(firmDedupKey("Seven Six")).not.toBe(firmDedupKey("Seven Seas"))
  })
  it("reads a real site but not a social profile", () => {
    expect(siteHost("https://www.Example.com/about")).toBe("example.com")
    expect(siteHost("example.com")).toBe("example.com")
    expect(siteHost("https://www.linkedin.com/company/x")).toBe("")
    expect(siteHost(null)).toBe("")
    expect(siteHost("not a url")).toBe("")
  })
  it("joins records that share a site and a name stem, and only those", () => {
    const c = clusterFirms([
      { name: "CourtsideVC", website: "https://courtside.vc" },
      { name: "Courtside Ventures LLC", website: "https://www.courtside.vc/" },
      { name: "Courtside Sports Bar Fund", website: "https://other.example" },
      { name: "Ab", website: "https://shared.example" }, { name: "Abc Partners", website: "https://shared.example" },
    ])
    expect(c[1]).toBe(c[0])          // same site, "courtside" is the stem of "courtsidevc"
    expect(c[2]).not.toBe(c[0])      // different site
    expect(c[4]).not.toBe(c[3])      // shared site but stem under five characters: not joined
  })
})

describe("groupByFirm", () => {
  it("lists one firm once when the directory holds it twice, and counts the merge", () => {
    const all = [firm("1", "CourtsideVC", 100), firm("2", "Courtside VC", 98), firm("3", "Other Fund", 90)]
    const r = groupByFirm(all, [], new Set(["1", "2", "3"]), 40)
    expect(r.groups.map((g) => g.firm.name)).toEqual(["CourtsideVC", "Other Fund"])
    expect(r.duplicatesMerged).toBe(1)
  })
  it("keeps the best-scored record and moves the other's people under it", () => {
    const person = { ...firm("p1", "Jo Doe", 80), kind: "person", firmId: "2", email: "jo@x.com" } as Scored
    const r = groupByFirm([firm("1", "CourtsideVC", 100), firm("2", "Courtside VC", 98)], [person], new Set(["1", "2"]), 40)
    expect(r.groups).toHaveLength(1)
    expect(r.groups[0].firm.id).toBe("1")
    expect(r.groups[0].primary?.name).toBe("Jo Doe")
  })
})
