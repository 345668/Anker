import { expect, it } from "vitest"
import { fillEmpty, startupReadiness, fundReadiness, runOptionsSchema, fundDraftSchema } from "./profile-readiness"
import { deckUploadError, MAX_DECK_BYTES } from "./deck-upload"
import { toFundProfile } from "./fund-profile"
import { scoreGeography } from "./v2/scoring"
it("keeps a blank form unready and requires the actual matching inputs", () => {
  expect(startupReadiness({}).map(i => i.field)).toEqual(expect.arrayContaining(["name", "stage", "location", "sectors", "askAmount"]))
  const startup = { name: "Company", stage: "seed", location: "Berlin", sectors: ["climate"], askAmount: 2000000 }
  expect(startupReadiness(startup)).toEqual([])
  expect(startupReadiness({ ...startup, checkSizeIdealMin: 200, checkSizeIdealMax: 100 })).toContainEqual({ field: "checkSizeIdealMax", label: "Valid maximum check" })
  expect(fundReadiness({ name: "Fund" })).toHaveLength(4)
})
it("preserves manual edits and zero metrics while ignoring empty extracted fields", () => {
  expect(fillEmpty({ name: "Manual", arr: 0, tags: [] as string[], location: "" }, { name: "AI", arr: 500, tags: [], location: "Berlin" })).toEqual({ name: "Manual", arr: 0, tags: [], location: "Berlin" })
})
it("rejects invalid economics, thresholds and unsupported uploads", () => {
  expect(runOptionsSchema.safeParse({ minScore: -1 }).success).toBe(false)
  expect(runOptionsSchema.safeParse({ maxFirms: 0 }).success).toBe(false)
  expect(fundDraftSchema.safeParse({ name: "Fund", targetRaise: 100, hardCap: 50 }).success).toBe(false)
  expect(deckUploadError([{ name: "deck.pptx", size: 100 }])).toContain("Export PowerPoint")
  expect(deckUploadError([{ name: "deck.pdf", size: MAX_DECK_BYTES + 1 }])).toContain("4 MB")
  expect(deckUploadError(Array.from({ length: 6 }, () => ({ name: "data.txt", size: 10 })))).toContain("five")
})
it("falls back from empty canonical arrays to legacy arrays and honors investment geography", () => {
  const fund = toFundProfile({ id: "f", name: "Fund", sectors: [], target_sectors: ["climate"], geographic_focus: ["Germany"], headquarters_location: "Singapore" })
  expect(fund.sectors).toEqual(["climate"])
  expect(scoreGeography("Berlin, Germany", fund)).toMatchObject({ points: 15, tag: "TARGET-GEO" })
})
