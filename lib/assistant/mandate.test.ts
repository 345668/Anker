import { describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("@/lib/matching/v2/founder-runs", () => ({}))
vi.mock("@/lib/matching/v2/founder-engine", () => ({}))
vi.mock("@/lib/matching/v2/founder-xlsx", () => ({}))
vi.mock("./artifact", () => ({}))
import { normalizeMandate } from "./match-investors"

describe("normalizeMandate", () => {
  it("maps a stated US + VC + sports mandate into engine terms", () => {
    const { filters, unread } = normalizeMandate({ countries: ["United States"], classes: ["VC funds"], sectors: ["sports"] })
    expect(unread).toEqual([])
    expect(filters.countries).toContain("US")
    expect(filters.classes.length).toBe(1)
    expect(filters.sectors.length).toBe(1)
  })
  it("reports a term it cannot read instead of dropping the whole mandate", () => {
    const { filters, unread } = normalizeMandate({ countries: ["US"], sectors: ["zzzz-nonsense"] })
    expect(filters.countries).toContain("US")
    expect(unread.join(" ")).toContain("zzzz-nonsense")
  })
  it("no mandate means no filters", () => {
    expect(normalizeMandate(undefined).unread).toEqual([])
  })
})
