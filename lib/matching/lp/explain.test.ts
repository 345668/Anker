import { describe, expect, it } from "vitest"
import { confidenceCounts, contactFacts, contactSentence, factorRows, firmFacts, firmSentence } from "./explain"

describe("what a match says about itself", () => {
  it("a well-known firm is high confidence with no gaps", () => {
    const r = firmFacts({ type: "Family Office", aumUsd: 5e8, sectors: ["climate"], location: "New York", description: "A family office.", expectedTicket: 7e6 })
    expect(r).toEqual({ gaps: [], confidence: "high" })
  })
  it("missing AUM is named, and says why the cheque is not estimated", () => {
    const r = firmFacts({ type: "Family Office", aumUsd: null, sectors: ["climate"], location: "NY", description: "x", expectedTicket: null })
    expect(r.confidence).toBe("high") // four of five known
    expect(r.gaps).toEqual(["AUM not in the directory, so the likely cheque is not estimated"])
  })
  it("a bare row is low confidence and lists every gap", () => {
    const r = firmFacts({ type: "", aumUsd: null, sectors: [], location: "", description: null, expectedTicket: null })
    expect(r.confidence).toBe("low")
    expect(r.gaps).toHaveLength(5)
  })
  it("three of five known is medium", () => {
    expect(firmFacts({ type: "FO", aumUsd: 1e8, sectors: [], location: "X", description: null, expectedTicket: 1e6 }).confidence).toBe("medium")
  })
  it("a person counts an email or a LinkedIn profile as a way to reach them", () => {
    expect(contactFacts({ type: "FO", email: "a@b.com", emailVerified: true, linkedin: null, title: "Principal", sectors: ["x"], location: "NY" })).toEqual({ gaps: [], confidence: "high" })
    expect(contactFacts({ type: "FO", email: null, emailVerified: false, linkedin: "https://linkedin.com/in/x", title: "P", sectors: [], location: "" }).gaps).toEqual(["No sectors listed", "Location not recorded"])
    expect(contactFacts({ type: "", email: null, emailVerified: false, linkedin: null, title: null, sectors: [], location: "" }).confidence).toBe("low")
  })
  it("the sentence is built only from what the row holds", () => {
    expect(firmSentence({ name: "A", type: "Family Office", location: "New York", aumUsd: 5e8, expectedTicket: 7e6, reasons: ["Sector overlap: climate", "Matches investment geography: US", "x"] }))
      .toBe("Family Office in New York, $500M AUM, a likely cheque of about $7M. Sector overlap: climate; Matches investment geography: US.")
    expect(firmSentence({ name: "A", type: "", location: "", aumUsd: null, expectedTicket: null, reasons: [] })).toBe("Investor.")
    expect(contactSentence({ type: "Family Office", title: "Principal", location: "NY", emailVerified: true, reasons: ["Sectors: climate"] })).toBe("Principal in NY, email on record. Sectors: climate.")
  })
  it("factor rows follow the weighing order and keep the engine's points", () => {
    const rows = factorRows({ lpType: 20, aum: 25, sector: 3, geography: 7, thesis: 20, contact: 0 }, "firm")
    expect(rows.map((r) => r.key)).toEqual(["aum", "lpType", "thesis", "sector", "geography"])
    expect(rows[0]).toEqual({ key: "aum", label: "Size and likely cheque", points: 25 })
  })
  it("counts confidence", () => {
    expect(confidenceCounts([{ confidence: "high" }, { confidence: "low" }, { confidence: "high" }, {}])).toEqual({ high: 2, medium: 0, low: 1 })
  })
})
