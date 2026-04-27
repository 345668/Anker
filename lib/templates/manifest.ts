/**
 * Financial Models & Checklists library — manifest of all bundled
 * templates served from /public/templates.
 *
 * Sources:
 *   - Foresight Group (https://foresight.is) — open-source-licensed
 *     models for VC funds, founders, SaaS forecasting, etc.
 *   - Graph Advisors — VC fund performance tracking template
 *   - Anker — internal Data Room and EOY Fund Health checklists
 */

export type TemplateAudience = "founder" | "vc" | "both"
export type TemplateKind = "xlsx" | "docx" | "pdf"

export interface TemplateDef {
  slug: string
  filename: string
  title: string
  description: string
  audience: TemplateAudience
  kind: TemplateKind
  source: string
  category: string
  tags: string[]
  /** Free-form list of sheet/section names so the UI can preview structure. */
  sheets?: string[]
}

export const TEMPLATES: TemplateDef[] = [
  // ─── Founder financial-modeling tools ──────────────────────────────────
  {
    slug: "saas-forecasting",
    filename: "SaaS Forecasting Tool by Foresight.xlsx",
    title: "SaaS Forecasting",
    description:
      "5-year SaaS revenue model with MRR build-up, churn cohorts, sales-rep ramp, and operating expenses. Drives a P&L, balance sheet, and cash flow.",
    audience: "founder",
    kind: "xlsx",
    source: "Foresight",
    category: "SaaS",
    tags: ["forecast", "ARR", "MRR", "cohorts", "revenue"],
    sheets: ["README", "Get Started", "Forecast", "Key Reports"],
  },
  {
    slug: "enterprise-saas-forecasting",
    filename: "Enterprise SaaS Forecasting Tool, by Foresight.xlsx",
    title: "Enterprise SaaS Forecasting",
    description:
      "Sales-led SaaS model with named-account funnel, deal velocity, and contracted-vs-recognized revenue (ASC 606).",
    audience: "founder",
    kind: "xlsx",
    source: "Foresight",
    category: "SaaS",
    tags: ["enterprise", "ACV", "pipeline", "ASC 606"],
    sheets: ["README", "Get Started", "Forecast", "Key Reports"],
  },
  {
    slug: "ecommerce-forecasting",
    filename: "Ecommerce Forecasting Tool, by Foresight.xlsx",
    title: "Ecommerce Forecasting",
    description:
      "Channel-by-channel ecommerce model: paid/organic acquisition, AOV, repeat rate, contribution margin, working capital.",
    audience: "founder",
    kind: "xlsx",
    source: "Foresight",
    category: "Ecommerce",
    tags: ["DTC", "AOV", "CAC", "contribution margin"],
    sheets: ["README", "Get Started", "Forecast", "Historicals", "Key Reports"],
  },
  {
    slug: "unit-economics",
    filename: "Unit Economics Tool by Foresight.xlsx",
    title: "Unit Economics",
    description:
      "LTV:CAC, payback period, contribution margin, and gross-margin sensitivity for any subscription / transactional business.",
    audience: "founder",
    kind: "xlsx",
    source: "Foresight",
    category: "Unit Economics",
    tags: ["LTV", "CAC", "payback", "contribution margin"],
    sheets: ["README", "Unit Economics"],
  },
  {
    slug: "runway-budgeting",
    filename: "Runway Budgeting Tool, by Foresight.xlsx",
    title: "Runway Budgeting",
    description:
      "Burn-rate planner with monthly opex categories, hire-by-hire roster, scenario toggles, and zero-cash-month calculator.",
    audience: "founder",
    kind: "xlsx",
    source: "Foresight",
    category: "Cash & Runway",
    tags: ["burn", "runway", "scenarios"],
    sheets: ["README", "Summary", "Forecast", "Sources & Uses", "Statements"],
  },
  {
    slug: "venture-valuation",
    filename: "Venture Valuation Tool, by Foresight.xlsx",
    title: "Venture Valuation",
    description:
      "DCF + comparables + venture-method (target-IRR) valuation. Useful for pricing a round and for reverse-engineering investor expectations.",
    audience: "founder",
    kind: "xlsx",
    source: "Foresight",
    category: "Valuation",
    tags: ["DCF", "comps", "venture method", "IRR"],
    sheets: ["README", "Venture Valuation", "Simple Venture Valuation"],
  },
  {
    slug: "cap-table-exit-waterfall",
    filename: "Cap Table and Exit Waterfall Tool, by Foresight.xlsx",
    title: "Cap Table & Exit Waterfall",
    description:
      "Full cap table with SAFE conversion, anti-dilution math, option pool top-ups, and an exit waterfall by share class.",
    audience: "founder",
    kind: "xlsx",
    source: "Foresight",
    category: "Cap Table",
    tags: ["cap table", "SAFE", "waterfall", "anti-dilution"],
    sheets: [
      "Cap Table",
      "Exit Waterfall",
      "Cap Table, with Anti Dilution",
      "Cap Table, Issuing Equity",
      "Cap Table, Issuing Options",
      "Cap Table, Converting SAFEs",
    ],
  },

  // ─── VC fund models ────────────────────────────────────────────────────
  {
    slug: "vc-annual-forecast",
    filename: "Venture Capital Model, Annual Forecast, by Foresight.xlsx",
    title: "VC Fund — Annual Forecast",
    description:
      "Top-down VC fund model on an annual cadence. Pacing, reserves, follow-ons, mark-ups, fund-level IRR / TVPI / DPI.",
    audience: "vc",
    kind: "xlsx",
    source: "Foresight",
    category: "VC Fund Modeling",
    tags: ["fund", "annual", "IRR", "TVPI", "DPI"],
    sheets: ["README", "Get Started", "Forecast", "Key Reports"],
  },
  {
    slug: "vc-quarterly-forecast",
    filename: "Venture Capital Model, Quarterly Forecast, by Foresight.xlsx",
    title: "VC Fund — Quarterly Forecast",
    description:
      "Quarterly VC fund model with 3 scenarios, J-curve modeling, and a separate management-company P&L.",
    audience: "vc",
    kind: "xlsx",
    source: "Foresight",
    category: "VC Fund Modeling",
    tags: ["fund", "quarterly", "scenarios", "J-curve"],
    sheets: ["README", "Forecast", "Scenarios", "Management Company", "Key Reports"],
  },
  {
    slug: "vc-manual-portfolio",
    filename: "Venture Capital Model, Manual Portfolio, by Foresight.xlsx",
    title: "VC Fund — Manual Portfolio",
    description:
      "Bottoms-up portfolio model where you hand-enter each company's investment, follow-ons, mark-ups, and exits.",
    audience: "vc",
    kind: "xlsx",
    source: "Foresight",
    category: "VC Fund Modeling",
    tags: ["portfolio", "bottoms-up", "manual"],
    sheets: ["README", "Portfolio", "Forecast", "Key Reports"],
  },
  {
    slug: "vc-overall-fund",
    filename: "Venture Capital Model, Overall Fund, by Foresight.xlsx",
    title: "VC Fund — Overall Fund (lite)",
    description:
      "Compact one-sheet VC fund forecast — useful for back-of-envelope check sizing and reserves planning.",
    audience: "vc",
    kind: "xlsx",
    source: "Foresight",
    category: "VC Fund Modeling",
    tags: ["fund", "lite"],
    sheets: ["Forecast"],
  },
  {
    slug: "vc-rolling-funds",
    filename: "Venture Capital Model, Rolling Funds, by Foresight.xlsx",
    title: "VC Fund — Rolling Funds",
    description:
      "AngelList-style rolling-fund model with multi-quarter subscriptions, dynamic AUM, and 3 scenarios.",
    audience: "vc",
    kind: "xlsx",
    source: "Foresight",
    category: "VC Fund Modeling",
    tags: ["rolling fund", "AngelList", "subscriptions"],
    sheets: ["README", "Forecast", "Scenarios", "Management Company"],
  },
  {
    slug: "fund-of-funds",
    filename: "Fund of Funds Model, by Foresight.xlsx",
    title: "Fund of Funds Model",
    description:
      "Allocator model — invest in 5-30 sub-funds, model their J-curves and aggregate to a portfolio TVPI / DPI.",
    audience: "vc",
    kind: "xlsx",
    source: "Foresight",
    category: "VC Fund Modeling",
    tags: ["FoF", "allocator", "TVPI"],
    sheets: ["README", "Get Started", "Forecast", "Key Reports"],
  },
  {
    slug: "venture-studio",
    filename: "Venture Studio Model, Annual Forecast, by Foresight.xlsx",
    title: "Venture Studio Model",
    description:
      "0/20/20 venture-studio fund model — studio dilution, founders-in-residence cost, internal cap table, exits.",
    audience: "vc",
    kind: "xlsx",
    source: "Foresight",
    category: "VC Fund Modeling",
    tags: ["studio", "0/20/20", "founders-in-residence"],
    sheets: ["README", "Forecast", "Studio", "Key Reports"],
  },
  {
    slug: "vc-performance-tracker",
    filename: "Graph Advisors VC Fund Performance Portfolio MOIC DPI TVPI Tracking Sheet.xlsx",
    title: "VC Performance Tracker",
    description:
      "Portfolio-tracking sheet with MOIC / DPI / TVPI per investment and per fund. Pre-populated with Fund I / II / III examples.",
    audience: "vc",
    kind: "xlsx",
    source: "Graph Advisors",
    category: "VC Performance",
    tags: ["MOIC", "DPI", "TVPI", "tracker"],
    sheets: ["INSTRUCTIONS", "All investments", "Fund I", "Fund II", "Fund III"],
  },

  // ─── Founder operating tools ───────────────────────────────────────────
  {
    slug: "startup-opex-proforma",
    filename: "StartupCo OpEx ProForma — Graph Advisors + Everywhere VC.xlsx",
    title: "Startup OpEx Pro-Forma",
    description:
      "Operating-expense pro-forma a Series A founder can hand to a VC. Department-level monthly opex, hire-by-hire roster, vendor spend, and a clean P&L roll-up.",
    audience: "founder",
    kind: "xlsx",
    source: "Graph Advisors + Everywhere VC",
    category: "Cash & Runway",
    tags: ["opex", "pro forma", "P&L", "hires", "Series A"],
    sheets: ["Context", "OpEx Model"],
  },
  {
    slug: "qsbs-eligibility",
    filename: "QSBS Eligibility Calculator — Graph Advisors.xlsx",
    title: "QSBS Eligibility Calculator",
    description:
      "Qualified Small Business Stock — checks 5-year hold, $50M assets test, and active-business requirement so founders/early employees can size their tax-free exit cap.",
    audience: "both",
    kind: "xlsx",
    source: "Graph Advisors",
    category: "Tax & Legal",
    tags: ["QSBS", "tax", "section 1202", "exit", "founder economics"],
    sheets: ["Calculator"],
  },

  // ─── Checklists & guides ───────────────────────────────────────────────
  {
    slug: "anker-management-fee-paper",
    filename: "Anker Management Fee Paper.docx",
    title: "Management Fee Paper",
    description:
      "Anker's whitepaper on management-fee structures: standard 2/20, decay schedules, recyclable carry, and how LP-friendly tweaks compound over a fund's lifecycle.",
    audience: "vc",
    kind: "docx",
    source: "Anker",
    category: "Reference",
    tags: ["management fee", "carry", "2/20", "LP economics"],
  },
  {
    slug: "data-room-checklist",
    filename: "Copy of Data Room checklist.docx",
    title: "Data Room Checklist",
    description:
      "Comprehensive due-diligence data-room checklist: corporate, financial, legal, tax, IP, HR, customer, product. Founder-side prep.",
    audience: "founder",
    kind: "docx",
    source: "Anker",
    category: "Checklists",
    tags: ["data room", "due diligence", "DDQ"],
  },
  {
    slug: "eoy-fund-health",
    filename: "Copy of EOY - Fund Health and Performance Checklist.docx",
    title: "EOY Fund Health & Performance Checklist",
    description:
      "End-of-year checklist covering financial close, LP reporting, K-1s, tax, governance, audit, fund health metrics, performance reconciliation.",
    audience: "vc",
    kind: "docx",
    source: "Anker",
    category: "Checklists",
    tags: ["EOY", "fund admin", "LP reporting"],
  },
  {
    slug: "vc-fund-structure",
    filename: "VC Fund Structure .pdf",
    title: "VC Fund Structure (reference PDF)",
    description:
      "Visual reference: GP / LP / Management Company / Fund entity diagram with carry, mgmt fee, and capital flow arrows.",
    audience: "both",
    kind: "pdf",
    source: "Anker",
    category: "Reference",
    tags: ["GP", "LP", "structure", "carry", "management fee"],
  },
]

export const CATEGORIES = Array.from(new Set(TEMPLATES.map((t) => t.category)))

export function getTemplateBySlug(slug: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.slug === slug)
}

export function templatesForAudience(audience: TemplateAudience | "all"): TemplateDef[] {
  if (audience === "all") return TEMPLATES
  return TEMPLATES.filter((t) => t.audience === audience || t.audience === "both")
}

export function templateUrl(t: TemplateDef): string {
  return `/templates/${encodeURIComponent(t.filename)}`
}
