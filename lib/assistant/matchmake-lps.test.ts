import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
const m = vi.hoisted(() => ({ run: vi.fn(), resolve: vi.fn(), query: vi.fn(), save: vi.fn() }))
vi.mock("@/lib/matching/lp/service", () => {
  class LpMatchError extends Error { constructor(message: string, readonly status = 409, readonly missingFields?: unknown) { super(message) } }
  return { runLpMatch: m.run, resolveFundProfile: m.resolve, LpMatchError }
})
vi.mock("@/lib/db", () => ({ sql: Object.assign((s: TemplateStringsArray, ...v: unknown[]) => m.query(s.join("?"), v), { unsafe: m.query }) }))
vi.mock("./artifact", () => ({ saveArtifact: m.save }))
vi.mock("@/lib/matching/v2/xlsx-builder", () => ({ buildPipelineWorkbook: () => ({}), workbookToBuffer: () => Buffer.from("x") }))
import { matchmakeLps } from "./matchmake-lps"
import { LpMatchError } from "@/lib/matching/lp/service"

const vc = { userId: "u1", orgId: "org-1", persona: "vc", canWrite: true, readonly: false } as any
const row = { id: "fp1", name: "Fund II", target_raise: 40_000_000, headquarters_location: "Berlin", sectors: ["climate"], geographic_focus: ["united states"] }
const result = (over: any = {}) => ({
  result: {
    sessionId: "abcdef12-0000-0000-0000-000000000000", fundName: "Fund II",
    totals: { qualifiedFirms: 2, qualifiedContacts: 1, contactsWithEmail: 1, anchorCandidates: 1 },
    firms: [{ name: "Alpha FO", score: 81, tier: "champion", type: "Family Office", location: "NY", aumUsd: 5e8, whyThisLp: "fits" }, { name: "Beta FO", score: 60, tier: "priority_a", type: "Family Office", location: "LA", aumUsd: null, reasons: ["sector overlap"] }],
    contacts: [{ name: "Pat One", title: "Principal", score: 70, tier: "priority_a", type: "Family Office", location: "NY", emailVerified: true }],
    exclusions: { total: 3, inCrm: 2, declined: 1, saved: 0, alreadyYours: 0, suppressed: 0, jurisdiction: 0, source: 0, restrictedPerson: 0 }, ...over,
  },
  fund: { name: "Fund II" }, filters: {}, filterSummary: "US — Family office", exclusionSummary: "2 already in your CRM; 1 passed or declined",
})
beforeEach(() => { m.run.mockReset(); m.resolve.mockReset(); m.query.mockReset(); m.save.mockReset(); m.save.mockResolvedValue({ name: "LP_Pipeline_Fund_II.xlsx", url: "/api/artifacts/1", kind: "xlsx" }) })

describe("matchmake_lps", () => {
  it("needs a fund workspace and a member who can write", async () => {
    expect((await matchmakeLps({}, { ...vc, persona: "founder" })).observation).toMatch(/fund workspace/)
    expect((await matchmakeLps({}, undefined)).observation).toMatch(/fund workspace/)
    expect((await matchmakeLps({}, { ...vc, canWrite: false })).observation).toMatch(/read-only/)
    expect(m.run).not.toHaveBeenCalled()
  })
  it("runs the shared service on the workspace's saved profile and reports only what the saved run holds", async () => {
    m.resolve.mockResolvedValue(row); m.run.mockResolvedValue(result())
    const out = await matchmakeLps({ filters: { classes: ["family-office"], countries: ["US"] }, top: 2 }, vc)
    expect(m.run).toHaveBeenCalledWith({ orgId: "org-1", userId: "u1", source: "assistant" }, expect.objectContaining({ fundProfileId: "fp1", options: { enableAi: false }, mandate: expect.objectContaining({ countries: ["US"] }) }))
    expect(out.report).toContain("2 firms and 1 people qualified")
    expect(out.report).toContain("Left out before scoring: 2 already in your CRM; 1 passed or declined.")
    expect(out.report).toContain("1. Alpha FO — 81 (champion)")
    expect(out.report).toContain("AUM not in database")
    expect(out.report).toContain("run abcdef12")
    expect(out.artifact?.name).toBe("LP_Pipeline_Fund_II.xlsx")
  })
  it("says so when nothing was left out, and when the request differs from the saved profile it keeps the profile", async () => {
    m.resolve.mockResolvedValue(row); m.run.mockResolvedValue(result({ exclusions: { total: 0 } }))
    const out = await matchmakeLps({ fundName: "Fund III", targetRaiseUsd: 100_000_000 }, vc)
    expect(out.report).toContain("Nothing was left out by your rules.")
    expect(out.observation).toMatch(/saved fund profile "Fund II" was used/)
    expect(out.observation).toMatch(/name "Fund III"/)
  })
  it("asks for the missing fields when the workspace has no profile and does not invent them", async () => {
    m.resolve.mockResolvedValue(null)
    const out = await matchmakeLps({ fundName: "New Fund" }, vc)
    expect(out.observation).toMatch(/no fund profile yet/)
    expect(m.query).not.toHaveBeenCalled()
    expect(m.run).not.toHaveBeenCalled()
  })
  it("creates a profile from words when the five required fields are given, then runs", async () => {
    m.resolve.mockResolvedValue(null)
    m.query.mockResolvedValue([{ ...row, id: "new1", name: "New Fund" }])
    m.run.mockResolvedValue(result())
    const out = await matchmakeLps({ fundName: "New Fund", targetRaiseUsd: 40_000_000, sectors: ["climate"], geographicFocus: ["united states"], headquarters: "Berlin" }, vc)
    expect(m.query).toHaveBeenCalledTimes(1)
    expect(out.observation).toMatch(/profile "New Fund" was created from what the user said/)
    expect(m.run).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ fundProfileId: "new1" }))
  })
  it("passes a service refusal on to the user instead of running", async () => {
    m.resolve.mockResolvedValue(row)
    m.run.mockRejectedValue(new LpMatchError("Complete the required fund fields before matching.", 422, [{ label: "Investment geography" }]))
    const out = await matchmakeLps({}, vc)
    expect(out.observation).toMatch(/Complete the required fund fields.*Investment geography/)
  })
})
