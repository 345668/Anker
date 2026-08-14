/**
 * Data-room taxonomy — the single source of truth for per-persona document
 * structure. Drives section grouping, completeness scoring, and the
 * required-document checklists across the founder raise room and the fund
 * (GP/LP) room. See docs/data-room-implementation.md §3–§5.
 *
 * Keep this data-only (no JSX / icons) so it can be imported from both server
 * and client without pulling UI deps.
 */

export type RoomType = "founder" | "fund"
export type FundScope = "fund" | "lp" | "mixed"

export interface TaxonomyItem {
  /** Stable key — used for checklist matching + required-doc tracking. */
  key: string
  label: string
  /** Counts toward the completeness score when true. */
  required?: boolean
}

export interface TaxonomySection {
  key: string
  label: string
  description?: string
  items: TaxonomyItem[]
}

export interface FundTaxonomySection extends TaxonomySection {
  /** Whether docs here are fund-wide, LP-specific, or a mix. */
  scope: FundScope
  /** Legacy `data_room_documents.category` values that map into this section. */
  categories: string[]
}

// ── Founder raise data room (§3) — VC diligence-checklist taxonomy ────────

export const FOUNDER_SECTIONS: TaxonomySection[] = [
  {
    key: "corporate", label: "Corporate & Formation",
    description: "Entity formation, governance, and ownership records.",
    items: [
      { key: "cert_incorporation", label: "Certificate of incorporation", required: true },
      { key: "bylaws", label: "Bylaws" },
      { key: "board_consents", label: "Board consents & minutes" },
      { key: "stockholder_agreements", label: "Stockholder agreements" },
      { key: "org_chart_corp", label: "Corporate org chart" },
      { key: "good_standing", label: "Good-standing certificates" },
    ],
  },
  {
    key: "cap_table", label: "Capitalization",
    description: "Ownership, options, and instruments.",
    items: [
      { key: "cap_table", label: "Cap table", required: true },
      { key: "option_pool", label: "Option pool / ESOP" },
      { key: "safes_notes", label: "SAFEs & convertible notes" },
      { key: "warrants", label: "Warrants" },
      { key: "409a", label: "409A valuation" },
      { key: "stock_purchase", label: "Stock purchase & vesting agreements" },
    ],
  },
  {
    key: "financials", label: "Financials",
    description: "Historical statements and the forward model.",
    items: [
      { key: "historical_financials", label: "Historical P&L / balance sheet / cash flow", required: true },
      { key: "model", label: "Financial model & projections", required: true },
      { key: "budget", label: "Budget" },
      { key: "bank_statements", label: "Bank statements" },
      { key: "ar_ap", label: "AR / AP aging" },
    ],
  },
  {
    key: "metrics", label: "Metrics & Traction",
    description: "The numbers investors underwrite.",
    items: [
      { key: "kpi_dashboard", label: "KPI dashboard", required: true },
      { key: "arr", label: "MRR / ARR history" },
      { key: "cohorts", label: "Cohort & retention analysis" },
      { key: "unit_economics", label: "Unit economics (CAC / LTV)" },
      { key: "pipeline", label: "Sales pipeline" },
    ],
  },
  {
    key: "product", label: "Product & Technology",
    items: [
      { key: "roadmap", label: "Product roadmap" },
      { key: "architecture", label: "Architecture overview" },
      { key: "security", label: "Security & pen-test" },
      { key: "privacy", label: "Data privacy (GDPR / DPA)" },
      { key: "tech_stack", label: "Tech-stack summary" },
    ],
  },
  {
    key: "ip", label: "Intellectual Property",
    items: [
      { key: "patents", label: "Patents" },
      { key: "trademarks", label: "Trademarks" },
      { key: "ip_assignment", label: "IP assignment agreements", required: true },
      { key: "open_source", label: "Open-source usage" },
      { key: "domains", label: "Domains" },
    ],
  },
  {
    key: "legal", label: "Legal & Compliance",
    items: [
      { key: "material_contracts", label: "Material contracts" },
      { key: "customer_vendor", label: "Customer / vendor agreements" },
      { key: "ndas", label: "NDAs" },
      { key: "litigation", label: "Litigation history" },
      { key: "insurance", label: "Insurance" },
      { key: "licenses", label: "Licenses / regulatory" },
    ],
  },
  {
    key: "team", label: "Team & HR",
    items: [
      { key: "org_chart_team", label: "Org chart" },
      { key: "founder_agreements", label: "Founder & key-employee agreements", required: true },
      { key: "offer_letters", label: "Offer letters" },
      { key: "employee_census", label: "Employee census" },
      { key: "contractors", label: "Contractor agreements" },
      { key: "benefits", label: "Benefits" },
    ],
  },
  {
    key: "market", label: "Market & Strategy",
    items: [
      { key: "market_sizing", label: "Market sizing (TAM / SAM / SOM)" },
      { key: "competitive", label: "Competitive analysis" },
      { key: "gtm", label: "Go-to-market strategy" },
    ],
  },
  {
    key: "customers", label: "Customers & Sales",
    items: [
      { key: "customer_list", label: "Customer list" },
      { key: "references", label: "References" },
      { key: "case_studies", label: "Case studies" },
      { key: "churn", label: "Churn analysis" },
      { key: "msas", label: "MSAs" },
    ],
  },
  {
    key: "fundraising", label: "Fundraising",
    items: [
      { key: "pitch_deck", label: "Pitch deck", required: true },
      { key: "exec_summary", label: "Executive summary" },
      { key: "teaser", label: "Investment teaser" },
      { key: "prior_rounds", label: "Prior-round documents" },
      { key: "use_of_funds", label: "Use of funds" },
      { key: "term_sheet", label: "Current term sheet" },
    ],
  },
  {
    key: "tax", label: "Tax",
    items: [
      { key: "tax_returns", label: "Tax returns" },
      { key: "rd_credits", label: "R&D credits" },
      { key: "elections", label: "Key elections (83(b), QSBS)" },
    ],
  },
]

// ── Fund (GP/LP) data room (§4) — ILPA-informed taxonomy ──────────────────

export const FUND_SECTIONS: FundTaxonomySection[] = [
  {
    key: "formation", label: "Fund Formation & Governance", scope: "mixed",
    categories: ["subscription", "policy"],
    items: [
      { key: "lpa", label: "Limited Partnership Agreement (LPA)", required: true },
      { key: "ppm", label: "Private Placement Memorandum (PPM)", required: true },
      { key: "subscription", label: "Subscription agreement" },
      { key: "side_letters", label: "Side letters" },
      { key: "gp_docs", label: "GP / management-company docs" },
    ],
  },
  {
    key: "capital_account", label: "Capital Account", scope: "lp",
    categories: [],
    items: [
      { key: "capital_account_statement", label: "Capital account statements", required: true },
      { key: "commitment_schedule", label: "Commitment schedule" },
    ],
  },
  {
    key: "capital_calls", label: "Capital Calls", scope: "lp",
    categories: ["capital_call"],
    items: [
      { key: "call_notice", label: "Capital call notices" },
      { key: "wire_instructions", label: "Wire instructions" },
    ],
  },
  {
    key: "distributions", label: "Distributions", scope: "lp",
    categories: ["distribution"],
    items: [
      { key: "distribution_notice", label: "Distribution notices" },
      { key: "waterfall", label: "Waterfall calculation" },
    ],
  },
  {
    key: "reporting", label: "Financial Reporting", scope: "fund",
    categories: ["quarterly_letter", "financials"],
    items: [
      { key: "quarterly_report", label: "Quarterly & annual reports", required: true },
      { key: "audited_financials", label: "Audited financial statements", required: true },
      { key: "ilpa_templates", label: "ILPA reporting templates" },
      { key: "nav_statement", label: "NAV statements" },
    ],
  },
  {
    key: "tax", label: "Tax", scope: "lp",
    categories: ["k1"],
    items: [
      { key: "k1", label: "K-1s", required: true },
      { key: "tax_estimates", label: "Tax estimates" },
      { key: "foreign_tax", label: "Foreign-tax docs" },
    ],
  },
  {
    key: "portfolio", label: "Portfolio", scope: "fund",
    categories: [],
    items: [
      { key: "portco_summaries", label: "Portfolio-company summaries" },
      { key: "valuations", label: "Valuations (mark / 409A)" },
      { key: "coinvest", label: "Co-investment docs" },
    ],
  },
  {
    key: "compliance", label: "Compliance & Legal", scope: "fund",
    categories: [],
    items: [
      { key: "form_adv", label: "Form ADV" },
      { key: "compliance_manual", label: "Compliance manual" },
      { key: "aml_kyc", label: "AML / KYC" },
      { key: "privacy_notice", label: "Privacy notice (Reg S-P)" },
      { key: "esg", label: "ESG reports" },
    ],
  },
  {
    key: "ir", label: "Investor Relations", scope: "fund",
    categories: ["other"],
    items: [
      { key: "annual_meeting", label: "Annual-meeting materials" },
      { key: "lp_updates", label: "LP updates" },
      { key: "newsletters", label: "Newsletters" },
    ],
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────

/** Map a legacy fund `category` to its taxonomy section key. Used by backfill
 *  and by the ingest path for auto-generated notices. */
export function fundCategoryToSection(category: string): string {
  for (const s of FUND_SECTIONS) if (s.categories.includes(category)) return s.key
  return "ir" // safe default bucket
}

export const FOUNDER_SECTION_KEYS = FOUNDER_SECTIONS.map((s) => s.key)
export const FUND_SECTION_KEYS = FUND_SECTIONS.map((s) => s.key)

export function sectionsFor(room: RoomType): TaxonomySection[] {
  return room === "founder" ? FOUNDER_SECTIONS : FUND_SECTIONS
}

/** Item-level completeness (Phase 5): required checklist items covered by a
 *  document tagged with that item's key. */
export function itemCompleteness(room: RoomType, coveredItemKeys: Set<string>): { met: number; total: number; pct: number } {
  const required = sectionsFor(room).flatMap((s) => s.items.filter((i) => i.required))
  const met = required.filter((i) => coveredItemKeys.has(i.key)).length
  const total = required.length
  return { met, total, pct: total ? Math.round((met / total) * 100) : 0 }
}

/** Completeness score for a room given which section keys have ≥1 document.
 *  Phase 1: section-level (a required section with any doc counts as met).
 *  Item-level scoring lands in Phase 5. */
export function completeness(room: RoomType, sectionsWithDocs: Set<string>): { met: number; total: number; pct: number } {
  const sections = sectionsFor(room)
  const requiredSections = sections.filter((s) => s.items.some((i) => i.required))
  const met = requiredSections.filter((s) => sectionsWithDocs.has(s.key)).length
  const total = requiredSections.length
  return { met, total, pct: total ? Math.round((met / total) * 100) : 0 }
}

/** Completeness warning threshold (§11 decision 3): below this, warn on share. */
export const COMPLETENESS_WARN_THRESHOLD = 60
/** Default founder-room grant expiry, in days (§11). */
export const DEFAULT_GRANT_EXPIRY_DAYS = 14
