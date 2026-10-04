import { describe, it, expect } from "vitest"
import { cleanSlug } from "./slug"
import { notifySchema, wantsNotice } from "./model"

describe("cleanSlug", () => {
  it("folds accents, hyphenates, lowercases", () => expect(cleanSlug("  Müller & Söhne Capital! ")).toEqual({ slug: "muller-sohne-capital" }))
  it("refuses too short, too long, empty and reserved", () => {
    for (const bad of ["a", "", "-", "x".repeat(61), "admin", "API", "intake"]) expect("error" in cleanSlug(bad)).toBe(true)
  })
  it("keeps a good one as is", () => expect(cleanSlug("summit-venture-studio")).toEqual({ slug: "summit-venture-studio" }))
})

describe("wantsNotice", () => {
  it("defaults to Passed and Review, not Not a fit, and off means off", () => {
    const n = notifySchema.parse({})
    expect([wantsNotice(n, "passed"), wantsNotice(n, "review"), wantsNotice(n, "not_a_fit")]).toEqual([true, true, false])
    expect(wantsNotice({ ...n, onNew: false }, "passed")).toBe(false)
    expect(wantsNotice({ ...n, notAFit: true }, "not_a_fit")).toBe(true)
  })
})
