import { describe, it, expect } from "vitest"
import { evaluateApplicability, type ComplianceProfile } from "./compliance"

function profile(overrides: Partial<ComplianceProfile> = {}): ComplianceProfile {
  return {
    registration_status: null, aum_range: null, fund_structure: null, fundraising_status: null,
    reg_d_exemption: null, investor_state_count: null, california_nexus: null, public_equity: null,
    cftc_activity: null, access_person_count: null, has_foreign_entities: null, has_foreign_investors: null,
    ...overrides,
  }
}

describe("evaluateApplicability", () => {
  it("returns needs_review for an unknown obligation id", () => {
    expect(evaluateApplicability("does-not-exist", profile()).result).toBe("needs_review")
  })

  it("defaults an unassessed profile to needs_review, not a false applies/not_applicable", () => {
    // Every conditional rule must fall through to needs_review on an empty
    // profile — silently defaulting either way would misreport obligations.
    for (const id of ["boi-report", "quarterly-disclosures", "cftc-exemption", "tax-1065", "fatca-crs"]) {
      expect(evaluateApplicability(id, profile()).result, id).toBe("needs_review")
    }
  })

  describe("boi-report (foreign entities)", () => {
    it("applies with foreign entities", () => {
      expect(evaluateApplicability("boi-report", profile({ has_foreign_entities: "yes" })).result).toBe("applies")
    })
    it("not applicable when all entities are US-formed", () => {
      expect(evaluateApplicability("boi-report", profile({ has_foreign_entities: "no" })).result).toBe("not_applicable")
    })
  })

  describe("registration-driven rules", () => {
    it("quarterly-disclosures applies to RIA and ERA, not to unregistered", () => {
      expect(evaluateApplicability("quarterly-disclosures", profile({ registration_status: "ria" })).result).toBe("applies")
      expect(evaluateApplicability("quarterly-disclosures", profile({ registration_status: "era" })).result).toBe("applies")
      expect(evaluateApplicability("quarterly-disclosures", profile({ registration_status: "not_registered" })).result).toBe("not_applicable")
    })
    it("privacy-notice applies only to RIA", () => {
      expect(evaluateApplicability("privacy-notice", profile({ registration_status: "ria" })).result).toBe("applies")
      expect(evaluateApplicability("privacy-notice", profile({ registration_status: "era" })).result).toBe("not_applicable")
    })
  })

  describe("cftc-exemption", () => {
    it("flags commodity activity with no exemption for review", () => {
      expect(evaluateApplicability("cftc-exemption", profile({ cftc_activity: "yes_no_exemption" })).result).toBe("needs_review")
    })
    it("applies when an exemption is filed, not applicable when there is no activity", () => {
      expect(evaluateApplicability("cftc-exemption", profile({ cftc_activity: "yes_with_exemption" })).result).toBe("applies")
      expect(evaluateApplicability("cftc-exemption", profile({ cftc_activity: "no" })).result).toBe("not_applicable")
    })
  })

  describe("partnership tax rules", () => {
    it("apply to LP / LLC-partnership structures", () => {
      expect(evaluateApplicability("tax-1065", profile({ fund_structure: "lp" })).result).toBe("applies")
      expect(evaluateApplicability("schedule-k1", profile({ fund_structure: "llc_partnership" })).result).toBe("applies")
    })
    it("do not apply to an LLC taxed as a corporation", () => {
      expect(evaluateApplicability("tax-1065", profile({ fund_structure: "llc_corp" })).result).toBe("not_applicable")
    })
  })

  describe("california nexus", () => {
    it("applies with a real nexus, not applicable when explicitly none", () => {
      expect(evaluateApplicability("ca-diversity", profile({ california_nexus: ["office"] })).result).toBe("applies")
      expect(evaluateApplicability("ca-diversity", profile({ california_nexus: ["none"] })).result).toBe("not_applicable")
    })
  })

  it("always monitors AML (effective date postponed), regardless of profile", () => {
    expect(evaluateApplicability("aml-program", profile()).result).toBe("monitor")
    expect(evaluateApplicability("aml-program", profile({ registration_status: "ria" })).result).toBe("monitor")
  })

  it("marks universally-required obligations as applies", () => {
    expect(evaluateApplicability("quarterly-financial-reporting", profile()).result).toBe("applies")
    expect(evaluateApplicability("annual-fund-audit", profile()).result).toBe("applies")
  })
})
