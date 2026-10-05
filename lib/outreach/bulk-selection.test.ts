import { describe, it, expect } from "vitest"
import { parseBulkSelection, checkCount, MAX_BULK_SEND } from "./bulk-selection"

describe("a bulk send must say who it is for (docs/architecture/46 section 1.3, gap 2)", () => {
  it("an empty body no longer means everyone", () => {
    for (const body of [{}, undefined, null, { memberIds: [] }, { all: false }, { memberIds: "x" }, { memberIds: [1, 2] }]) expect(parseBulkSelection(body).kind).toBe("invalid")
  })
  it("names members explicitly, de-duplicated and capped", () => {
    expect(parseBulkSelection({ memberIds: ["a", "b", "a"] })).toEqual({ kind: "explicit", ids: ["a", "b"], preview: false })
    expect(parseBulkSelection({ memberIds: Array.from({ length: MAX_BULK_SEND + 1 }, (_, i) => `m${i}`) }).kind).toBe("invalid")
  })
  it("all needs the count the caller saw, unless it is only previewing", () => {
    expect(parseBulkSelection({ all: true }).kind).toBe("invalid")
    expect(parseBulkSelection({ all: true, expectedCount: "12" }).kind).toBe("invalid")
    expect(parseBulkSelection({ all: true, expectedCount: -1 }).kind).toBe("invalid")
    expect(parseBulkSelection({ all: true, expectedCount: 12 })).toEqual({ kind: "all", expectedCount: 12, preview: false })
    expect(parseBulkSelection({ all: true, preview: true })).toEqual({ kind: "all", expectedCount: null, preview: true })
  })
  it("refuses when the server's count differs from what was seen, or is over the cap", () => {
    expect(checkCount(12, 12)).toBeNull(); expect(checkCount(12, null)).toBeNull()
    expect(checkCount(13, 12)).toMatch(/saw 12 .* 13 are drafted/); expect(checkCount(0, 5)).toMatch(/saw 5/)
    expect(checkCount(MAX_BULK_SEND + 1, null)).toMatch(/more than/)
  })
})
