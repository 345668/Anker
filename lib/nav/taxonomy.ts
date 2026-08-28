import type { Persona } from "@/lib/org/active"
import type { LucideIcon } from "lucide-react"
import {
  Compass, Wand2, Target, Users, Waypoints, Send, Rocket, FileSpreadsheet,
  Wallet, Activity, BarChart3, FileStack, Coins, Gauge, LayoutDashboard,
  UserCheck, Receipt, Landmark, Banknote, FileCheck2, Shield, PieChart, Award,
  Scale, Presentation, Flame, Calculator, MessageSquare, Sparkles, Target as TargetIcon,
  Linkedin, ShieldCheck, Puzzle,
} from "lucide-react"

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

// ── Full in-app navigation ───────────────────────────────────────────────────
// The complete set of destinations, grouped, that the app shell renders in both
// the Products mega-menu and the contextual left rail. This is the go-forward
// source of truth (the legacy sidebar keeps its own copy until Phase 4 deletes
// it). Wording follows the marketing site (Fund OS, 409A, Investor Room…).

export type AppNavItem = {
  label: string
  href: string
  desc?: string
  icon?: LucideIcon
  badge?: string
  /** Personas that can see this item. Omit = every persona. */
  personas?: Persona[]
}
export type AppNavGroup = {
  heading: string
  /** Personas that can see this whole group. Omit = every persona. */
  personas?: Persona[]
  items: AppNavItem[]
}

export const APP_NAV: AppNavGroup[] = [
  {
    heading: "Source & match",
    personas: ["founder", "vc"],
    items: [
      { label: "Discover", href: "/dashboard/discover", icon: Compass, badge: "AI", desc: "Find & match investors", personas: ["founder", "vc"] },
      { label: "Find Investors", href: "/dashboard/find-investors", icon: Wand2, badge: "AI", desc: "Upload deck → match investors", personas: ["founder"] },
      { label: "LP Matchmaking", href: "/dashboard/matchmaking", icon: TargetIcon, desc: "Fund → LP scoring", personas: ["vc"] },
      { label: "Deal Flow", href: "/dashboard/portfolio/fund/deals", icon: Target, desc: "Sourcing → IC → close", personas: ["vc"] },
    ],
  },
  {
    heading: "Relationships",
    personas: ["founder", "vc"],
    items: [
      { label: "Raise Pipeline", href: "/dashboard/fundraising/pipeline", icon: Target, badge: "New", desc: "Round by stage · committed capital", personas: ["founder"] },
      { label: "CRM", href: "/dashboard/crm", icon: Users, desc: "Relationships · tasks · pipeline", personas: ["founder", "vc"] },
      { label: "Network", href: "/dashboard/network", icon: Waypoints, desc: "LinkedIn graph · warm intros", personas: ["founder", "vc"] },
      { label: "Outreach", href: "/dashboard/outreach", icon: Send, desc: "Campaigns · inbox · analytics", personas: ["founder", "vc"] },
      { label: "Founder Campaigns", href: "/dashboard/campaigns", icon: Rocket, badge: "New", desc: "Submissions → assess → outreach", personas: ["vc"] },
      { label: "LP Campaign", href: "/dashboard/outreach/lp-campaign", icon: FileSpreadsheet, badge: "AI", desc: "Enrich · draft · export", personas: ["vc"] },
    ],
  },
  {
    // LinkedOut — the LinkedIn outreach suite (extension-driven, approval-gated).
    // Open to everyone who prospects on the platform: founders, VCs, and LPs.
    heading: "LinkedOut",
    personas: ["founder", "vc", "lp"],
    items: [
      { label: "Campaigns", href: "/dashboard/linkedin/campaigns", icon: Rocket, badge: "New", desc: "Multi-step connect → message sequences", personas: ["founder", "vc", "lp"] },
      { label: "Leads", href: "/dashboard/linkedin/leads", icon: Users, badge: "New", desc: "Reusable audiences · import · enroll", personas: ["founder", "vc", "lp"] },
      { label: "Unibox", href: "/dashboard/linkedin/unibox", icon: MessageSquare, badge: "New", desc: "Unified LinkedIn inbox · reply from Anker", personas: ["founder", "vc", "lp"] },
      { label: "Review Queue", href: "/dashboard/linkedin/review", icon: ShieldCheck, badge: "New", desc: "Approve outbound actions before they send", personas: ["founder", "vc", "lp"] },
      { label: "Senders", href: "/dashboard/linkedin/senders", icon: Linkedin, desc: "Connected accounts · caps · warmup", personas: ["founder", "vc", "lp"] },
      { label: "Extension", href: "/dashboard/linkedin/extension", icon: Puzzle, desc: "Install · token · connection status", personas: ["founder", "vc", "lp"] },
    ],
  },
  {
    heading: "Fund OS",
    personas: ["vc"],
    items: [
      { label: "Fund Administration", href: "/dashboard/portfolio/fund", icon: Wallet, desc: "Capital calls to distributions", personas: ["vc"] },
      { label: "Fund Performance", href: "/dashboard/portfolio/fund/performance", icon: Activity, desc: "TVPI · DPI · MOIC · Net IRR", personas: ["vc", "lp"] },
      { label: "Financial Reporting", href: "/dashboard/portfolio/fund/reports", icon: FileSpreadsheet, badge: "New", desc: "Quarterly close → publish to LPs", personas: ["vc"] },
      { label: "Data Explorer", href: "/dashboard/portfolio/fund/explorer", icon: BarChart3, badge: "New", desc: "Slice the portfolio · charts · CSV", personas: ["vc"] },
      { label: "Tear Sheet", href: "/dashboard/portfolio/fund/tear-sheet", icon: FileStack, badge: "New", desc: "One-page LP summary → PDF", personas: ["vc"] },
      { label: "Valuations", href: "/dashboard/valuations", icon: Coins, badge: "New", desc: "Position marks · method · as-of", personas: ["vc"] },
      { label: "Fund Forecasting", href: "/dashboard/forecasting", icon: Gauge, badge: "New", desc: "Pacing · reserves · projected returns", personas: ["vc"] },
      { label: "Portfolio", href: "/dashboard/portfolio", icon: LayoutDashboard, desc: "Companies · KPIs · updates", personas: ["vc"] },
    ],
  },
  {
    heading: "Fund services",
    personas: ["vc"],
    items: [
      { label: "KYC / AML", href: "/dashboard/kyc-aml", icon: UserCheck, badge: "New", desc: "Investor onboarding · screening", personas: ["vc"] },
      { label: "Fund Tax", href: "/dashboard/fund-tax", icon: Receipt, badge: "New", desc: "K-1s · estimates · filings", personas: ["vc"] },
      { label: "SPVs", href: "/dashboard/spvs", icon: Landmark, badge: "New", desc: "Form · close · administer SPVs", personas: ["vc"] },
      { label: "Loan Operations", href: "/dashboard/loan-operations", icon: Banknote, badge: "New", desc: "Private-credit servicing & covenants", personas: ["vc"] },
      { label: "Contracts", href: "/dashboard/contracts", icon: FileCheck2, badge: "New", desc: "AI redlines · clause search · signature", personas: ["vc"] },
      { label: "Compliance", href: "/dashboard/portfolio/compliance", icon: Shield, desc: "Obligation register · deadlines", personas: ["vc"] },
    ],
  },
  {
    heading: "Equity Suite",
    personas: ["founder"],
    items: [
      { label: "Cap Table", href: "/dashboard/cap-table", icon: PieChart, desc: "Model dilution scenarios", personas: ["founder"] },
      { label: "Share Plans", href: "/dashboard/share-plans", icon: Award, badge: "New", desc: "Option pool · grants · vesting", personas: ["founder"] },
      { label: "409A", href: "/dashboard/valuations-409a", icon: Coins, badge: "New", desc: "409A · EMI · CSOP valuations", personas: ["founder"] },
      { label: "Compensation", href: "/dashboard/compensation", icon: Scale, badge: "New", desc: "Salary & equity benchmarks", personas: ["founder"] },
      { label: "Equity Compliance", href: "/dashboard/equity-compliance", icon: FileCheck2, badge: "New", desc: "Registers · direct filings", personas: ["founder"] },
    ],
  },
  {
    heading: "Investor Room",
    personas: ["lp"],
    items: [
      { label: "Capital Account", href: "/lp", icon: Wallet, desc: "Commitment · called · distributed · NAV", personas: ["lp"] },
      { label: "Distributions & Calls", href: "/lp/distributions", icon: Banknote, desc: "Notices & payment history", personas: ["lp"] },
      { label: "Documents", href: "/lp/documents", icon: FileStack, desc: "Statements, letters, K-1s", personas: ["lp"] },
      { label: "Fund Performance", href: "/dashboard/portfolio/fund/performance", icon: Activity, desc: "TVPI · DPI · MOIC · Net IRR", personas: ["lp"] },
    ],
  },
  {
    heading: "Studio",
    items: [
      { label: "Data Room", href: "/dashboard/data-room", icon: FileStack, badge: "New", desc: "Section checklist · share & track", personas: ["founder"] },
      { label: "Decks", href: "/dashboard/decks", icon: Presentation, desc: "Figma templates · AI-filled decks", personas: ["founder", "vc"] },
      { label: "Documents", href: "/dashboard/documents", icon: FileStack, desc: "Pitch deck & data room" },
    ],
  },
  {
    heading: "Toolbox",
    personas: ["founder", "vc"],
    items: [
      { label: "Runway", href: "/dashboard/runway", icon: Flame, desc: "Burn & scenario planning", personas: ["founder"] },
      { label: "Term Sheet", href: "/dashboard/term-sheet", icon: Scale, desc: "Red-flag analyzer", personas: ["founder"] },
      { label: "Tools", href: "/dashboard/tools", icon: Calculator, desc: "Native calculators · xlsx export", personas: ["founder", "vc"] },
      { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3, desc: "Insights & tracking", personas: ["founder", "vc"] },
    ],
  },
  {
    heading: "AI",
    items: [
      { label: "AI Assistant", href: "/dashboard/assistant", icon: MessageSquare, badge: "Agent", desc: "One assistant, every tool", personas: ["founder", "vc"] },
      { label: "ANKER AI", href: "/dashboard/anker-ai", icon: Sparkles, badge: "New", desc: "Chat · multi-model" },
    ],
  },
]

export function personaVisible(personas: Persona[] | undefined, active: Persona | null): boolean {
  if (!active) return true
  if (!personas) return true
  return personas.includes(active)
}

/** Groups (and items) visible to a persona; empty groups dropped. Owners (null) see all. */
export function groupsForPersona(persona: Persona | null): AppNavGroup[] {
  return APP_NAV
    .filter((g) => personaVisible(g.personas, persona))
    .map((g) => ({ ...g, items: g.items.filter((it) => personaVisible(it.personas, persona)) }))
    .filter((g) => g.items.length > 0)
}

/** Primary top-bar links shown outside the Products menu, per persona. */
export const PRIMARY_LINKS: { label: string; href: string; personas?: Persona[] }[] = [
  { label: "Home", href: "/dashboard" },
  { label: "Relationships", href: "/dashboard/crm", personas: ["founder", "vc"] },
]

export function primaryLinksForPersona(persona: Persona | null): { label: string; href: string }[] {
  return PRIMARY_LINKS.filter((l) => personaVisible(l.personas, persona)).map(({ label, href }) => ({ label, href }))
}

// ── Command palette (⌘K) ─────────────────────────────────────────────────────
export type CommandDest = { label: string; href: string; group: string; desc?: string }

/**
 * Every navigable destination flattened for ⌘K, persona-scoped and using the
 * same site-wording labels + groups as the nav — so the palette can never drift
 * from the menus. `desc` is folded into the search haystack, so typing "vesting"
 * finds Share Plans, "409a" finds 409A, etc.
 */
export function flatDestinations(persona: Persona | null): CommandDest[] {
  return groupsForPersona(persona).flatMap((g) =>
    g.items.map((it) => ({ label: it.label, href: it.href, group: g.heading, desc: it.desc })),
  )
}
