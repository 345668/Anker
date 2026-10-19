import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { buildLpRules, describeExclusions, emptyExclusionCounts, emptyRuleData, countExclusion, type LpRuleData } from "./rules"

const base = (over: Partial<LpRuleData> = {}): LpRuleData => ({ ...emptyRuleData(), ...over })
const firm = (id: string, extra: any = {}) => ({ id, name: `Firm ${id}`, source: "folk", norm_country: "US", ...extra })
const person = (id: string, extra: any = {}) => ({ id, email: `${id}@x.com`, source: "folk", restricted_at: null, norm_country: "US", firm_id: null, name: `P ${id}`, ...extra })

describe("LP hard rules", () => {
  it("leaves out contact already made, but not a list that was only queued", () => {
    const rules = buildLpRules(base({ keys: new Map([["firm:1", "inCrm" as const]]) }))
    expect(rules.firm(firm("1"))).toBe("inCrm")
    expect(rules.firm(firm("2"))).toBeNull()
  })
  it("shows LPs already in the CRM when asked, but never those who passed or the fund already has", () => {
    const keys = new Map<string, any>([["firm:1", "inCrm"], ["firm:2", "declined"], ["firm:3", "saved"]])
    const rules = buildLpRules(base({ keys, includeKnown: true }))
    expect(rules.firm(firm("1"))).toBeNull()
    expect(rules.firm(firm("2"))).toBe("declined")
    expect(rules.firm(firm("3"))).toBe("saved")
  })
  it("covers the people of a firm that passed, but not the people of a firm that is merely in the CRM", () => {
    const rules = buildLpRules(base({ keys: new Map<string, any>([["firm:1", "declined"], ["firm:2", "inCrm"]]) }))
    expect(rules.person(person("a", { firm_id: "1" }))).toBe("declined")
    expect(rules.person(person("b", { firm_id: "2" }))).toBeNull()
  })
  it("removes suppressed addresses, existing investors by address and by name, and people who asked to be restricted", () => {
    const rules = buildLpRules(base({ emails: new Set(["s@x.com"]), yoursEmails: new Set(["mine@x.com"]), yoursNames: new Set(["acme capital"]) }))
    expect(rules.person(person("s", { email: "S@x.com" }))).toBe("suppressed")
    expect(rules.person(person("m", { email: "mine@x.com" }))).toBe("alreadyYours")
    expect(rules.firm(firm("9", { name: "Acme Capital" }))).toBe("alreadyYours")
    expect(rules.person(person("r", { restricted_at: new Date() }))).toBe("restrictedPerson")
  })
  it("applies the fund's excluded jurisdictions to firms and people", () => {
    const rules = buildLpRules(base({ excludedCountries: new Set(["DE"]) }))
    expect(rules.firm(firm("1", { norm_country: "de" }))).toBe("jurisdiction")
    expect(rules.person(person("1", { norm_country: "DE" }))).toBe("jurisdiction")
    expect(rules.firm(firm("2", { norm_country: "US" }))).toBeNull()
  })
  it("refuses a withdrawn source and a licence that does not list matching; allows an unreviewed or unregistered source", () => {
    const sources = new Map<string, any>([
      ["gone", { source: "gone", status: "withdrawn", permitted_use: [] }],
      ["narrow", { source: "narrow", status: "recorded", permitted_use: ["outreach_email"] }],
      ["fine", { source: "fine", status: "recorded", permitted_use: ["internal_matching"] }],
      ["new", { source: "new", status: "unreviewed", permitted_use: [] }],
    ])
    const rules = buildLpRules(base({ sources }))
    expect(rules.firm(firm("1", { source: "gone" }))).toBe("source")
    expect(rules.person(person("1", { source: "narrow" }))).toBe("source")
    for (const s of ["fine", "new", "never-registered", null]) expect(rules.firm(firm("2", { source: s }))).toBeNull()
  })
  it("a restricted vendor sample that lists matching is still usable for matching (its licence says so)", () => {
    const sources = new Map<string, any>([["drop", { source: "drop", status: "restricted", permitted_use: ["internal_matching"] }]])
    expect(buildLpRules(base({ sources })).firm(firm("1", { source: "drop" }))).toBeNull()
  })
  it("counts reasons and says them in words, only the ones that removed something", () => {
    const c = emptyExclusionCounts()
    countExclusion(c, "inCrm"); countExclusion(c, "inCrm"); countExclusion(c, "suppressed")
    expect(c.total).toBe(3)
    expect(describeExclusions(c)).toBe("2 already in your CRM; 1 suppressed addresses")
    expect(describeExclusions(emptyExclusionCounts())).toBe("")
  })
})
