/**
 * Native-tool catalog. Each entry is a calculator or model rebuilt as a
 * first-class platform feature with its own UI + xlsx export — replaces
 * the previously bundled (license-restricted) Foresight templates.
 */

export type ToolAudience = "founder" | "vc" | "both"

export interface NativeTool {
  slug: string
  title: string
  description: string
  audience: ToolAudience
  category: string
  href: string // /dashboard/tools/<slug> or /dashboard/<existing>
  status: "shipped" | "planned"
  exports: ("xlsx" | "csv" | "pdf" | "json")[]
}

export const NATIVE_TOOLS: NativeTool[] = [
  // ─── Shipped (this commit) ───────────────────────────────────────────
  {
    slug: "unit-economics",
    title: "Unit Economics",
    description:
      "LTV : CAC, payback period, contribution margin, sensitivity grid across churn × CAC. Live calculator + xlsx export.",
    audience: "founder",
    category: "Unit Economics",
    href: "/dashboard/tools/unit-economics",
    status: "shipped",
    exports: ["xlsx"],
  },
  {
    slug: "qsbs-eligibility",
    title: "QSBS Eligibility",
    description:
      "Section 1202 — 5-year hold, $50M assets test, active-business test, eligible-trade. Per-issuer cap + tax-savings estimate.",
    audience: "both",
    category: "Tax & Legal",
    href: "/dashboard/tools/qsbs-eligibility",
    status: "shipped",
    exports: ["xlsx"],
  },
  {
    slug: "saas-forecast",
    title: "SaaS Forecast",
    description:
      "60-month cohort-based MRR build-up: new customers, churn, expansion, gross margin. Outputs ARR, customer count, cumulative gross profit.",
    audience: "founder",
    category: "SaaS",
    href: "/dashboard/tools/saas-forecast",
    status: "shipped",
    exports: ["xlsx"],
  },
  {
    slug: "venture-valuation",
    title: "Venture Valuation",
    description:
      "DCF (5-year + terminal) + comparable-multiples + venture-method (target-IRR exit). Three independent estimates with a blended range.",
    audience: "founder",
    category: "Valuation",
    href: "/dashboard/tools/venture-valuation",
    status: "shipped",
    exports: ["xlsx"],
  },
  {
    slug: "vc-performance",
    title: "VC Performance Tracker",
    description:
      "Portfolio-tracking with per-investment + fund-level MOIC / DPI / TVPI. Edit positions inline; xlsx export with summary + detail sheets.",
    audience: "vc",
    category: "VC Performance",
    href: "/dashboard/tools/vc-performance",
    status: "shipped",
    exports: ["xlsx"],
  },
  // ─── Already shipped earlier as standalone pages ─────────────────────
  {
    slug: "cap-table",
    title: "Cap Table & Dilution",
    description: "Interactive cap-table modeler with editable holders + funding rounds, ESOP top-ups, and stacked ownership chart.",
    audience: "founder",
    category: "Cap Table",
    href: "/dashboard/cap-table",
    status: "shipped",
    exports: [],
  },
  {
    slug: "runway",
    title: "Runway Planner",
    description: "Three-scenario burn projection with planned-raise injection. Burn-vs-revenue gap chart. Auto-warns < 9 months.",
    audience: "founder",
    category: "Cash & Runway",
    href: "/dashboard/runway",
    status: "shipped",
    exports: [],
  },
  {
    slug: "term-sheet",
    title: "Term Sheet Analyzer",
    description: "Live red-flag analyzer — liquidation, anti-dilution, board, ESOP, vesting, pro-rata, drag. Founder-friendliness score 0-100.",
    audience: "founder",
    category: "Cap Table",
    href: "/dashboard/term-sheet",
    status: "shipped",
    exports: [],
  },
  // ─── Newly shipped (this session) ────────────────────────────────────
  {
    slug: "opex-proforma",
    title: "Startup OpEx Pro-Forma",
    description: "Department-level monthly opex, hire-by-hire roster, vendor spend, P&L roll-up. 36-month projection + cash-runway calc.",
    audience: "founder",
    category: "Cash & Runway",
    href: "/dashboard/tools/opex-proforma",
    status: "shipped",
    exports: ["xlsx"],
  },
  {
    slug: "exit-waterfall",
    title: "Exit Waterfall",
    description: "Cap-table-aware exit waterfall: liquidation prefs by share class, participation caps, conversion. Sensitivity grid + common-breakeven detection.",
    audience: "both",
    category: "Cap Table",
    href: "/dashboard/tools/exit-waterfall",
    status: "shipped",
    exports: ["xlsx"],
  },
  {
    slug: "vc-fund-model",
    title: "VC Fund Model",
    description: "Annual fund forecast — pacing, reserves, follow-ons, mark-ups, exits. Fund-level MOIC / TVPI / DPI / gross & net IRR.",
    audience: "vc",
    category: "VC Fund Modeling",
    href: "/dashboard/tools/vc-fund-model",
    status: "shipped",
    exports: ["xlsx"],
  },
  // ─── Planned (clearly marked, no fake links) ─────────────────────────
  {
    slug: "ecommerce-forecast",
    title: "Ecommerce Forecast",
    description: "Channel-by-channel acquisition, AOV, repeat rate, contribution margin, working capital.",
    audience: "founder",
    category: "Ecommerce",
    href: "/dashboard/tools/ecommerce-forecast",
    status: "planned",
    exports: ["xlsx"],
  },
  {
    slug: "enterprise-saas-forecast",
    title: "Enterprise SaaS Forecast",
    description: "Sales-led pipeline, deal velocity, contracted-vs-recognized revenue (ASC 606).",
    audience: "founder",
    category: "SaaS",
    href: "/dashboard/tools/enterprise-saas-forecast",
    status: "planned",
    exports: ["xlsx"],
  },
  {
    slug: "fund-of-funds",
    title: "Fund of Funds",
    description: "Multi-sub-fund allocator with J-curve aggregation and portfolio-level TVPI / DPI.",
    audience: "vc",
    category: "VC Fund Modeling",
    href: "/dashboard/tools/fund-of-funds",
    status: "planned",
    exports: ["xlsx"],
  },
  {
    slug: "venture-studio-model",
    title: "Venture Studio Model",
    description: "0/20/20 venture-studio fund — studio dilution, founders-in-residence cost, internal cap table, exits.",
    audience: "vc",
    category: "VC Fund Modeling",
    href: "/dashboard/tools/venture-studio-model",
    status: "planned",
    exports: ["xlsx"],
  },
]

/** Convenience filter — only the shipped tools, in the order they appear above. */
export const SHIPPED_TOOLS = NATIVE_TOOLS.filter((t) => t.status === "shipped")

export const TOOL_CATEGORIES = Array.from(new Set(NATIVE_TOOLS.map((t) => t.category)))
