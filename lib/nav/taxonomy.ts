import type { Persona } from "@/lib/org/active"

/**
 * Single source of truth for Anker's product navigation, shared by the
 * marketing site (`components/landing/navigation.tsx`) and — from the redesign
 * onward — the in-app shell. Keeping one array means the two surfaces can never
 * drift: the logged-in app speaks the same suite names and copy as the website.
 *
 * Each item carries BOTH destinations:
 *   - `href`          → public marketing page (/products/*, /solutions/*)
 *   - `dashboardHref` → the real in-app route the app shell links to
 *
 * `persona` on each suite maps a suite to who is entitled to it, using the same
 * founder | vc | lp values the app already scopes nav with. Note the marketing
 * key "fund" is the vc persona.
 *
 * See docs/platform-redesign-plan.md.
 */

export type NavItem = {
  name: string
  desc: string
  /** Public marketing destination. */
  href: string
  /** In-app destination for the logged-in shell. */
  dashboardHref: string
}

export type SuiteFeatured = {
  title: string
  desc: string
  badge?: string
  href: string
  dark?: boolean
}

export type Suite = {
  key: string
  /** Who this suite is for — drives persona-scoped rendering in the app shell. */
  persona: Persona
  label: string
  tagline: string
  exploreHref: string
  items: NavItem[]
  /** Marketing-only CTA card; the app shell does not render this. */
  featured: SuiteFeatured
}

export const SUITES: Suite[] = [
  {
    key: "founder",
    persona: "founder",
    label: "Anker Founder Suite",
    tagline: "Raise your round. Model the deal. Share with confidence.",
    exploreHref: "/solutions/founders",
    items: [
      { name: "Find Investors", desc: "AI matches your deck to the right funds", href: "/products/discover", dashboardHref: "/dashboard/find-investors" },
      { name: "Discover", desc: "Search 60k+ investors & firms", href: "/products/discover", dashboardHref: "/dashboard/discover" },
      { name: "Cap Table", desc: "Model dilution across rounds", href: "/products/cap-table", dashboardHref: "/dashboard/cap-table" },
      { name: "Runway", desc: "Burn & scenario planning", href: "/solutions/founders", dashboardHref: "/dashboard/runway" },
      { name: "Raise Pipeline", desc: "Round by stage · committed capital", href: "/solutions/founders", dashboardHref: "/dashboard/fundraising/pipeline" },
      { name: "Data Room", desc: "Section checklist · share & track", href: "/solutions/founders", dashboardHref: "/dashboard/data-room" },
    ],
    featured: { title: "Free for founders", badge: "FREE", desc: "Build your data room and raise room at no cost.", href: "/register" },
  },
  {
    key: "fund",
    persona: "vc",
    label: "Anker Fund OS",
    tagline: "Manage LPs. Run the back office. Track performance.",
    exploreHref: "/solutions/vcs",
    items: [
      { name: "Fund Administration", desc: "Capital calls to distributions", href: "/products/fund-os", dashboardHref: "/dashboard/portfolio/fund" },
      { name: "Fund Performance", desc: "TVPI · DPI · MOIC · Net IRR", href: "/products/fund-os", dashboardHref: "/dashboard/portfolio/fund/performance" },
      { name: "Financial Reporting", desc: "Quarterly close → publish to LPs", href: "/products/fund-os", dashboardHref: "/dashboard/portfolio/fund/reports" },
      { name: "Data Explorer", desc: "Slice the portfolio · charts · CSV", href: "/products/fund-os", dashboardHref: "/dashboard/portfolio/fund/explorer" },
      { name: "Deal Flow & IC", desc: "Sourcing → IC → close", href: "/products/deal-flow", dashboardHref: "/dashboard/portfolio/fund/deals" },
      { name: "LP Matchmaking", desc: "Fund → LP six-dimension scoring", href: "/solutions/vcs", dashboardHref: "/dashboard/matchmaking" },
    ],
    featured: { title: "ERP for private capital", badge: "NEW", desc: "Fund admin, portfolio analytics, and reporting in one system.", href: "/solutions/vcs", dark: true },
  },
  {
    key: "lp",
    persona: "lp",
    label: "Anker Investor Room",
    tagline: "See everything. Self-serve access. Stay informed.",
    exploreHref: "/solutions/lps",
    items: [
      { name: "Capital Account", desc: "Commitment · called · distributed · NAV", href: "/solutions/lps", dashboardHref: "/lp" },
      { name: "Distributions & Calls", desc: "Every notice addressed to you", href: "/solutions/lps", dashboardHref: "/lp/distributions" },
      { name: "Documents", desc: "Statements, letters, K-1s by section", href: "/solutions/lps", dashboardHref: "/lp/documents" },
      { name: "Portfolio Analytics", desc: "Track your alternative investments", href: "/solutions/lps", dashboardHref: "/lp" },
    ],
    featured: { title: "Self-serve LP portal", desc: "Tokenized, watermarked, secure by design.", href: "/solutions/lps" },
  },
]

export type SolutionItem = { name: string; desc: string; href: string; persona: Persona }

/**
 * Audience-level "Anker for" menu — MARKETING ONLY. Per the redesign decision,
 * the app nav does not surface Solutions; the persona switcher is the in-app
 * expression of audience. Kept here so the marketing nav has a single import.
 */
export const SOLUTIONS: SolutionItem[] = [
  { name: "Founders", desc: "Raise your round, end to end", href: "/solutions/founders", persona: "founder" },
  { name: "Venture Capital", desc: "Source deals & run the fund", href: "/solutions/vcs", persona: "vc" },
  { name: "Limited Partners", desc: "Portfolio visibility & reporting", href: "/solutions/lps", persona: "lp" },
]

export const NAV_LINKS = [
  { name: "Pitch us", href: "/apply" },
  { name: "Changelog", href: "/changelog" },
  { name: "Contact", href: "/contact" },
]

/** The suite entitled to a given persona, if any. Used by the app shell. */
export function suiteForPersona(persona: Persona | null | undefined): Suite | null {
  if (!persona) return null
  return SUITES.find((s) => s.persona === persona) ?? null
}
