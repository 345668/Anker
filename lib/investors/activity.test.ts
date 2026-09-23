import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({ sql: Object.assign(async () => [], { unsafe: async () => [] }) }))
vi.mock("@/lib/ai/provider", () => ({ generate: vi.fn(async () => "{}") }))

import { findFirmActivity } from "./activity"
import { activityRecency } from "@/lib/matching/normalize/recency"
import { qualityScore } from "@/lib/matching/v2/founder-scoring"

const page = (html: string) => async () => ({ finalUrl: "https://fund.example/", body: Buffer.from(html), contentType: "text/html" })
const PORTFOLIO = `<html><body><main><h1>Sports Capital</h1>
  <p>Sports Capital backs pre-seed and seed founders building software for athletic performance, sports medicine and team operations across the United States. We write first checks of $250,000 to $1,000,000 and lead most of the rounds we join.</p>
  <p>In March 2026 we led the pre-seed round in Acme Athletics, our tenth investment in athlete performance.</p>
  <p>Our partners have spent two decades in college and professional sports, and we work with founders from the first hire through the Series A.</p>
  <p>We are long-term partners to founders, and we reserve capital for follow-on rounds in every company we back.</p></main></body></html>`

describe("findFirmActivity", () => {
  const firm = { id: "f1", name: "Sports Capital", website: "https://fund.example" }

  it("records a dated investment with the sentence and the page it came from", async () => {
    const r = await findFirmActivity(firm, {
      fetchPage: page(PORTFOLIO),
      ask: async () => JSON.stringify({ lastInvestmentAt: "2026-03-01", note: "Acme Athletics pre-seed", evidence: "In March 2026 we led the pre-seed round in Acme Athletics" }),
    })
    expect(r).toMatchObject({ lastInvestmentAt: "2026-03-01", note: "Acme Athletics pre-seed", reason: null })
    expect(r.sourceUrl).toBe("https://fund.example/")
  })

  it("refuses a date whose quote is not on the page", async () => {
    const r = await findFirmActivity(firm, {
      fetchPage: page(PORTFOLIO),
      ask: async () => JSON.stringify({ lastInvestmentAt: "2026-09-01", note: "Invented Corp", evidence: "In September 2026 we led the Series A in Invented Corp" }),
    })
    expect(r).toMatchObject({ lastInvestmentAt: null, reason: "the quoted evidence is not on the page" })
  })

  it.each([
    ["a future date", "2099-01-01"],
    ["an implausibly old date", "1998-01-01"],
    ["a month with no day", "2026-03"],
  ])("refuses %s", async (_label, date) => {
    const r = await findFirmActivity(firm, { fetchPage: page(PORTFOLIO), ask: async () => JSON.stringify({ lastInvestmentAt: date, evidence: "In March 2026 we led the pre-seed round in Acme Athletics" }) })
    expect(r.lastInvestmentAt).toBeNull()
  })

  it("says why when there is nothing to read", async () => {
    expect(await findFirmActivity({ ...firm, website: null })).toMatchObject({ reason: "no website on file" })
    const unreachable = await findFirmActivity(firm, { fetchPage: async () => { throw new Error("blocked") } })
    expect(unreachable.reason).toMatch(/site unreachable/)
  })
})

describe("recency in scoring", () => {
  const now = new Date("2026-09-23T00:00:00Z")
  const firmFacts = (activity: number | null) => ({
    kind: "firm" as const, sectors: { groups: [], verticals: [], horizontals: [], generalist: false, empty: true },
    stages: [], check: null, country: null, region: null, global: false, cls: "vc" as const, text: "",
    portfolioCount: 40, completeness: 1, activityRecency: activity,
  })

  it("maps dates to bands", () => {
    expect(activityRecency("2026-08-01", now)).toBe(1)
    expect(activityRecency("2025-09-01", now)).toBe(0.66)
    expect(activityRecency("2024-11-01", now)).toBe(0.33)
    expect(activityRecency("2020-01-01", now)).toBe(0)
    expect(activityRecency(null, now)).toBeNull()
  })

  it("leaves an unchecked firm exactly where it was, and prefers the active one", () => {
    const unchecked = qualityScore(firmFacts(null))
    const recent = qualityScore(firmFacts(1))
    const stale = qualityScore(firmFacts(0))
    expect(recent).toBeGreaterThan(unchecked)
    expect(stale).toBeLessThan(unchecked)
    expect(unchecked).toBeCloseTo(0.5 * Math.min(1, Math.log10(41) / 2) + 0.5)
  })
})
