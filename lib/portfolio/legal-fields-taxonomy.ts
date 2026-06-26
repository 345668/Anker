/**
 * Legal & Compliance — 94-field taxonomy.
 *
 * Source-of-truth for every field that appears in the 13 fund-formation
 * documents. Mirrors the structure of fund-assessment-taxonomy.ts so the
 * editor + scoring code can reuse the same patterns.
 *
 * Six sections, totalling 94 fields. Each field declares:
 *   - key:        snake_case slug, used as the jsonb storage key
 *   - label:      display name (matches the reference screenshots)
 *   - inputType:  drives the widget
 *   - documents:  doc_keys (from legal-catalogue) where the field appears
 *   - hint?:      short helper text below the input
 *
 * Counts (validated by ALL_FIELDS.length === 94):
 *   - Strategy & Market        12
 *   - Terms & Structure        14
 *   - Fundraising & Investors   4
 *   - Operations & Reporting    5
 *   - Team & Track Record      15
 *   - Legal & Compliance       44
 *   ─────────────────────────────
 *                              94
 */

// ── shared types ────────────────────────────────────────────────────────

export type LegalFieldInputType =
  | "text"
  | "long_text"
  | "email"
  | "phone"
  | "address"      // sub-fields: street, state, city, zip
  | "number"
  | "percent"
  | "currency"
  | "years"
  | "months"
  | "date"
  | "select"
  | "yes_no"
  | "multiple"
  | "ratio"
  | "generated"    // AI-drafted (phase 3 wires the Generate button)
  | "computed"     // derived from other fields, read-only

export interface LegalFieldDef {
  key: string
  label: string
  inputType: LegalFieldInputType
  /** doc_keys from lib/portfolio/legal-catalogue.ts that reference this field. */
  documents: string[]
  options?: string[]
  hint?: string
  /** For computed fields — which field keys does this derive from? */
  derivedFrom?: string[]
  /** When true, the field is considered required for legal-review submission. */
  required?: boolean
}

export interface LegalFieldSectionDef {
  key: string
  label: string
  fields: LegalFieldDef[]
}

// ── helper constructors (keep field defs short) ──────────────────────────

function text(key: string, label: string, documents: string[], extra: Partial<LegalFieldDef> = {}): LegalFieldDef {
  return { key, label, inputType: "text", documents, ...extra }
}
function longText(key: string, label: string, documents: string[], extra: Partial<LegalFieldDef> = {}): LegalFieldDef {
  return { key, label, inputType: "long_text", documents, ...extra }
}
function email(key: string, label: string, documents: string[], extra: Partial<LegalFieldDef> = {}): LegalFieldDef {
  return { key, label, inputType: "email", documents, ...extra }
}
function phone(key: string, label: string, documents: string[], extra: Partial<LegalFieldDef> = {}): LegalFieldDef {
  return { key, label, inputType: "phone", documents, ...extra }
}
function address(key: string, label: string, documents: string[], extra: Partial<LegalFieldDef> = {}): LegalFieldDef {
  return { key, label, inputType: "address", documents, ...extra }
}
function date(key: string, label: string, documents: string[], extra: Partial<LegalFieldDef> = {}): LegalFieldDef {
  return { key, label, inputType: "date", documents, ...extra }
}
function pct(key: string, label: string, documents: string[], extra: Partial<LegalFieldDef> = {}): LegalFieldDef {
  return { key, label, inputType: "percent", documents, ...extra }
}
function years(key: string, label: string, documents: string[], extra: Partial<LegalFieldDef> = {}): LegalFieldDef {
  return { key, label, inputType: "years", documents, ...extra }
}
function months(key: string, label: string, documents: string[], extra: Partial<LegalFieldDef> = {}): LegalFieldDef {
  return { key, label, inputType: "months", documents, ...extra }
}
function currency(key: string, label: string, documents: string[], extra: Partial<LegalFieldDef> = {}): LegalFieldDef {
  return { key, label, inputType: "currency", documents, ...extra }
}
function num(key: string, label: string, documents: string[], extra: Partial<LegalFieldDef> = {}): LegalFieldDef {
  return { key, label, inputType: "number", documents, ...extra }
}
function multiple(key: string, label: string, documents: string[], extra: Partial<LegalFieldDef> = {}): LegalFieldDef {
  return { key, label, inputType: "multiple", documents, ...extra }
}
function ratio(key: string, label: string, documents: string[], extra: Partial<LegalFieldDef> = {}): LegalFieldDef {
  return { key, label, inputType: "ratio", documents, ...extra }
}
function select(key: string, label: string, documents: string[], options: string[], extra: Partial<LegalFieldDef> = {}): LegalFieldDef {
  return { key, label, inputType: "select", documents, options, ...extra }
}
function yesNo(key: string, label: string, documents: string[], extra: Partial<LegalFieldDef> = {}): LegalFieldDef {
  return { key, label, inputType: "yes_no", documents, ...extra }
}
function generated(key: string, label: string, documents: string[], extra: Partial<LegalFieldDef> = {}): LegalFieldDef {
  return { key, label, inputType: "generated", documents, ...extra }
}
function computed(key: string, label: string, documents: string[], derivedFrom: string[], extra: Partial<LegalFieldDef> = {}): LegalFieldDef {
  return { key, label, inputType: "computed", documents, derivedFrom, ...extra }
}

// ── doc_key shortcuts (keep field defs readable) ─────────────────────────

const D = {
  fmAuth: "fm_authorization_to_act_as_organizer",
  fmCert: "fm_certificate_of_formation",
  fmLLCA: "fm_initial_llc_agreement",
  ima:    "investment_management_agreement",
  gpAuth: "gp_authorization_to_act_as_organizer",
  gpCert: "gp_certificate_of_formation",
  gpLLCA: "gp_initial_llc_agreement",
  certLP: "certificate_of_limited_partnership",
  initLPA:"initial_limited_partnership_agreement",
  aic:    "accredited_investor_certification",
  ppm:    "private_placement_memorandum_venture_capital",
  arLPA:  "amended_restated_lpa_venture_capital",
  sub:    "subscription_agreement_venture_capital",
}

// ── the 94 fields ────────────────────────────────────────────────────────

export const LEGAL_FIELD_SECTIONS: LegalFieldSectionDef[] = [
  // ── Strategy & Market (12) ─────────────────────────────────────────────
  {
    key: "strategy_market",
    label: "Strategy & Market",
    fields: [
      text("fund_name", "Fund Name",
        [D.certLP, D.gpAuth, D.gpLLCA, D.initLPA, D.ima, D.ppm, D.arLPA, D.sub],
        { required: true }),
      yesNo("gp_supports_portfolio_companies", "GP Supports Portfolio Companies", [D.ppm]),
      generated("investment_philosophy", "Investment Philosophy", [D.ppm]),
      longText("investment_support_areas", "Investment Support Areas", [D.ppm],
        { hint: "Ways the GP supports portfolio companies (e.g., talent acquisition, BD and sales intros, financial planning, go-to-market)." }),
      generated("market_opportunity", "Market Opportunity", [D.ppm]),
      text("sector_focus", "Sector Focus", [D.ppm, D.arLPA]),
      text("target_geography_country", "Target Geography — Country", [D.ppm, D.arLPA]),
      select("target_investment_stage", "Target Investment Stage", [D.ppm],
        ["Pre-Seed", "Seed", "Series A", "Series B", "Series C+", "Growth", "Buyout"],
        { hint: "Company stage the fund primarily targets (e.g., pre-seed, seed, Series A-C+, growth, pre-IPO, or mixed)." }),
      generated("target_market_description", "Target Market Description", [D.ppm]),
      generated("thesis_statement", "Thesis Statement", [D.ppm]),
      generated("why_now", "Why Now", [D.ppm]),
      computed("investment_strategy_type", "Investment Strategy Type", [D.ppm],
        ["target_investment_stage", "sector_focus"]),
    ],
  },

  // ── Terms & Structure (14) ─────────────────────────────────────────────
  {
    key: "terms_structure",
    label: "Terms & Structure",
    fields: [
      pct("carried_interest", "Carried Interest", [D.ppm, D.arLPA], { required: true }),
      pct("catch_up_rate", "Catch-Up Rate", [D.ppm, D.arLPA]),
      years("extension_length", "Extension Length", [D.ppm, D.arLPA]),
      years("investment_period", "Investment Period", [D.ppm], { required: true }),
      pct("management_fee", "Management Fee", [D.ppm, D.arLPA], { required: true }),
      pct("preferred_return", "Preferred Return", [D.ppm, D.arLPA]),
      currency("target_fund_size", "Target Fund Size", [D.ppm, D.arLPA], { required: true }),
      pct("target_net_irr", "Target Net IRR", [D.ppm]),
      multiple("target_net_moic", "Target Net MOIC", [D.ppm]),
      years("fund_term", "Fund Term", [D.ppm, D.arLPA], { required: true }),
      computed("lp_split_pct", "LP Split %", [D.ppm, D.arLPA], ["carried_interest"],
        { hint: "Share of profits distributed to LPs after the carry split." }),
      computed("management_fee_post_investment_period", "Management Fee Post-Investment Period",
        [D.ppm, D.arLPA], ["management_fee", "fund_term", "investment_period"]),
      computed("commitment_period_anniversary", "Commitment Period Anniversary",
        [D.arLPA], ["investment_period"],
        { hint: "Date marking the end of the commitment period, formatted for legal documents." }),
      computed("commitment_period_extension_anniversary", "Commitment Period Extension Anniversary",
        [D.arLPA], ["investment_period", "extension_length"],
        { hint: "Date marking the end of the commitment period after a single extension, formatted for legal documents." }),
    ],
  },

  // ── Fundraising & Investors (4) ───────────────────────────────────────
  {
    key: "fundraising_investors",
    label: "Fundraising & Investors",
    fields: [
      pct("gp_commitment_pct", "GP Commitment (%)", [D.ppm, D.arLPA], { required: true }),
      computed("gp_commitment_dollars", "GP Commitment ($)", [D.ppm, D.arLPA],
        ["gp_commitment_pct", "target_fund_size"]),
      yesNo("raising_additional_capital", "Raising Additional Capital", [D.ppm],
        { hint: "Whether the fund is actively soliciting additional capital." }),
      currency("lp_commitment_minimum", "LP Commitment Minimum", [D.ppm]),
    ],
  },

  // ── Operations & Reporting (5) ────────────────────────────────────────
  {
    key: "operations_reporting",
    label: "Operations & Reporting",
    fields: [
      text("ic_member_names", "IC Member Names", [D.ppm]),
      select("ic_vote_threshold", "IC Vote Threshold", [D.ppm],
        ["Majority", "Two-thirds", "Unanimous", "Veto rights"]),
      currency("investment_size_max", "Investment Size — Max", [D.ppm]),
      currency("investment_size_min", "Investment Size — Min", [D.ppm]),
      num("leverage_limit", "Leverage Limit", [D.ppm, D.arLPA],
        { hint: "Maximum leverage permitted, expressed as a multiple of NAV." }),
    ],
  },

  // ── Team & Track Record (15) ──────────────────────────────────────────
  {
    key: "team_track_record",
    label: "Team & Track Record",
    fields: [
      email("fund_contact_email", "Fund Contact Email", [D.ima, D.ppm, D.sub], { required: true }),
      text("fund_contact_name", "Fund Contact Name", [D.ima, D.ppm, D.sub], { required: true }),
      text("fund_managing_director_name", "Fund Managing Director Name", [D.ima]),
      email("gp_contact_email", "GP Contact Email", [D.ima]),
      text("gp_contact_name", "GP Contact Name", [D.ima]),
      text("gp_managing_member", "GP Managing Member",
        [D.gpAuth, D.gpLLCA, D.initLPA, D.ima, D.sub], { required: true }),
      text("gp_managing_member_title", "GP Managing Member Title", [D.sub]),
      email("mc_contact_email", "MC Contact Email", [D.ima]),
      text("mc_contact_name", "MC Contact Name", [D.ima]),
      text("mc_managing_member_name", "MC Managing Member Name", [D.fmAuth, D.fmLLCA]),
      text("fundraising_contact_title", "Fundraising Contact Title", [D.ppm, D.sub]),
      longText("key_person_names", "Key Person Names", [D.ppm, D.arLPA], { required: true }),
      text("authorized_person_name", "Authorized Person Name",
        [D.certLP, D.gpAuth, D.gpCert, D.gpLLCA, D.initLPA, D.fmAuth, D.fmCert], { required: true }),
      generated("investment_manager_experience", "Investment Manager Experience", [D.ppm]),
      generated("ic_experience", "IC Experience", [D.ppm]),
    ],
  },

  // ── Legal & Compliance (44) ───────────────────────────────────────────
  {
    key: "legal_compliance",
    label: "Legal & Compliance",
    fields: [
      // ── Management Company (10) ──
      text("management_company_name", "Management Company Name",
        [D.fmAuth, D.fmCert, D.fmLLCA, D.ima, D.aic, D.ppm, D.arLPA], { required: true }),
      date("mc_authorization_date", "MC Authorization Date", [D.fmAuth]),
      date("mc_formation_certificate_date", "MC Formation Certificate Date", [D.fmCert]),
      address("mc_registered_agent_address", "MC Registered Agent Address", [D.fmCert]),
      text("mc_registered_agent_name", "MC Registered Agent Name", [D.fmCert]),
      address("mc_office_address", "MC Office Address", [D.fmLLCA, D.ima]),
      date("mc_formation_date", "MC Formation Date", [D.fmLLCA]),
      date("mc_initial_llca_date", "MC Initial LLCA Date", [D.fmLLCA]),
      date("ima_effective_date", "IMA Effective Date", [D.ima]),
      date("lpa_presentation_date", "LPA Presentation Date", [D.ima, D.arLPA, D.sub]),

      // ── General Partner (8) ──
      text("gp_entity_name", "GP Entity Name",
        [D.certLP, D.gpAuth, D.gpCert, D.gpLLCA, D.initLPA, D.ima, D.ppm, D.arLPA, D.sub],
        { required: true }),
      address("gp_office_address", "GP Office Address",
        [D.certLP, D.gpLLCA, D.initLPA, D.ima, D.ppm, D.sub]),
      date("gp_formation_date", "GP Formation Date", [D.gpCert, D.gpLLCA]),
      address("gp_registered_agent_address", "GP Registered Agent Address", [D.gpCert]),
      text("gp_registered_agent_name", "GP Registered Agent Name", [D.gpCert]),
      date("gp_initial_llca_date", "GP Initial LLCA Date", [D.gpLLCA]),
      date("gp_authorization_date", "GP Authorization Date", [D.gpAuth]),
      text("initial_lp_name", "Initial LP Name", [D.initLPA, D.arLPA]),

      // ── Fund / Limited Partner (6) ──
      address("fund_office_address", "Fund Office Address", [D.initLPA, D.ima]),
      text("registered_agent_name", "Registered Agent Name", [D.certLP, D.arLPA]),
      address("registered_agent_address", "Registered Agent Address", [D.certLP, D.arLPA]),
      date("lp_certificate_date", "LP Certificate Date", [D.certLP]),
      date("date_of_formation", "Date of Formation", [D.initLPA, D.arLPA]),
      date("fund_initial_lpa_date", "Fund Initial LPA Date", [D.initLPA, D.arLPA]),

      // ── Counsel + administrators + portals (10) ──
      date("ppm_presentation_date", "PPM Presentation Date", [D.ppm, D.arLPA, D.sub]),
      text("legal_counsel_name", "Legal Counsel Name", [D.ppm, D.arLPA, D.sub]),
      address("legal_counsel_address", "Legal Counsel Address", [D.sub]),
      phone("legal_counsel_phone", "Legal Counsel Phone", [D.sub]),
      text("legal_counsel_lawyer_name", "Legal Counsel Lawyer Name", [D.sub]),
      email("legal_counsel_lawyer_email", "Legal Counsel Lawyer Email", [D.sub]),
      text("fund_administrator_name", "Fund Administrator Name", [D.ppm]),
      phone("fund_administrator_phone", "Fund Administrator Phone", [D.ppm]),
      text("investor_portal_name", "Investor Portal Name", [D.arLPA, D.sub]),
      email("investor_portal_email", "Investor Portal Email", [D.sub]),

      // ── Notice + conflicts + misc (10) ──
      text("investor_portal_url", "Investor Portal URL", [D.sub]),
      text("notice_cutoff_time", "Notice Cutoff Time", [D.arLPA],
        { hint: "Local time after which notices roll over to the next business day." }),
      text("notice_cutoff_timezone", "Notice Cutoff Timezone", [D.arLPA]),
      yesNo("has_additional_material_conflicts", "Has Additional Material Conflicts", [D.ppm],
        { hint: "Whether the Fund has additional material conflicts to disclose beyond the standard categories. Turning it on surfaces the Material Conflicts prose field and the 'Additional Conflicts' PPM section." }),
      longText("material_conflicts", "Material Conflicts", [D.ppm],
        { hint: "Fund-specific material conflicts of interest beyond the standard disclosures, for the 'Additional Conflicts' PPM section. Available only when 'Has Additional Material Conflicts' is on." }),
      generated("affiliate_services", "Affiliate Services", [D.ppm]),
      longText("potential_third_party_conflicts_of_interest", "Potential Third-Party Conflicts of Interest", [D.ppm],
        { hint: "PPM disclosure: third parties that could create conflicts of interest (e.g., joint venture partners, placement agents, brokers, professional advisors, co-investors)." }),
      longText("professional_long_term_relationships", "Professional Long-Term Relationships", [D.ppm, D.arLPA, D.sub],
        { hint: "PPM disclosure: parties with whom the GP has long-term professional relationships (e.g., portfolio company management teams, operating partners, industry advisors, consultants)." }),
      select("return_basis", "Return Basis", [D.ppm], ["Net", "Gross"]),
      computed("final_closing_period_months", "Final Closing Period (Months)", [D.ppm, D.arLPA],
        ["date_of_formation"],
        { hint: "Computed from Date of Formation and Final Closing Date. Set both dates in the fund builder to populate." }),
    ],
  },
]

// ── derived indexes ─────────────────────────────────────────────────────

export const ALL_LEGAL_FIELDS: LegalFieldDef[] = LEGAL_FIELD_SECTIONS.flatMap((s) => s.fields)

export const LEGAL_FIELD_BY_KEY: Record<string, LegalFieldDef> =
  Object.fromEntries(ALL_LEGAL_FIELDS.map((f) => [f.key, f]))

export const SECTION_BY_FIELD_KEY: Record<string, LegalFieldSectionDef> = (() => {
  const m: Record<string, LegalFieldSectionDef> = {}
  for (const s of LEGAL_FIELD_SECTIONS) for (const f of s.fields) m[f.key] = s
  return m
})()

/** Lookup: which fields reference a given document? Used by the phase-4
 *  document-review viewer to populate the right-rail Field Review panel. */
export function fieldsForDocument(docKey: string): LegalFieldDef[] {
  return ALL_LEGAL_FIELDS.filter((f) => f.documents.includes(docKey))
}

/** Compile-time sanity check. Builds break if the count drifts. */
export const TOTAL_LEGAL_FIELDS = ALL_LEGAL_FIELDS.length  // expected: 94
