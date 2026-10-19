import { describe, expect, it } from "vitest"
import { adjustment, DEFAULT_SETTINGS, emergingAppetite, emptyShadowContext, firmShadow, MAX_ADJUSTMENT, personShadow, proximity, recency, type FactorSettings } from "./shadow"

const NOW = Date.UTC(2026, 9, 19)
const ctx = (over: Partial<ReturnType<typeof emptyShadowContext>> = {}) => ({ ...emptyShadowContext(NOW), ...over })
const months = (n: number) => new Date(NOW - n * 30.44 * 24 * 3600 * 1000).toISOString()

describe("shadow factors", () => {
  it("recent activity fades with time and is unknown, not zero, when the directory has no date", () => {
    expect([recency(months(3), NOW), recency(months(18), NOW), recency(months(36), NOW), recency(months(80), NOW)]).toEqual([1, 0.6, 0.25, 0])
    expect(recency(null, NOW)).toBeNull()
    expect(recency("not a date", NOW)).toBeNull()
  })
  it("emerging-manager appetite reads the text, counts distinct phrases, and ignores a later fund", () => {
    expect(emergingAppetite("We back emerging managers and first-time funds across Europe.", 1)).toBe(1)
    expect(emergingAppetite("A family office that sometimes backs emerging managers.", 2)).toBe(0.5)
    expect(emergingAppetite("A family office investing in real estate and public equities worldwide.", 1)).toBe(0)
    expect(emergingAppetite("We back emerging managers and first-time funds.", 4)).toBeNull()   // fund IV: not the question
    expect(emergingAppetite("too short", 1)).toBeNull()
    expect(emergingAppetite(null, null)).toBeNull()
  })
  it("proximity takes the strongest relationship, and with no LinkedIn graph imported silence is unknown", () => {
    const base = { firmId: "F1", normalizedName: "alpha capital" }
    expect(proximity(base, ctx({ priorLpFirmIds: new Set(["F1"]) }))).toBe(1)
    expect(proximity({ ...base, email: "Pat@Alpha.com" }, ctx({ priorContactEmails: new Set(["pat@alpha.com"]) }))).toBe(1)
    expect(proximity(base, ctx({ warmFirmIds: new Set(["F1"]) }))).toBe(0.8)
    expect(proximity({ ...base, slug: "in/pat" }, ctx({ connectionSlugs: new Set(["in/pat"]) }))).toBe(0.9)
    expect(proximity({ ...base, slug: "in/pat" }, ctx({ connectionSlugs: new Set(), mutualTargets: new Set(["in/pat"]) }))).toBe(0.6)
    expect(proximity(base, ctx({ connectionsByFirm: new Map([["alpha capital", 1]]) }))).toBe(0.4)
    expect(proximity(base, ctx({ connectionsByFirm: new Map([["alpha capital", 3]]) }))).toBeCloseTo(0.7)
    expect(proximity(base, ctx({ connectionsByFirm: new Map([["alpha capital", 9]]) }))).toBe(0.7)       // capped
    expect(proximity(base, ctx({ connectionsByFirm: new Map([["other", 2]]) }))).toBe(0)                 // a graph exists and the firm is not in it
    expect(proximity(base, ctx())).toBeNull()                                                            // no graph: unknown
  })
  it("a firm's values: all four from its record", () => {
    const v = firmShadow({ firmId: "F1", normalizedName: "alpha capital", lastInvestmentAt: months(5), text: "We back emerging managers and first-time funds.", confidence: "medium" }, ctx({ fundNumber: 1, priorLpFirmIds: new Set(["F1"]) }))
    expect(v).toEqual({ recent_activity: 1, emerging_manager_appetite: 1, relationship_proximity: 1, data_confidence: 0.5 })
  })
  it("a person takes the firm's activity, uses their own words first, and their own connection", () => {
    const firm = { firmId: "F1", normalizedName: "alpha capital", lastInvestmentAt: months(30), text: "Backs emerging managers and first-time funds.", confidence: "high" as const }
    const v = personShadow({ investorId: "I1", email: "p@alpha.com", linkedinSlug: "in/pat", firm, text: "Real estate investor.", confidence: "low" }, ctx({ fundNumber: 1, connectionSlugs: new Set(["in/pat"]) }))
    expect(v).toEqual({ recent_activity: 0.25, emerging_manager_appetite: 0, relationship_proximity: 0.9, data_confidence: 0 })   // their own words say nothing about it, so it is 0, not the firm's
    const v2 = personShadow({ investorId: "I2", email: null, linkedinSlug: null, firm, text: null }, ctx({ fundNumber: 1 }))
    expect(v2.emerging_manager_appetite).toBe(1)                // no words of their own: the firm's
    expect(personShadow({ investorId: "I3", email: null, linkedinSlug: null, firm: null, text: null }, ctx()).recent_activity).toBeNull()
  })
  it("only promoted factors move the score, unknown values add nothing, and the total is capped", () => {
    const values = { recent_activity: 1, emerging_manager_appetite: null, relationship_proximity: 1, data_confidence: 0.5 }
    const shadowOnly = adjustment(values, DEFAULT_SETTINGS)
    expect(shadowOnly.points).toBe(0)
    expect(shadowOnly.detail.recent_activity).toEqual({ value: 1, weight: 6, applied: false })
    const some: FactorSettings = { ...DEFAULT_SETTINGS, relationship_proximity: { status: "promoted", weight: 8 }, data_confidence: { status: "promoted", weight: 4 }, emerging_manager_appetite: { status: "promoted", weight: 5 } }
    const a = adjustment(values, some)
    expect(a.points).toBe(10)                                    // 8 x 1 + 4 x 0.5; the unknown one adds nothing
    expect(a.detail.emerging_manager_appetite).toEqual({ value: null, weight: 5, applied: false })
    const all: FactorSettings = { recent_activity: { status: "promoted", weight: 15 }, emerging_manager_appetite: { status: "promoted", weight: 15 }, relationship_proximity: { status: "promoted", weight: 15 }, data_confidence: { status: "promoted", weight: 15 } }
    expect(adjustment({ recent_activity: 1, emerging_manager_appetite: 1, relationship_proximity: 1, data_confidence: 1 }, all).points).toBe(MAX_ADJUSTMENT)
    expect(adjustment(values, { ...some, relationship_proximity: { status: "retired", weight: 8 } }).points).toBe(2)
  })
})
