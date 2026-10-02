import { describe, it, expect, vi, beforeEach } from "vitest"
vi.mock("server-only", () => ({}))

const m = vi.hoisted(() => ({
  latestProfile: vi.fn(), saveProfile: vi.fn(), saveRun: vi.fn(), run: vi.fn(), save: vi.fn(),
}))
vi.mock("@/lib/matching/v2/founder-runs", () => ({ latestProfile: m.latestProfile, saveProfile: m.saveProfile, saveRun: m.saveRun }))
vi.mock("@/lib/matching/v2/founder-engine", () => ({ runFounderMatching: m.run }))
vi.mock("@/lib/matching/v2/founder-xlsx", () => ({ buildFounderWorkbook: () => ({}), workbookToBuffer: () => Buffer.from("x") }))
vi.mock("./artifact", () => ({ saveArtifact: m.save }))

import { matchInvestors, normalizeStage, locationIsStated, checkRange, amountIsStated } from "./match-investors"
import { canUseTool, validateToolInput } from "./policy"

const founder = { userId: "u1", orgId: "org-1", persona: "founder", canWrite: true, readonly: false } as any
const DECK = "Acme Sports. The sports performance operating system. Headquartered in Columbus, Ohio. Raising $1M pre-seed."
const startup = { name: "Acme Sports", stage: "Pre-Seed", location: "Columbus, USA", sectors: ["sports tech", "vertical SaaS"], askAmount: 1_000_000, oneLiner: "Sports performance OS" }
const group = (n: number, score: number) => ({ firm: { name: `Firm ${n}`, score, tier: score >= 80 ? "champion" : "priority_a", type: "VC", location: "NY", whyMatch: "sector + stage fit", checkSizeMin: 250_000, checkSizeMax: 2_000_000 } })
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
  // Mirrors saveArtifact's naming: only [a-z0-9_-] survives.
  m.save.mockImplementation(async (_b: Buffer, base: string, kind: string) => ({ name: `${base.replace(/[^a-z0-9_-]+/gi, "_")}.${kind}`, url: "/api/artifacts/abc", kind }))
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
    const out = await matchInvestors({ startup, count: 50 }, founder, DECK)
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
    const out = await matchInvestors({ startup, count: 50 }, founder, DECK)
    expect(out.observation).toContain("31 firms ranked")
    expect(out.observation).toMatch(/Fewer than 50 firms cleared the minimum score/)
  })

  it("reports missing fields instead of running or inventing them", async () => {
    const out = await matchInvestors({ startup: { name: "Acme Sports", stage: "pre-seed" } }, founder, DECK)
    expect(m.run).not.toHaveBeenCalled()
    expect(out.observation).toMatch(/Cannot run matching yet/)
    expect(out.observation).toMatch(/Company location/)
    expect(out.observation).toMatch(/Round size/)
  })

  it("uses a saved profile only for the same startup", async () => {
    m.run.mockResolvedValue(result(5))
    m.latestProfile.mockResolvedValue({ id: "p", version: 3, fields: { name: "OtherCo", location: "Berlin", askAmount: 5_000_000, sectors: ["fintech"], stage: "seed", thesisKeywords: [] }, provenance: {} })
    const out = await matchInvestors({ startup: { name: "Acme Sports", stage: "pre-seed" } }, founder, DECK)
    expect(out.observation).toMatch(/Cannot run matching yet/)   // OtherCo's location and round size did not leak in
    m.latestProfile.mockResolvedValue({ id: "p", version: 3, fields: { name: "acme sports", location: "Columbus", askAmount: 1_000_000, sectors: ["sports"], stage: "pre-seed", thesisKeywords: [] }, provenance: { location: "typed" } })
    await matchInvestors({ startup: { name: "Acme Sports" } }, founder, "")
    expect(m.run).toHaveBeenCalledTimes(1)
  })

  it("needs a founder workspace", async () => {
    const out = await matchInvestors({ startup }, { ...founder, persona: "vc" }, DECK)
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

  it("refuses a location that is not written in the deck or the conversation, and asks instead", async () => {
    const out = await matchInvestors({ startup }, founder, "Acme Sports. Sports performance OS for coaches. Raising $1M pre-seed.")
    expect(m.run).not.toHaveBeenCalled()
    expect(out.observation).toMatch(/does not appear in the deck or in this conversation/)
    expect(out.observation).toMatch(/Ask the user where Acme Sports is headquartered/)
    expect(m.saveProfile).not.toHaveBeenCalled()
  })

  it("accepts a location the user typed in this conversation", async () => {
    m.run.mockResolvedValue(result(5))
    await matchInvestors({ startup }, founder, "We are based in Columbus. match me with 50 investors")
    expect(m.run).toHaveBeenCalledTimes(1)
  })

  it("trusts a saved location only when a person set it, never one a model took from a deck", async () => {
    m.run.mockResolvedValue(result(5))
    const fields = { name: "Acme Sports", location: "Columbus, USA", askAmount: 1_000_000, sectors: ["sports"], stage: "pre-seed", thesisKeywords: [] }
    m.latestProfile.mockResolvedValue({ id: "p", version: 2, fields, provenance: { location: "deck" } })
    const guessed = await matchInvestors({ startup: { name: "Acme Sports" } }, founder, "")
    expect(guessed.observation).toMatch(/does not appear/)
    expect(m.run).not.toHaveBeenCalled()
    m.latestProfile.mockResolvedValue({ id: "p", version: 2, fields, provenance: { location: "typed" } })
    await matchInvestors({ startup: { name: "Acme Sports" } }, founder, "")
    expect(m.run).toHaveBeenCalledTimes(1)
  })
})

describe("locationIsStated", () => {
  const src = "Acme Sports is headquartered in Columbus, Ohio. Offices in Berlin."
  it("matches whole words and only the first part of the place", () => {
    expect(locationIsStated("Columbus, OH", src)).toBe(true)
    expect(locationIsStated("Berlin, Germany", src)).toBe(true)
    expect(locationIsStated("Colum", src)).toBe(false)
    expect(locationIsStated("Paris", src)).toBe(false)
    expect(locationIsStated("", src)).toBe(false)
    expect(locationIsStated("Columbus", "")).toBe(false)
  })
  it("takes the usual ways of writing the United States, but not the pronoun", () => {
    expect(locationIsStated("United States", "A US-based startup, HQ in the USA")).toBe(true)
    expect(locationIsStated("USA", "Our HQ is in the United States")).toBe(true)
    expect(locationIsStated("United States", "Please send us the list")).toBe(false)
    expect(locationIsStated("US", "Please send us the list")).toBe(false)
  })
})

describe("the verified report", () => {
  it("carries the counts and the top 25 from the engine's own numbers", async () => {
    m.run.mockResolvedValue(result(50))
    const out = await matchInvestors({ startup, count: 50 }, founder, DECK)
    const r = out.report!
    expect(r).toContain("Investor matches for Acme Sports: 50 firms ranked (90 qualified in total)")
    expect(r).toContain("Tiers: Champion 3, Priority A 47")
    expect(r).toContain("Left out because they are already in your CRM, suppressed, passed or excluded: 3.")
    expect(r).toContain("Top 25")
    expect(r).toContain("1. Firm 1 — 90 · VC · NY · $250K–$2M")
    expect(r).toContain("25. Firm 25 — 66")
    expect(r).not.toContain("26. Firm 26")
    expect(r).toContain("Investor_Pipeline_Acme_Sports.xlsx")
    expect(out.observation).toMatch(/appended to your answer automatically; do not retype it/)
  })
  it("says so when fewer firms qualified than were asked for", async () => {
    m.run.mockResolvedValue(result(12))
    const out = await matchInvestors({ startup, count: 50 }, founder, DECK)
    expect(out.report).toContain("You asked for 50; only 12 cleared the minimum score")
    expect(out.report).toContain("Top 12")
  })
  it("formats check sizes, with either end missing", () => {
    expect(checkRange(500_000, 3_000_000)).toBe("$500K–$3M")
    expect(checkRange(25_000, 250_000)).toBe("$25K–$250K")
    expect(checkRange(null, 2_500_000)).toBe("up to $2.5M")
    expect(checkRange(100_000, null)).toBe("from $100K")
    expect(checkRange(null, null)).toBe("check size n/a")
  })
})

describe("the workbook's name", () => {
  it("strips accents to their letters, and the report names the file that was really saved", async () => {
    m.run.mockResolvedValue(result(5))
    const accented = { ...startup, name: "Caf\u00e9 \u014cra" }
    const out = await matchInvestors({ startup: accented }, founder, `${DECK.replace("Acme Sports", "Caf\u00e9 \u014cra")}`)
    expect(m.save.mock.calls[0][1]).toBe("Investor_Pipeline_Cafe Ora")
    expect(out.artifact?.name).toBe("Investor_Pipeline_Cafe_Ora.xlsx")
    expect(out.report).toContain("Full ranked list: Investor_Pipeline_Cafe_Ora.xlsx")
    expect(out.report).not.toContain("_ra.xlsx")
  })
})

describe("the tool's input contract", () => {
  it("requires the number of investors, so the model cannot silently fall back to 50", () => {
    expect(() => validateToolInput("match_investors", { startup: { name: "Acme Sports" } })).toThrow(/count is required/)
    expect(() => validateToolInput("match_investors", { startup: { name: "Acme Sports" }, count: 75 })).not.toThrow()
    expect(() => validateToolInput("match_investors", { startup: { name: "Acme Sports" }, count: 500 })).toThrow(/outside the allowed range/)
  })
})

describe("the founder's ideal check size", () => {
  const withIdeal = { ...startup, checkSizeIdealMin: 50_000, checkSizeIdealMax: 250_000 }
  it("is dropped when the model supplied it but nobody stated it, so the engine keeps its lead-size band", async () => {
    m.run.mockResolvedValue(result(5))
    const out = await matchInvestors({ startup: withIdeal }, founder, DECK)
    const profile = m.run.mock.calls[0][0]
    expect(profile.checkSizeIdealMin).toBeNull()
    expect(profile.checkSizeIdealMax).toBeNull()
    expect(out.observation).toMatch(/Ignored an ideal check size that is not stated/)
    expect(m.saveProfile.mock.calls[0][1]).not.toHaveProperty("checkSizeIdealMin")
  })
  it("is kept when the user or the deck states both amounts", async () => {
    m.run.mockResolvedValue(result(5))
    const out = await matchInvestors({ startup: withIdeal }, founder, `${DECK} We want checks between $50K and $250,000 each.`)
    const profile = m.run.mock.calls[0][0]
    expect(profile.checkSizeIdealMin).toBe(50_000)
    expect(profile.checkSizeIdealMax).toBe(250_000)
    expect(out.observation).not.toMatch(/Ignored an ideal check size/)
  })
  it("is not carried back in from a saved profile unless a person set it", async () => {
    m.run.mockResolvedValue(result(5))
    const fields = { name: "Acme Sports", location: "Columbus", askAmount: 1_000_000, sectors: ["sports"], stage: "pre-seed", thesisKeywords: [], checkSizeIdealMin: 50_000, checkSizeIdealMax: 250_000 }
    m.latestProfile.mockResolvedValue({ id: "p", version: 4, fields, provenance: { location: "typed", checkSizeIdealMin: "deck", checkSizeIdealMax: "deck" } })
    await matchInvestors({ startup: { name: "Acme Sports" } }, founder, DECK)
    expect(m.run.mock.calls[0][0].checkSizeIdealMin).toBeNull()
    m.run.mockClear()
    m.latestProfile.mockResolvedValue({ id: "p", version: 4, fields, provenance: { location: "typed", checkSizeIdealMin: "typed", checkSizeIdealMax: "typed" } })
    await matchInvestors({ startup: { name: "Acme Sports" } }, founder, DECK)
    expect(m.run.mock.calls[0][0].checkSizeIdealMin).toBe(50_000)
    expect(m.run.mock.calls[0][0].checkSizeIdealMax).toBe(250_000)
  })
})

describe("amountIsStated", () => {
  it("reads the usual ways of writing a dollar amount", () => {
    expect(amountIsStated(250_000, "checks of $250,000")).toBe(true)
    expect(amountIsStated(250_000, "up to 250K per deal")).toBe(true)
    expect(amountIsStated(250_000, "250000")).toBe(true)
    expect(amountIsStated(1_500_000, "raising $1.5M")).toBe(true)
    expect(amountIsStated(1_500_000, "raising 1.5 million dollars")).toBe(true)
    expect(amountIsStated(2_000_000, "a $2mm round")).toBe(true)
  })
  it("does not match inside a larger number, or when it is absent", () => {
    expect(amountIsStated(250_000, "a $1250K cheque")).toBe(false)
    expect(amountIsStated(250_000, "ARR of $2500000")).toBe(false)
    expect(amountIsStated(50_000, "raising $1.5M pre-seed")).toBe(false)
    expect(amountIsStated(0, "anything")).toBe(false)
    expect(amountIsStated(250_000, "")).toBe(false)
  })
})
