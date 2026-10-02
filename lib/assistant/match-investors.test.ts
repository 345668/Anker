import { describe, it, expect, vi, beforeEach } from "vitest"
vi.mock("server-only", () => ({}))

const m = vi.hoisted(() => ({
  latestProfile: vi.fn(), saveProfile: vi.fn(), saveRun: vi.fn(), run: vi.fn(), save: vi.fn(),
}))
vi.mock("@/lib/matching/v2/founder-runs", () => ({ latestProfile: m.latestProfile, saveProfile: m.saveProfile, saveRun: m.saveRun }))
vi.mock("@/lib/matching/v2/founder-engine", () => ({ runFounderMatching: m.run }))
vi.mock("@/lib/matching/v2/founder-xlsx", () => ({ buildFounderWorkbook: () => ({}), workbookToBuffer: () => Buffer.from("x") }))
vi.mock("./artifact", () => ({ saveArtifact: m.save }))

import { matchInvestors, normalizeStage } from "./match-investors"
import { canUseTool } from "./policy"

const founder = { userId: "u1", orgId: "org-1", persona: "founder", canWrite: true, readonly: false } as any
const startup = { name: "FYTT", stage: "Pre-Seed", location: "Columbus, USA", sectors: ["sports tech", "vertical SaaS"], askAmount: 1_000_000, oneLiner: "Sports performance OS" }
const group = (n: number, score: number) => ({ firm: { name: `Firm ${n}`, score, tier: score >= 80 ? "champion" : "priority_a", type: "VC", location: "NY", whyMatch: "sector + stage fit" } })
const result = (n: number) => ({
  engineVersion: "founder-v3", groups: Array.from({ length: n }, (_, i) => group(i + 1, 90 - i)),
  tierCounts: { firms: { champion: 3, priority_a: n - 3, priority_b: 0, prospect_c: 0 } }, totals: { qualifiedFirms: n },
  qualifiedBeforeCap: { groups: n + 40 }, exclusions: { inCrm: 2, suppressed: 1, declined: 0, excludedByFounder: 0, excludedTypes: 0 },
})

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset())
  m.latestProfile.mockResolvedValue(null)
  m.saveProfile.mockResolvedValue({ id: "spv_1", version: 1 })
  m.saveRun.mockResolvedValue({})
  m.save.mockResolvedValue({ name: "Investor_Pipeline_FYTT.xlsx", url: "/api/artifacts/abc", kind: "xlsx" })
})

describe("match_investors", () => {
  it("normalises stage spellings to the engine's keys", () => {
    expect(normalizeStage("Pre-Seed")).toBe("pre-seed")
    expect(normalizeStage("pre seed")).toBe("pre-seed")
    expect(normalizeStage("Series A")).toBe("series-a")
    expect(normalizeStage("nonsense")).toBeUndefined()
  })

  it("runs the engine for the workspace and returns one ranked workbook", async () => {
    m.run.mockResolvedValue(result(50))
    const out = await matchInvestors({ startup, count: 50 }, founder)
    expect(m.run).toHaveBeenCalledTimes(1)
    const [profile, opts] = m.run.mock.calls[0]
    expect(profile.stage).toBe("pre-seed")
    expect(opts).toMatchObject({ maxFirms: 50, maxContacts: 50, enableAi: false, verifyEmails: false, scope: { orgId: "org-1", userId: "u1" } })
    expect(m.saveRun).toHaveBeenCalledTimes(1)
    expect(out.artifact?.url).toBe("/api/artifacts/abc")
    expect(out.observation).toContain("50 firms ranked in ONE workbook")
    expect(out.observation).toContain("1. Firm 1")
  })

  it("is honest when fewer firms qualify than were asked for", async () => {
    m.run.mockResolvedValue(result(31))
    const out = await matchInvestors({ startup, count: 50 }, founder)
    expect(out.observation).toContain("31 firms ranked")
    expect(out.observation).toMatch(/Fewer than 50 firms cleared the minimum score/)
  })

  it("reports missing fields instead of running or inventing them", async () => {
    const out = await matchInvestors({ startup: { name: "FYTT", stage: "pre-seed" } }, founder)
    expect(m.run).not.toHaveBeenCalled()
    expect(out.observation).toMatch(/Cannot run matching yet/)
    expect(out.observation).toMatch(/Company location/)
    expect(out.observation).toMatch(/Round size/)
  })

  it("uses a saved profile only for the same startup", async () => {
    m.run.mockResolvedValue(result(5))
    m.latestProfile.mockResolvedValue({ id: "p", version: 3, fields: { name: "OtherCo", location: "Berlin", askAmount: 5_000_000, sectors: ["fintech"], stage: "seed", thesisKeywords: [] }, provenance: {} })
    const out = await matchInvestors({ startup: { name: "FYTT", stage: "pre-seed" } }, founder)
    expect(out.observation).toMatch(/Cannot run matching yet/)   // OtherCo's location and round size did not leak in
    m.latestProfile.mockResolvedValue({ id: "p", version: 3, fields: { name: "fytt", location: "Columbus", askAmount: 1_000_000, sectors: ["sports"], stage: "pre-seed", thesisKeywords: [] }, provenance: { location: "typed" } })
    await matchInvestors({ startup: { name: "FYTT" } }, founder)
    expect(m.run).toHaveBeenCalledTimes(1)
  })

  it("needs a founder workspace", async () => {
    const out = await matchInvestors({ startup }, { ...founder, persona: "vc" })
    expect(m.run).not.toHaveBeenCalled()
    expect(out.observation).toMatch(/founder workspace/)
  })

  it("is available to a founder who can write, and to no one else", () => {
    expect(canUseTool(founder, "match_investors")).toBe(true)
    expect(canUseTool({ ...founder, readonly: true }, "match_investors")).toBe(false)
    expect(canUseTool({ ...founder, canWrite: false }, "match_investors")).toBe(false)
    expect(canUseTool({ ...founder, persona: "vc" }, "match_investors")).toBe(false)
    expect(canUseTool({ ...founder, persona: "lp" }, "match_investors")).toBe(false)
  })
})
