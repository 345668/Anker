import { describe, expect, it } from "vitest"
import { checkEligibility, fitFor, rankFunds, scoreFit, type EntityFacts, type FundFacts } from "./fit"

type EntityOver = Omit<Partial<EntityFacts>, "interests"> & { interests?: Partial<EntityFacts["interests"]> }
const entity = (over: EntityOver = {}): EntityFacts => ({
  country: "Germany", taxResidence: null, category: "professional",
  ...over, interests: { stages: ["seed", "series a"], sectors: ["climate", "AI"], geographies: ["Europe"], ticketMin: 250_000, ticketMax: 1_000_000, horizonYears: 10, ...over.interests },
})
const fund = (over: Partial<FundFacts> = {}): FundFacts => ({
  fundId: "f1", name: "Alpha Fund", status: "raising", sectors: ["climate tech", "artificial intelligence"], stages: ["seed", "series a"], geographies: ["Europe", "North America"],
  minCommitment: 250_000, termYears: 10, rules: { categories: [], countries: [], excludedCountries: [], minTicket: null, professionalOnly: false }, ...over,
})

describe("eligibility: the fund's own rules against the entity", () => {
  it("is eligible when no rule stands in the way", () => expect(checkEligibility(entity(), fund())).toEqual({ status: "eligible", failed: [], unclear: [] }))
  it("a closed fund is ineligible", () => expect(checkEligibility(entity(), fund({ status: "closed" })).failed[0]).toBe("The fund is closed to new investors."))
  it("professional-only fails a semi-professional and is unclear for someone who has not said", () => {
    const rules = { categories: [], countries: [], excludedCountries: [], minTicket: null, professionalOnly: true }
    expect(checkEligibility(entity({ category: "semi_professional" }), fund({ rules })).failed[0]).toBe("The fund is for professional investors only, and you describe yourself as a semi-professional investor.")
    expect(checkEligibility(entity({ category: "unsure" }), fund({ rules })).status).toBe("unclear")
    expect(checkEligibility(entity({ category: null }), fund({ rules })).status).toBe("unclear")
    expect(checkEligibility(entity({ category: "professional" }), fund({ rules })).status).toBe("eligible")
  })
  it("named categories are checked, and read back in words", () => {
    const rules = { categories: ["professional", "semi_professional"] as any, countries: [], excludedCountries: [], minTicket: null, professionalOnly: false }
    expect(checkEligibility(entity({ category: "other" }), fund({ rules })).failed[0]).toBe("The fund accepts a professional investor and a semi-professional investor, and you describe yourself as another kind of investor.")
  })
  it("country rules: allowed list, excluded list, and unknown country is unclear not a pass", () => {
    const allow = { categories: [], countries: ["DE", "FR"], excludedCountries: [], minTicket: null, professionalOnly: false }
    expect(checkEligibility(entity({ country: "Germany" }), fund({ rules: allow })).status).toBe("eligible")
    expect(checkEligibility(entity({ country: "Brazil" }), fund({ rules: allow })).failed[0]).toBe("The fund takes investors from Germany and France, and your country is Brazil.")
    expect(checkEligibility(entity({ country: null }), fund({ rules: allow })).status).toBe("unclear")
    expect(checkEligibility(entity({ country: null, taxResidence: "France" }), fund({ rules: allow })).status).toBe("eligible")   // tax residence stands in
    const excl = { ...allow, countries: [], excludedCountries: ["DE"] }
    expect(checkEligibility(entity({ country: "Germany" }), fund({ rules: excl })).failed[0]).toBe("The fund does not take investors from Germany.")
  })
  it("the minimum: above the most you could invest fails, no stated ticket is unclear, and the fund's own minimum overrides the profile's", () => {
    expect(checkEligibility(entity({ interests: { ticketMax: 100_000 } }), fund()).failed[0]).toBe("The fund's minimum is $250K, above the most you say you could invest ($100K).")
    expect(checkEligibility(entity({ interests: { ticketMax: null } }), fund()).status).toBe("unclear")
    const f = fund({ minCommitment: 5_000_000, rules: { categories: [], countries: [], excludedCountries: [], minTicket: 100_000, professionalOnly: false } })
    expect(checkEligibility(entity({ interests: { ticketMax: 150_000 } }), f).status).toBe("eligible")
  })
  it("collects every failure, and a failure outranks an unclear", () => {
    const r = checkEligibility(entity({ category: "other", country: null }), fund({ status: "closed", rules: { categories: ["professional"], countries: ["DE"], excludedCountries: [], minTicket: null, professionalOnly: false } }))
    expect(r.status).toBe("ineligible"); expect(r.failed).toHaveLength(2); expect(r.unclear).toHaveLength(1)
  })
})

describe("fit: only what both sides state is judged", () => {
  it("a fund that matches everything scores 100 with high confidence and says why", () => {
    const r = scoreFit(entity(), fund())
    expect(r.score).toBe(100); expect(r.confidence).toBe("high"); expect(r.gaps).toEqual([])
    expect(r.reasons).toEqual(["Invests in Climate & cleantech and AI, which you look at", "Stage fits: seed and series-a", "Invests where you want to be exposed", "The $250K minimum fits your range", "The 10-year term fits your horizon"])
  })
  it("a fund that matches nothing scores low but is not hidden", () => {
    const r = scoreFit(entity(), fund({ sectors: ["real estate"], stages: ["late stage"], geographies: ["Asia"], minCommitment: 5_000_000, termYears: 15 }))
    expect(r.score).toBeLessThan(10)
    expect(r.factors.every((f) => f.judged)).toBe(true)
  })
  it("a thin listing is flagged low confidence and listed gaps, not punished", () => {
    const thin = scoreFit(entity(), fund({ sectors: [], stages: [], geographies: [], minCommitment: null, termYears: null }))
    expect(thin.score).toBeNull(); expect(thin.confidence).toBe("low")
    expect(thin.gaps).toEqual(["The fund does not state its sectors", "The fund does not state its stage", "The fund does not state where it invests", "The fund does not state a minimum", "The fund does not state its term"])
    const half = scoreFit(entity(), fund({ geographies: [], termYears: null }))     // sectors, stage, ticket stated: 75 of 100 judged
    expect(half.score).toBe(100); expect(half.confidence).toBe("high"); expect(half.gaps).toHaveLength(2)
    const some = scoreFit(entity(), fund({ sectors: [], stages: [], termYears: null }))  // geography and ticket: 35 judged
    expect(some.score).toBe(100); expect(some.confidence).toBe("low")
  })
  it("what the investor has not said is a gap too", () => {
    const r = scoreFit(entity({ interests: { sectors: [], stages: [], geographies: [], ticketMin: null, ticketMax: null, horizonYears: null } }), fund())
    expect(r.score).toBeNull()
    expect(r.gaps[0]).toBe("You have not said which sectors you look at")
  })
  it("stage: the next stage along earns half; geography: a fund investing globally covers any wish", () => {
    expect(scoreFit(entity({ interests: { stages: ["growth"] } }), fund({ stages: ["series c"] })).factors.find((f) => f.key === "stage")!.earned).toBe(10)
    expect(scoreFit(entity({ interests: { geographies: ["Japan"] } }), fund({ geographies: ["global"] })).factors.find((f) => f.key === "geography")!.earned).toBe(15)
  })
  it("ticket: the minimum at the top of the range earns most; horizon: a little short earns half", () => {
    expect(scoreFit(entity({ interests: { ticketMin: 50_000, ticketMax: 300_000 } }), fund({ minCommitment: 250_000 })).factors.find((f) => f.key === "ticket")!.earned).toBe(14)
    expect(scoreFit(entity({ interests: { horizonYears: 9 } }), fund({ termYears: 10 })).factors.find((f) => f.key === "horizon")!.earned).toBe(5)
  })
})

describe("ranking", () => {
  it("puts eligible funds first, then unclear, then ineligible, each by fit; unknown fit last; shows everything", () => {
    const funds = [
      fund({ fundId: "ineligible-best", name: "Z", status: "closed" }),
      fund({ fundId: "eligible-weak", name: "B", sectors: ["real estate"], stages: ["late stage"], geographies: ["Asia"], minCommitment: 250_000, termYears: 10 }),
      fund({ fundId: "eligible-best", name: "A" }),
      fund({ fundId: "unclear", name: "C", rules: { categories: ["professional"], countries: [], excludedCountries: [], minTicket: null, professionalOnly: false } }),
      fund({ fundId: "eligible-unknown", name: "D", sectors: [], stages: [], geographies: [], minCommitment: null, termYears: null }),
    ]
    const r = rankFunds(entity({ category: "unsure" }), funds)
    expect(r.map((x) => x.fundId)).toEqual(["eligible-best", "eligible-weak", "eligible-unknown", "unclear", "ineligible-best"])
  })
  it("reads the whole result as one sentence", () => {
    const r = fitFor(entity(), fund({ status: "closed" }))
    expect(r.sentence).toMatch(/Not open to you as things stand: The fund is closed to new investors\.$/)
    expect(fitFor(entity({ category: "unsure" }), fund({ rules: { categories: ["professional"], countries: [], excludedCountries: [], minTicket: null, professionalOnly: false } })).sentence).toMatch(/Open to you if: the fund limits who may invest by category/)
  })
})
