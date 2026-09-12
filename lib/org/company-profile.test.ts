import { it, expect } from "vitest"
import { companyMatchingDefaults, missingCompanyDetails } from "./company-profile"
it("copies company facts but leaves ambiguous stages and currencies for review", () => {
  const workspace = { name: "Northstar", settings: { profile: { summary: "Climate software", stage: "a", sectors: ["Climate"], geography: "Berlin", raiseTarget: "EUR 2m" } } }
  expect(companyMatchingDefaults(workspace)).toEqual({ name: "Northstar", oneLiner: "Climate software", stage: "", sectorsCsv: "Climate", location: "Berlin" })
  expect(missingCompanyDetails(workspace)).toEqual([])
  expect(missingCompanyDetails({ name: "Other", settings: {} })).toEqual(["Company summary", "Stage", "Sectors", "Location"])
})
