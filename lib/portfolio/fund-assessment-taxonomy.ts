/**
 * Fund-assessment taxonomy — the canonical 158-field structure.
 *
 * This file is the SINGLE SOURCE OF TRUTH for the fund-strength scoring
 * system shown in the assessment editor and (eventually) the interactive
 * radial wheel viz.  Every field belongs to exactly one Sub-category, every
 * Sub-category to exactly one Domain.  Each field carries:
 *   - a unique slug (used as the jsonb storage key)
 *   - an input type (drives the form widget)
 *   - a tier (critical / supporting / supplemental) — drives scoring weight
 *   - an importance (high / medium / low) — secondary weight modifier
 *
 * Some fields are `generated` (AI-drafted) or `computed` (derived from
 * other fields). The form treats them as read-only but lets the editor
 * trigger regeneration / recomputation.
 *
 * Total: 6 domains, 29 sub-categories, 158 fields.
 * Phase 1 stores values as jsonb on funds.assessment; future phases will
 * add a scoring engine, AI generation, and a radial wheel viewer.
 */

// ── shared types ────────────────────────────────────────────────────────

export type FieldTier = "critical" | "supporting" | "supplemental"

export type FieldImportance = "high" | "medium" | "low"

export type FieldInputType =
  | "text"
  | "long_text"        // multi-line free text
  | "number"
  | "years"
  | "percent"
  | "currency"
  | "select"
  | "yes_no"
  | "date"
  | "range"            // min/max pair (e.g. fund size 50M–100M)
  | "region"           // multi-select of regions/countries
  | "multiple"         // e.g. 1.5×, 2.0×
  | "ratio"            // e.g. 2:1 leverage
  | "generated"        // AI-drafted, stored as long text + meta
  | "computed"         // derived; never editable

export interface FieldDef {
  /** snake_case slug — used as the jsonb storage key. Must be unique
   *  across the whole taxonomy. */
  key: string
  label: string
  inputType: FieldInputType
  tier: FieldTier
  importance: FieldImportance
  /** Options for select-type fields. */
  options?: string[]
  /** Short helper text shown under the input. */
  hint?: string
  /** When a field is `computed`, this lists the field keys it depends on.
   *  Phase 2 scoring engine uses this. */
  derivedFrom?: string[]
}

export interface SubCategoryDef {
  key: string
  label: string
  fields: FieldDef[]
}

export interface DomainDef {
  key: string
  label: string
  subCategories: SubCategoryDef[]
}

// ── helpers ─────────────────────────────────────────────────────────────

function critical(key: string, label: string, inputType: FieldInputType, extra: Partial<FieldDef> = {}): FieldDef {
  return { key, label, inputType, tier: "critical", importance: "medium", ...extra }
}
function supporting(key: string, label: string, inputType: FieldInputType, extra: Partial<FieldDef> = {}): FieldDef {
  return { key, label, inputType, tier: "supporting", importance: "medium", ...extra }
}
function supplemental(key: string, label: string, inputType: FieldInputType, extra: Partial<FieldDef> = {}): FieldDef {
  return { key, label, inputType, tier: "supplemental", importance: "medium", ...extra }
}

// ── the taxonomy ────────────────────────────────────────────────────────

export const TAXONOMY: DomainDef[] = [
  // ─── TERMS & STRUCTURE ───────────────────────────────────────────────
  {
    key: "terms_structure",
    label: "Terms & Structure",
    subCategories: [
      {
        key: "timeline",
        label: "Timeline",
        fields: [
          critical("fund_term", "Fund Term", "years"),
          critical("investment_period", "Investment Period", "years"),
          supporting("extension_length", "Extension Length", "years"),
          supporting("number_of_extensions", "Number of Extensions", "number"),
        ],
      },
      {
        key: "distribution",
        label: "Distribution",
        fields: [
          critical("clawback_provision", "Clawback Provision", "yes_no"),
          critical("waterfall_type", "Waterfall Type", "select", {
            options: ["European (whole-fund)", "American (deal-by-deal)", "Modified European", "Hybrid"],
          }),
          supporting("clawback_escrow_rate", "Clawback Escrow Rate", "percent"),
          supporting("clawback_basis", "Clawback Basis", "select", {
            options: ["Pre-tax", "After-tax", "Hypothetical tax"],
          }),
          supporting("clawback_settlement_window", "Clawback Settlement Window", "number", { hint: "Days" }),
        ],
      },
      {
        key: "returns",
        label: "Returns",
        fields: [
          critical("target_hold_period", "Target Hold Period", "years"),
        ],
      },
      {
        key: "fees_carry",
        label: "Fees & Carry",
        fields: [
          critical("management_fee", "Management Fee", "percent", { importance: "high" }),
          critical("preferred_return", "Preferred Return", "percent"),
          critical("carried_interest", "Carried Interest", "percent", { importance: "low" }),
          supporting("fee_basis", "Fee Basis", "select", {
            options: ["Committed Capital", "Invested Capital", "NAV", "Step-down basis"],
          }),
          supporting("fee_offset_rate", "Fee Offset Rate", "percent"),
          supporting("catch_up_rate", "Catch-Up Rate", "percent"),
          supporting("fee_step_down_years", "Fee Step-Down Years", "years"),
          supporting("fee_step_down_rate", "Fee Step-Down Rate", "percent"),
          supplemental("organizational_expense_cap", "Organizational Expense Cap", "currency"),
          supplemental("management_fee_dollars", "Management Fee ($)", "computed", {
            derivedFrom: ["management_fee", "target_fund_size"],
          }),
          supplemental("carry_dollars", "Carry ($)", "computed", {
            derivedFrom: ["carried_interest", "target_fund_size"],
          }),
        ],
      },
      {
        key: "fund_size",
        label: "Fund Size",
        fields: [
          critical("target_fund_size", "Target Fund Size", "range"),
        ],
      },
      {
        key: "fund_structure",
        label: "Fund Structure",
        fields: [
          critical("fund_structure", "Fund Structure", "select", {
            options: ["Delaware LP", "Cayman LP", "Luxembourg SCSp", "BVI LP", "UK LP", "Other"],
          }),
          supplemental("recourse_indebtedness_limit", "Recourse Indebtedness Limit", "percent"),
          supplemental("leverage", "Leverage", "range"),
          supplemental("debt_interest_rate", "Debt Interest Rate", "percent"),
        ],
      },
      {
        key: "terms_investor_terms",
        label: "Investor Terms",
        fields: [
          supplemental("for_cause_gp_removal_threshold", "For-Cause GP Removal Threshold", "select", {
            options: ["Majority", "Two-thirds", "75%", "80%", "Supermajority"],
          }),
        ],
      },
      {
        key: "key_terms_protections",
        label: "Key Terms & Protections",
        fields: [
          supplemental("key_man_provision", "Key Man Provision", "yes_no"),
          supplemental("key_man_threshold", "Key Man Threshold", "text"),
          supplemental("no_fault_gp_removal_threshold", "No-Fault GP Removal Threshold", "select", {
            options: ["Majority", "Two-thirds", "75%", "80%", "Supermajority"],
          }),
        ],
      },
    ],
  },

  // ─── STRATEGY & MARKET ───────────────────────────────────────────────
  {
    key: "strategy_market",
    label: "Strategy & Market",
    subCategories: [
      {
        key: "narratives",
        label: "Narratives",
        fields: [
          critical("investment_philosophy", "Investment Philosophy", "generated"),
          critical("market_opportunity", "Market Opportunity", "generated"),
          critical("key_risks", "Key Risks", "generated", { importance: "low" }),
          critical("competitive_edge", "Competitive Edge", "generated"),
          supplemental("sourcing_pipeline", "Sourcing Pipeline", "long_text"),
        ],
      },
      {
        key: "strategy_returns",
        label: "Returns",
        fields: [
          critical("target_gross_irr", "Target Gross IRR", "percent"),
          critical("target_cash_yield", "Target Cash Yield", "percent"),
          critical("target_gross_moic", "Target Gross MOIC", "computed", {
            derivedFrom: ["target_gross_irr", "target_hold_period"],
          }),
        ],
      },
      {
        key: "classification",
        label: "Classification",
        fields: [
          critical("asset_class", "Asset Class", "select", {
            options: ["Venture Capital", "Growth Equity", "Private Equity", "Venture Studio", "Fund of Funds", "Secondaries"],
          }),
          critical("sub_asset_class", "Sub-Asset Class", "select", {
            options: ["Pre-Seed", "Seed", "Series A", "Series B", "Late Stage", "Buyout", "Mezzanine", "Distressed"],
          }),
          supplemental("gp_location", "GP Location", "text"),
        ],
      },
      {
        key: "market_focus",
        label: "Market Focus",
        fields: [
          critical("target_geography", "Target Geography", "region"),
          supplemental("sector_focus", "Sector Focus", "text"),
        ],
      },
      {
        key: "strategy",
        label: "Strategy",
        fields: [
          critical("strategy_summary", "Strategy Summary", "generated", { importance: "low" }),
          supplemental("value_creation_levers", "Value Creation Levers", "long_text"),
          supplemental("gp_supports_portfolio_companies", "GP Supports Portfolio Companies", "yes_no"),
          supplemental("investment_support_areas", "Investment Support Areas", "long_text"),
          supplemental("target_investment_stage", "Target Investment Stage", "select", {
            options: ["Pre-Seed", "Seed", "Series A", "Series B", "Series C+", "Growth", "Buyout"],
          }),
          supplemental("market_landscape", "Market Landscape", "generated"),
          supplemental("why_now", "Why Now", "generated"),
          supplemental("exit_assumptions", "Exit Assumptions", "generated"),
          supplemental("thesis_statement", "Thesis Statement", "generated"),
          supplemental("strategy_problem", "Strategy Problem", "generated"),
          supplemental("strategy_opportunity", "Strategy Opportunity", "generated"),
          supplemental("strategy_market_gap", "Strategy Market Gap", "generated"),
          supplemental("target_market_description", "Target Market Description", "generated"),
          supplemental("strategy_solution", "Strategy Solution", "generated"),
          supplemental("value_creation_strategies", "Value Creation Strategies", "generated"),
          supplemental("strategy_differentiation", "Strategy Differentiation", "generated"),
        ],
      },
      {
        key: "target_company_profile",
        label: "Target Company Profile",
        fields: [
          supplemental("board_representation_policy", "Board Representation Policy", "select", {
            options: ["Always take seat", "Observer rights", "Optional", "No board involvement"],
          }),
          supplemental("exit_strategy", "Exit Strategy", "select", {
            options: ["IPO", "Strategic acquisition", "Secondary sale", "Buyback", "Mixed"],
          }),
        ],
      },
      {
        key: "portfolio_construction",
        label: "Portfolio Construction",
        fields: [
          supplemental("follow_on_reserve_per_deal", "Follow-On Reserve / Deal (Multiple)", "multiple"),
          supplemental("graduation_rate_assumption", "Graduation Rate Assumption", "percent"),
          supplemental("lead_follow_strategy", "Lead / Follow Strategy", "select", {
            options: ["Lead only", "Follow only", "Both", "Opportunistic"],
          }),
          supplemental("portfolio_construction_method", "Portfolio Construction Method", "select", {
            options: ["Top-down", "Bottom-up", "Hybrid", "Power-law"],
          }),
          supplemental("pro_rata_rights_policy", "Pro-Rata Rights Policy", "select", {
            options: ["Always exercise", "Selective", "Never", "Case-by-case"],
          }),
          supplemental("signaling_risk_mitigation", "Signaling Risk Mitigation", "long_text"),
          supplemental("target_ownership_at_initial", "Target Ownership at Initial", "percent"),
        ],
      },
      {
        key: "identity",
        label: "Identity",
        fields: [
          supplemental("fund_name", "Fund Name", "text"),
          supplemental("tagline", "Tagline", "text"),
          supplemental("identity_status", "Status", "select", {
            options: ["Fundraising", "Active", "Harvesting", "Closed", "Wind-down"],
          }),
          supplemental("meeting_cta_button_text", "Meeting CTA Button Text", "text"),
          supplemental("meeting_booking_url", "Meeting Booking URL", "text"),
        ],
      },
    ],
  },

  // ─── OPERATIONS & REPORTING ──────────────────────────────────────────
  {
    key: "operations_reporting",
    label: "Operations & Reporting",
    subCategories: [
      {
        key: "reporting",
        label: "Reporting",
        fields: [
          critical("reporting_cadence", "Reporting Cadence", "select", {
            options: ["Monthly", "Quarterly", "Semi-annually", "Annually"],
          }),
        ],
      },
      {
        key: "follow_on_recycling",
        label: "Follow-On & Recycling",
        fields: [
          critical("follow_on_allowed", "Follow-On Allowed", "yes_no"),
          critical("follow_on_reserve_cap", "Follow-On Reserve Cap", "percent"),
          critical("follow_on_time_restriction", "Follow-On Time Restriction", "select", {
            options: ["No restriction", "Investment period only", "First 5 years", "First 7 years"],
          }),
          critical("capital_recycling_allowed", "Capital Recycling Allowed", "yes_no"),
        ],
      },
      {
        key: "deployment",
        label: "Deployment",
        fields: [
          critical("concentration_limit", "Concentration Limit", "percent"),
          critical("leverage_limit", "Leverage Limit", "ratio"),
          supporting("reserve_ratio", "Reserve Ratio", "percent"),
          supplemental("single_investment_leverage_limit", "Single Investment Leverage Limit", "percent", { importance: "high" }),
          supplemental("investment_size", "Investment Size", "range"),
          supplemental("target_enterprise_value", "Target Enterprise Value", "range"),
          supplemental("target_ownership", "Target Ownership", "range"),
          supplemental("sector_concentration_limit", "Sector Concentration Limit", "percent"),
        ],
      },
      {
        key: "governance",
        label: "Governance",
        fields: [
          critical("annual_audit_required", "Annual Audit Required", "yes_no"),
          supplemental("ic_vote_threshold", "IC Vote Threshold", "select", {
            options: ["Simple majority", "Two-thirds", "Unanimous", "Veto rights"],
          }),
          supplemental("lpac_selection_method", "LPAC Selection Method", "select", {
            options: ["By commitment size", "By LP nomination", "GP-appointed", "Hybrid"],
          }),
          supplemental("lpac_size", "LPAC Size", "number"),
          supplemental("aml_kyc_program", "AML/KYC Program", "yes_no"),
          supplemental("conflicts_of_interest_policy", "Conflicts of Interest Policy", "select", {
            options: ["LPAC approval required", "Disclosure only", "Prohibited", "Case-by-case"],
          }),
          supplemental("investment_committee_size", "Investment Committee Size", "number"),
          supplemental("lpa_amendment_threshold_fundamental", "LPA Amendment Threshold (Fundamental)", "percent"),
          supplemental("lpa_amendment_threshold_standard", "LPA Amendment Threshold (Standard)", "percent"),
          supplemental("lpac_rights", "LPAC Rights", "long_text"),
          supplemental("side_letter_policy", "Side Letter Policy", "select", {
            options: ["MFN for all LPs", "MFN for $X+ LPs", "No MFN", "Case-by-case"],
          }),
          supplemental("valuation_committee_exists", "Valuation Committee Exists", "yes_no"),
          supplemental("key_person_insurance_policy", "Key Person Insurance Policy", "yes_no"),
          supplemental("succession_plan_narrative", "Succession Plan Narrative", "long_text"),
        ],
      },
    ],
  },

  // ─── FUNDRAISING & INVESTORS ─────────────────────────────────────────
  {
    key: "fundraising_investors",
    label: "Fundraising & Investors",
    subCategories: [
      {
        key: "fundraising_distribution",
        label: "Distribution",
        fields: [
          critical("distribution_frequency", "Distribution Frequency", "select", {
            options: ["As realised", "Quarterly", "Semi-annually", "Annually", "At fund close"],
          }),
        ],
      },
      {
        key: "co_investment",
        label: "Co-Investment",
        fields: [
          critical("co_investment_allowed", "Co-Investment Allowed", "yes_no"),
        ],
      },
      {
        key: "fundraising",
        label: "Fundraising",
        fields: [
          critical("raising_type", "Raising Type", "select", {
            options: ["First close", "Subsequent close", "Final close", "Continuation"],
          }),
          critical("target_lp_type", "Target LP Type", "select", {
            options: ["Institutional", "Family office", "HNWI", "Fund of Funds", "Corporate", "Mixed"],
          }),
          supplemental("lp_commitment_minimum", "LP Commitment Minimum", "currency"),
          supplemental("raising_additional_capital", "Raising Additional Capital", "yes_no"),
          supplemental("has_foreign_investors", "Has Foreign Investors", "yes_no"),
        ],
      },
      {
        key: "fundraising_gp_commitment",
        label: "GP Commitment",
        fields: [
          critical("gp_commitment_pct", "GP Commitment (%)", "percent"),
          supplemental("gp_commitment_dollars", "GP Commitment ($)", "computed", {
            derivedFrom: ["gp_commitment_pct", "target_fund_size"],
          }),
        ],
      },
      {
        key: "fundraising_investor_terms",
        label: "Investor Terms",
        fields: [
          supplemental("minimum_investment", "Minimum Investment", "currency"),
        ],
      },
    ],
  },

  // ─── LEGAL & COMPLIANCE ──────────────────────────────────────────────
  {
    key: "legal_compliance",
    label: "Legal & Compliance",
    subCategories: [
      {
        key: "entity_structure",
        label: "Entity Structure",
        fields: [
          critical("fund_domicile", "Fund Domicile", "select", {
            options: ["Delaware", "Cayman Islands", "Luxembourg", "BVI", "UK", "Ireland", "Singapore", "Other"],
          }),
          critical("tax_blocker_vehicles", "Tax-Blocker Vehicles", "yes_no"),
          supplemental("fund_entity_name_legal", "Fund Entity Name (Legal)", "text"),
          supplemental("initial_closing_date", "Initial Closing Date", "date"),
          supplemental("final_closing_date", "Final Closing Date", "date"),
        ],
      },
      {
        key: "regulatory",
        label: "Regulatory",
        fields: [
          critical("offering_exemption", "Offering Exemption", "select", {
            options: ["Rule 506(b)", "Rule 506(c)", "Regulation S", "Regulation A+", "Other"],
          }),
          critical("ica_exclusion", "ICA Exclusion", "select", {
            options: ["3(c)(1)", "3(c)(7)", "Both", "Other"],
          }),
          supplemental("erisa_provision", "ERISA Provision", "long_text"),
          supplemental("adviser_registration_status", "Adviser Registration Status", "text"),
          supplemental("offered_to_fl_residents", "Offered to FL Residents", "yes_no"),
          supplemental("offered_to_nh_residents", "Offered to NH Residents", "yes_no"),
          supplemental("offered_to_pa_residents", "Offered to PA Residents", "yes_no"),
          supplemental("affiliate_services", "Affiliate Services", "generated"),
          supplemental("professional_long_term_relationships", "Professional Long-Term Relationships", "long_text"),
          supplemental("potential_third_party_conflicts", "Potential Third-Party Conflicts of Interest", "long_text"),
          supplemental("tax_distribution_policy", "Tax Distribution Policy", "yes_no"),
          supplemental("partnership_tax_classification", "Partnership Tax Classification", "select", {
            options: ["Partnership", "Disregarded entity", "Corporation"],
          }),
          supplemental("section_754_election_policy", "§754 Election Policy", "select", {
            options: ["Always", "On request", "Never", "Case-by-case"],
          }),
          supplemental("k1_delivery_target", "K-1 Delivery Target", "select", {
            options: ["March 15", "April 15", "June 15", "September 15"],
          }),
          supplemental("state_tax_withholding_policy", "State Tax Composite/Withholding Policy", "select", {
            options: ["Composite filing", "Withholding", "LP-by-LP", "Not applicable"],
          }),
          supplemental("tax_loss_allocation_policy", "Tax Loss Allocation Policy", "select", {
            options: ["Pro-rata", "Targeted", "Layer-cake", "Other"],
          }),
          supplemental("tax_reserves_policy", "Tax Reserves Policy", "long_text"),
          supplemental("qsbs_1202_policy", "QSBS §1202 Policy", "select", {
            options: ["Track and elect", "Track only", "Not tracked"],
          }),
          supplemental("carried_interest_3yr_holding", "Carried Interest 3-Year Holding (§1061)", "yes_no"),
        ],
      },
    ],
  },

  // ─── TEAM & TRACK RECORD ─────────────────────────────────────────────
  {
    key: "team_track_record",
    label: "Team & Track Record",
    subCategories: [
      {
        key: "key_persons",
        label: "Key Persons",
        fields: [
          critical("key_person_names", "Key Person Names", "long_text"),
          supporting("gp_managing_member", "GP Managing Member", "text"),
          supplemental("advisory_board_size", "Advisory Board Size", "number"),
          supplemental("firm_aum", "Firm AUM", "currency"),
          supplemental("senior_partners_count", "Senior Partners Count", "number", { importance: "low" }),
          supplemental("team_size", "Team Size", "number"),
          supplemental("years_as_team_avg", "Years As Team (Avg)", "years"),
          supplemental("team", "Team", "computed", {
            derivedFrom: ["team_size", "senior_partners_count", "years_as_team_avg"],
          }),
        ],
      },
      {
        key: "team_gp_commitment",
        label: "GP Commitment",
        fields: [
          supplemental("gp_commit_source", "GP Commit Source", "select", {
            options: ["Personal cash", "Management fee waiver", "Loan", "Mixed"],
          }),
          supplemental("gp_commit_vesting_years", "GP Commit Vesting Years", "years"),
        ],
      },
      {
        key: "experience",
        label: "Experience",
        fields: [
          supplemental("prior_fund_count", "Prior Fund Count", "number"),
          supplemental("prior_fund_gross_irr", "Prior Fund Gross IRR", "percent"),
          supplemental("prior_fund_net_irr", "Prior Fund Net IRR", "percent"),
          supplemental("prior_fund_gross_moic", "Prior Fund Gross MOIC", "multiple"),
          supplemental("prior_fund_net_moic", "Prior Fund Net MOIC", "multiple"),
          supplemental("prior_fund_dpi", "Prior Fund DPI", "multiple"),
          supplemental("track_record_attribution_basis", "Track Record Attribution Basis", "select", {
            options: ["Whole-fund", "Deal-by-deal", "Lead-deal only", "Pro-rata"],
          }),
          supplemental("prior_aggregate_fund_size", "Prior Aggregate Fund Size", "currency"),
          supplemental("institutional_background", "Institutional Background", "long_text"),
          supplemental("senior_team_avg_years", "Senior Team Avg Years", "years"),
          supplemental("realized_exits_count", "Realized Exits Count", "number"),
          supplemental("investment_manager_experience", "Investment Manager Experience", "generated"),
          supplemental("ic_experience", "IC Experience", "generated"),
          supplemental("deals", "Deals", "computed", {
            derivedFrom: ["realized_exits_count", "prior_fund_count"],
          }),
        ],
      },
    ],
  },
]

// ── derived indexes ─────────────────────────────────────────────────────

/** Flat list of every field def. Total: 158. */
export const ALL_FIELDS: FieldDef[] = TAXONOMY.flatMap((d) =>
  d.subCategories.flatMap((s) => s.fields),
)

/** Lookup by slug. */
export const FIELD_BY_KEY: Record<string, FieldDef> = Object.fromEntries(
  ALL_FIELDS.map((f) => [f.key, f]),
)

/** Reverse lookup: which sub-category does this field live in? */
export const SUBCATEGORY_BY_FIELD_KEY: Record<string, { domain: DomainDef; sub: SubCategoryDef }> = (() => {
  const m: Record<string, { domain: DomainDef; sub: SubCategoryDef }> = {}
  for (const d of TAXONOMY) {
    for (const s of d.subCategories) {
      for (const f of s.fields) m[f.key] = { domain: d, sub: s }
    }
  }
  return m
})()

/** Tier-weight default used by the phase-2 scoring engine. Tweakable. */
export const TIER_WEIGHT: Record<FieldTier, number> = {
  critical: 5,
  supporting: 3,
  supplemental: 1,
}

export const IMPORTANCE_MULTIPLIER: Record<FieldImportance, number> = {
  high: 1.5,
  medium: 1.0,
  low: 0.7,
}
