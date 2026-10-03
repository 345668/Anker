import { describe, expect, it } from "vitest"
import { resolveConflict as r, placeOf, linkedinKind } from "../scripts/resolve-import-conflicts.mjs"

describe("places", () => {
  it("reads state codes and state names as the US", () => {
    expect(placeOf("San Francisco, CA")).toEqual({ city: "san francisco", country: "us" })
    expect(placeOf("Wichita, Kansas, USA").country).toBe("us")
    expect(placeOf("United States")).toEqual({ city: null, country: "us" })
  })
})

describe("location conflicts", () => {
  it("one place written two ways is not a conflict", () => {
    expect(r("firm", "hq_location", "New York, United States", "New York, NY").action).toBe("same")
    expect(r("person", "location", "Pleasanton, United States", "Pleasanton, California").action).toBe("same")
    expect(r("firm", "hq_location", "Wichita, Kansas, USA", "Wichita, KS").action).toBe("same")
  })
  it("a country the directory knew becomes the city the sheet names, in that country only", () => {
    expect(r("person", "location", "United States", "Austin, TX")).toMatchObject({ action: "apply", value: "Austin, TX" })
    expect(r("person", "location", "United States", "London, UK").action).toBe("review")
  })
  it("a different city is a real disagreement", () => {
    expect(r("firm", "hq_location", "Seattle, United States", "Los Angeles, CA").action).toBe("review")
  })
})

describe("website conflicts", () => {
  it("the same site with or without www, scheme or path is the same", () => {
    expect(r("firm", "website", "https://www.kfw-capital.de/en/", "https://kfw-capital.de").action).toBe("same")
  })
  it("a tracking tail on the stored address is cleaned", () => {
    expect(r("firm", "website", "https://stepstoneglobal.com/?utm_source=x", "https://stepstoneglobal.com")).toMatchObject({ action: "apply", value: "https://stepstoneglobal.com" })
  })
  it("a placeholder is replaced; a different site is left", () => {
    expect(r("person", "website", "US", "3one4capital.com")).toMatchObject({ action: "apply" })
    expect(r("firm", "website", "https://timevc.capital/", "https://www.thetimeventures.com/").action).toBe("review")
  })
})

describe("linkedin conflicts", () => {
  it("never puts a person's profile on a firm", () => {
    expect(r("firm", "linkedin_url", "https://www.linkedin.com/company/acme/", "https://www.linkedin.com/in/jane-doe/").action).toBe("ignore")
  })
  it("a LinkedIn search link is a placeholder; the company page replaces it", () => {
    expect(r("firm", "linkedin_url", "https://www.linkedin.com/search/results/companies/?keywords=Acme", "linkedin.com/company/acme-capital?original=1"))
      .toMatchObject({ action: "apply", value: "https://www.linkedin.com/company/acme-capital/" })
  })
  it("the same company under a differently punctuated slug is the same", () => {
    expect(r("firm", "linkedin_url", "https://www.linkedin.com/company/mousse-partners", "linkedin.com/company/moussepartners").action).toBe("same")
  })
  it("a person's placeholder or company page gives way to their own profile", () => {
    expect(r("person", "linkedin_url", "View LinkedIn Profile", "https://www.linkedin.com/in/jane-doe")).toMatchObject({ action: "apply" })
    expect(r("person", "linkedin_url", "http://www.linkedin.com/company/acme", "https://www.linkedin.com/in/jane-doe")).toMatchObject({ action: "apply" })
  })
  it("reads kinds", () => {
    expect(linkedinKind("linkedin.com/in/x").kind).toBe("person")
    expect(linkedinKind("https://www.linkedin.com/company/x/").kind).toBe("company")
  })
})

describe("what a sheet never decides", () => {
  it("type, AUM, title and email differences stay for a person", () => {
    expect(r("firm", "type", "VC Firm", "Family Office").action).toBe("review")
    expect(r("firm", "type", "Private", "Family Office").action).toBe("apply")
    expect(r("firm", "aum", "$50M", "$1B+").action).toBe("review")
    expect(r("person", "title", "CEO and Founder", "Founder & Chief Executive Officer").action).toBe("review")
    expect(r("person", "email", "a@one.com", "a@two.com").action).toBe("review")
  })
})
