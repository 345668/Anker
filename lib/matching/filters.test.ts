import { it, expect, describe } from "vitest"
import {
  EMPTY_FILTERS, classesForPersona, describeFilters, filterParams, hasFilters, parseFilters,
} from "./filters"

/**
 * Doc: docs/architecture/26-matchmaking-filters.md
 *
 * These pin the contract an agent will drive later, so the cases that matter are
 * the boundaries: nothing said vs everything excluded, and junk in vs junk out.
 */

describe("parsing a mandate", () => {
  it("reads a mandate expressed in the platform's own vocabulary", () => {
    const f = parseFilters({ regions: ["north_america", "europe"], classes: ["vc", "angel", "family_office"] })
    expect(f.regions).toEqual(["north_america", "europe"])
    expect(f.classes).toEqual(["vc", "angel", "family_office"])
  })

  it("treats an absent mandate as unconstrained rather than as nothing matching", () => {
    for (const input of [undefined, null, {}, { regions: [] }]) {
      expect(hasFilters(parseFilters(input))).toBe(false)
    }
  })

  it("rejects a value outside the vocabulary instead of passing it to SQL", () => {
    // An agent that invents "usa" or "seed_fund" must not have it silently
    // reach a query; the whole mandate falls back to unconstrained.
    expect(parseFilters({ regions: ["usa"] })).toEqual(EMPTY_FILTERS)
    expect(parseFilters({ classes: ["seed_fund"] })).toEqual(EMPTY_FILTERS)
  })

  it("de-duplicates and upper-cases countries", () => {
    const f = parseFilters({ countries: ["us", "US", "gb"] })
    expect(f.countries).toEqual(["US", "GB"])
  })

  it("carries an exclusion separately from a selection", () => {
    const f = parseFilters({ excludeClasses: ["sovereign_wealth", "pe"] })
    expect(f.excludeClasses).toEqual(["sovereign_wealth", "pe"])
    expect(f.classes).toEqual([])
    expect(hasFilters(f)).toBe(true)
  })
})

describe("the SQL parameters", () => {
  // The predicate reads null as "no constraint". An empty array would mean
  // "match nothing", and the two must never collapse into each other — that is
  // the difference between the user saying nothing and the user excluding
  // everything.
  it("sends null, not an empty array, when nothing was chosen", () => {
    const p = filterParams(EMPTY_FILTERS)
    expect(p).toEqual({ regions: null, classes: null, countries: null, excludeClasses: null })
  })

  it("sends the chosen values when something was", () => {
    const p = filterParams(parseFilters({ regions: ["europe"], classes: ["family_office"] }))
    expect(p.regions).toEqual(["europe"])
    expect(p.classes).toEqual(["family_office"])
    expect(p.countries).toBeNull()
  })
})

describe("what each persona may choose from", () => {
  it("offers a founder the investors who back companies", () => {
    const c = classesForPersona("founder")
    expect(c).toContain("vc")
    expect(c).toContain("angel")
    expect(c).toContain("family_office")
    // A founder raising a round does not raise from a sovereign wealth fund.
    expect(c).not.toContain("sovereign_wealth")
  })

  it("offers a GP the allocators who back funds", () => {
    const c = classesForPersona("vc")
    expect(c).toContain("family_office")
    expect(c).toContain("fund_of_funds")
    expect(c).toContain("institutional")
    // ...and not an accelerator, which does not write LP cheques.
    expect(c).not.toContain("accelerator")
  })
})

describe("describing a mandate", () => {
  it("says so plainly when there is none", () => {
    expect(describeFilters(EMPTY_FILTERS)).toMatch(/whole directory/i)
  })

  it("renders labels a person can read, from keys a machine stores", () => {
    const s = describeFilters(parseFilters({ regions: ["north_america"], classes: ["family_office", "vc"] }))
    expect(s).toContain("North America")
    expect(s).toContain("Family office")
    expect(s).not.toContain("north_america")
  })

  it("names an exclusion as an exclusion", () => {
    expect(describeFilters(parseFilters({ excludeClasses: ["pe"] }))).toMatch(/excluding/i)
  })
})
