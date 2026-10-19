import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({ sql: () => [] }))
import { unzipSync, strFromU8 } from "fflate"
import { buildBundle } from "./bundle"
import { contactsCsv, firmsCsv, mapResult, slugify } from "./session-result"
import type { FundProfileV2, MatchingResultV2 } from "@/lib/matching/v2/types"

const session = { id: "s1", fund_profile_id: "fp1", fund_name: "Fund II", created_at: new Date("2026-10-19T10:00:00Z"), funnel_data: { firms: [], contacts: [] }, qualified_firms: 2, qualified_contacts: 1, exclusion_counts: { total: 2, inCrm: 2 } }
const firmRows = [
  { id: "m1", firm_id: "F1", firm_name: "Alpha, Family \"Office\"", firm_type: "Family Office", firm_location: "New York", firm_aum_usd: 5e8, firm_sectors: "climate, ai", score: "81.0", tier: "champion", tags: ["ANCHOR"], reasons: ["Sector overlap"], why_this_lp: "Family Office in New York.", segments: ["anchor"], stage: "identified", expected_ticket_usd: 7e6, gaps: [], confidence: "high" },
  { id: "m2", firm_id: "F2", firm_name: "=HYPERLINK(\"http://x\")", firm_type: "Family Office", firm_location: "", firm_aum_usd: null, firm_sectors: "", score: "55", tier: "priority_b", tags: [], reasons: [], why_this_lp: "x", segments: [], stage: "identified", expected_ticket_usd: null, gaps: ["AUM not in the directory", "Location not recorded"], confidence: "low" },
]
const contactRows = [{ id: "c1", investor_id: "I1", contact_name: "Pat One", contact_title: "Principal", contact_type: "Family Office", contact_location: "NY", contact_email: "pat@alpha.example", contact_linkedin: "", contact_sectors: "", score: "72", tier: "priority_a", tags: [], reasons: [], why_this_lp: "Principal in NY.", segments: [], stage: "identified", hnw_signals: [], gaps: [], confidence: "high" }]
const fund = { id: "fp1", name: "Fund II", targetRaise: 40_000_000, averageTicket: null, sectors: ["climate"], geographicFocus: ["united states"], headquartersLocation: "Berlin", thesisKeywords: [] } as FundProfileV2

describe("a run read back", () => {
  const result = mapResult(session, firmRows, contactRows)
  it("keeps what the run stored: score as a number, confidence, gaps, ticket, exclusions", () => {
    expect(result.firms[0]).toMatchObject({ firmId: "F1", score: 81, expectedTicket: 7e6, confidence: "high", isAnchor: true })
    expect(result.firms[1].gaps).toEqual(["AUM not in the directory", "Location not recorded"])
    expect(result.exclusions).toEqual({ total: 2, inCrm: 2 })
    expect(result.tierCounts.firms.champion).toBe(1)
  })
  it("firms CSV: header, rank first, stable key last, quotes doubled, formulas defused", () => {
    const lines = firmsCsv(result).trimEnd().split("\r\n")
    expect(lines[0]).toBe("rank,name,type,location,aum_usd,likely_cheque_usd,tier,score,confidence,why,not_known,stage,key")
    expect(lines[1]).toBe('1,"Alpha, Family ""Office""",Family Office,New York,500000000,7000000,champion,81,high,Family Office in New York.,,identified,firm:F1')
    expect(lines[2].startsWith("2,\"'=HYPERLINK(")).toBe(true)
    expect(lines[2].endsWith("AUM not in the directory; Location not recorded,identified,firm:F2") || lines[2].includes("AUM not in the directory; Location not recorded")).toBe(true)
    expect(lines[2].split(",").pop()).toBe("firm:F2")
  })
  it("people CSV carries the address (it is the workspace's own export) and the key", () => {
    const lines = contactsCsv(result).trimEnd().split("\r\n")
    expect(lines[0].endsWith(",key")).toBe(true)
    expect(lines[1]).toContain("pat@alpha.example")
    expect(lines[1].endsWith("contact:I1")).toBe(true)
  })
  it("names files from the fund", () => { expect(slugify("Winner Capital — Seed Fund II")).toBe("winner-capital-seed-fund-ii"); expect(slugify("???")).toBe("fund") })
})

describe("the zip", () => {
  it("holds the workbook, both CSV files, the methodology and the agenda, and the workbook opens", () => {
    const { name, bytes } = buildBundle(mapResult(session, firmRows, contactRows) as MatchingResultV2, fund)
    expect(name).toBe("fund-ii-lp-matching.zip")
    const files = unzipSync(bytes)
    expect(Object.keys(files).sort()).toEqual(["fund-ii-contacts.csv", "fund-ii-firms.csv", "fund-ii-lp-pipeline.xlsx", "fund-ii-meeting-agenda.md", "fund-ii-methodology.md"])
    expect(Array.from(files["fund-ii-firms.csv"].slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]) // a byte order mark, so a spreadsheet reads accents correctly
    expect(strFromU8(files["fund-ii-firms.csv"]).startsWith("rank,name")).toBe(true)
    expect(files["fund-ii-lp-pipeline.xlsx"].length).toBeGreaterThan(2000)
    expect(String.fromCharCode(files["fund-ii-lp-pipeline.xlsx"][0], files["fund-ii-lp-pipeline.xlsx"][1])).toBe("PK") // an xlsx is itself a zip
    expect(strFromU8(files["fund-ii-methodology.md"]).length).toBeGreaterThan(200)
  })
})
