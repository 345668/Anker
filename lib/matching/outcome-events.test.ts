import { describe, it, expect } from "vitest"
import { stageToOutcome } from "./outcome-events"

describe("stageToOutcome", () => {
  it("maps the contacted milestone from both vocabularies", () => {
    expect(stageToOutcome("contacted")).toBe("contacted")
  })

  it("maps reply milestones (crm 'responded' / lp 'responded' / 'replied')", () => {
    expect(stageToOutcome("responded")).toBe("replied")
    expect(stageToOutcome("replied")).toBe("replied")
  })

  it("maps commit milestones (committed, wired)", () => {
    expect(stageToOutcome("committed")).toBe("committed")
    expect(stageToOutcome("wired")).toBe("committed")
  })

  it("maps every pass/loss variant to declined", () => {
    expect(stageToOutcome("passed")).toBe("declined")   // crm vocabulary
    expect(stageToOutcome("declined")).toBe("declined")  // lp vocabulary
    expect(stageToOutcome("lost")).toBe("declined")      // lp vocabulary
  })

  it("returns null for intermediate / pre-outreach stages", () => {
    for (const s of ["queued", "identified", "researched", "meeting", "in_diligence", "diligence", "soft_circle"]) {
      expect(stageToOutcome(s)).toBeNull()
    }
  })

  it("is case-insensitive and null-safe", () => {
    expect(stageToOutcome("Committed")).toBe("committed")
    expect(stageToOutcome("CONTACTED")).toBe("contacted")
    expect(stageToOutcome(null)).toBeNull()
    expect(stageToOutcome(undefined)).toBeNull()
    expect(stageToOutcome("")).toBeNull()
  })
})
