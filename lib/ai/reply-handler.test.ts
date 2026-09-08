import { describe, it, expect, vi } from "vitest"

// Force the heuristic path: provider === "none" means classifyAndDraftReply
// never calls generate(), so these tests are deterministic and offline.
vi.mock("./provider", () => ({
  resolveProvider: async () => "none",
  generate: async () => { throw new Error("generate() should not be called in heuristic tests") },
}))

import { classifyAndDraftReply, type ReplyContext } from "./reply-handler"

const MAX = 320
const CAL = "https://cal.com/anker/15min"

function ctx(over: Partial<ReplyContext["founder"]> = {}, reply = "yes, happy to talk — sounds good"): ReplyContext {
  return {
    partnerName: "Dana",
    partnerFirm: "Acme Ventures",
    partnerTitle: "Partner",
    ourOriginalDm: "Quick intro to Anker — an AI fundraising OS.",
    theirReply: reply,
    founder: { companyName: "Anker", oneLiner: "the AI fundraising OS", facts: ["47k investor graph"], ...over },
  }
}

describe("reply-handler booking-ask guarantee", () => {
  it("INTERESTED + calendar link → draft contains the link, marked scheduling, ≤320 chars", async () => {
    const r = await classifyAndDraftReply(ctx({ calendarUrl: CAL }))
    expect(r.classification).toBe("INTERESTED")
    expect(r.isScheduling).toBe(true)
    expect(r.bookingMethod).toBe("calendar_link")
    expect(r.draft).toContain(CAL)
    expect(r.draft.length).toBeLessThanOrEqual(MAX)
  })

  it("INTERESTED + no calendar link → draft proposes times, ≤320 chars", async () => {
    const r = await classifyAndDraftReply(ctx({ calendarUrl: undefined }))
    expect(r.classification).toBe("INTERESTED")
    expect(r.isScheduling).toBe(true)
    expect(r.bookingMethod).toBe("propose_times")
    expect(r.draft).not.toContain("[CAL_LINK]")
    expect(/\b(tue|wed|slot|time|afternoon)\b/i.test(r.draft)).toBe(true)
    expect(r.draft.length).toBeLessThanOrEqual(MAX)
  })

  it("protects the link when the body is long: link survives, still ≤320", async () => {
    const longFact = "x".repeat(400)
    const r = await classifyAndDraftReply(ctx({ calendarUrl: CAL, facts: [longFact] }))
    expect(r.draft).toContain(CAL)
    expect(r.draft.length).toBeLessThanOrEqual(MAX)
  })

  it("non-INTERESTED replies are not marked scheduling", async () => {
    const r = await classifyAndDraftReply(ctx({ calendarUrl: CAL }, "not a fit for us, we pass"))
    expect(r.classification).toBe("WRONG_FIT")
    expect(r.isScheduling).toBe(false)
  })
})
