import { describe, it, expect } from "vitest"
import { renderDigestText, type FundDigest, type DigestDeadline } from "./compliance-digest"

function dl(over: Partial<DigestDeadline>): DigestDeadline {
  return {
    deadlineId: "d1", itemName: "Form ADV Annual Amendment", shortName: "ADV",
    category: "sec", dueDate: "2026-08-01", status: "upcoming",
    filingPortalUrl: null, daysUntilDue: 8, overdue: false, ...over,
  }
}

describe("renderDigestText", () => {
  it("leads with an overdue section when there are overdue items", () => {
    const fund: FundDigest = {
      fundId: "f1", fundSlug: "svs-ii", fundName: "SVS Fund II", adminEmailOverride: null,
      overdue: [dl({ itemName: "Form PF", dueDate: "2026-07-01", daysUntilDue: -23, overdue: true, status: "overdue" })],
      upcoming: [dl({})],
      total: 2,
    }
    const text = renderDigestText(fund, "https://app.example.com")
    expect(text).toMatch(/OVERDUE \(1\)/)
    expect(text).toMatch(/Form PF — due 2026-07-01 \(23d overdue\)/)
    expect(text).toMatch(/Due soon \(1\)/)
    expect(text).toContain("https://app.example.com/dashboard/portfolio/fund/compliance")
  })

  it("omits the overdue section entirely when nothing is overdue", () => {
    const fund: FundDigest = {
      fundId: "f1", fundSlug: "svs-ii", fundName: "SVS Fund II", adminEmailOverride: null,
      overdue: [], upcoming: [dl({ daysUntilDue: 0 })], total: 1,
    }
    const text = renderDigestText(fund, "")
    expect(text).not.toMatch(/OVERDUE/)
    expect(text).toMatch(/due today/)
  })

  it("names the fund in the admin-context footer", () => {
    const fund: FundDigest = {
      fundId: "f1", fundSlug: "s", fundName: "Acme Ventures", adminEmailOverride: null,
      overdue: [], upcoming: [dl({})], total: 1,
    }
    expect(renderDigestText(fund, "")).toContain("you're listed as an admin for Acme Ventures")
  })
})
