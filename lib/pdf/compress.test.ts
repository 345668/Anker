import { describe, it, expect } from "vitest"
import { LADDER, MAX_SIDE_PX, startStep, pageScale, isPdf } from "./compress"

describe("compression planning", () => {
  it("a file just over target starts gently; one far over skips the gentle rungs", () => {
    expect(startStep(30e6, 25e6)).toBe(0)
    expect(startStep(60e6, 25e6)).toBe(1)
    expect(startStep(100e6, 25e6)).toBe(2)
    expect(startStep(300e6, 25e6)).toBe(3)
    expect(startStep(300e6, 25e6)).toBeLessThan(LADDER.length)
  })
  it("the ladder only ever gets smaller", () => {
    for (let i = 1; i < LADDER.length; i++) { expect(LADDER[i].scale).toBeLessThan(LADDER[i - 1].scale); expect(LADDER[i].quality).toBeLessThan(LADDER[i - 1].quality) }
  })
  it("a poster-sized page is capped", () => {
    expect(pageScale(612, 792, LADDER[0])).toBe(LADDER[0].scale)
    const s = pageScale(3000, 2000, LADDER[0]); expect(3000 * s).toBeLessThanOrEqual(MAX_SIDE_PX + 1)
  })
  it("recognises PDFs by type or name", () => {
    expect(isPdf(new File([], "a.pdf", { type: "application/pdf" }))).toBe(true)
    expect(isPdf(new File([], "Deck.PDF"))).toBe(true)
    expect(isPdf(new File([], "a.pptx"))).toBe(false)
  })
})
