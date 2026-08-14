"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"
import {
  LayoutDashboard,
  Compass,
  Target,
  Users,
  FileStack,
  BarChart3,
  Settings,
  LogOut,
  ChevronRight,
  Box,
  MessageSquare,
  HelpCircle,
  Mail,
  PieChart,
  Flame,
  Scale,
  Target as TargetIcon,
  Wand2,
  FileSpreadsheet,
  Calculator,
  Lock,
  Activity,
  CreditCard,
  KeyRound,
  ShieldCheck as ShieldIcon,
  Wallet,
  Waypoints,
  Chrome,
  PanelLeftClose,
  PanelLeftOpen,

  Presentation,
  Send,
  Rocket,
  Sparkles,
  Newspaper,
  Banknote,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"

interface DashboardSidebarProps {
  user: User
  /**
   * True when the parent server layout determined the user is an admin via
   * any of the three sources in lib/auth/require-admin.ts (ADMIN_EMAILS,
   * Supabase user_metadata.role, or public.users.is_admin). The sidebar
   * MUST trust this rather than recomputing — its old `role === "admin"`
   * check missed admins flagged in the DB or in the email allowlist,
   * leaving the Admin nav invisible even though /dashboard/admin/* was
   * reachable by URL.
   */
  isAdmin?: boolean
  /**
   * Active workspace persona (founder / vc / lp). null when the user is an
   * owner or has no membership yet — both see the full, unfiltered nav.
   */
  persona?: Persona | null
}

// ── Navigation, organized by WORKFLOW ────────────────────────────────────────
//
// July 2026 restructure: the flat list had grown organically (two Outreach
// entries, legacy Shortlist, fund ops buried in Admin). Groups now follow
// how the work actually flows:
//   Overview        → where am I, and ask the AI
//   Source & match  → find investors/LPs, run deal flow
//   Relationships   → CRM, network graph, outreach engine, LP campaigns
//   Fund & studio   → the fund record + content production
//   Toolbox         → calculators & analyzers
// Legacy /dashboard/shortlist stays reachable by URL but leaves the nav —
// CRM boards superseded it.

type Persona = "founder" | "vc" | "lp"

interface NavItem {
  label: string
  href: string
  icon: any
  badge?: string
  description?: string
  /** Personas that can see this item. Omit = visible to every persona. */
  personas?: Persona[]
}

const NAV_GROUPS: Array<{ heading: string; items: NavItem[]; personas?: Persona[] }> = [
  {
    heading: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, description: "Overview & metrics" },
      { label: "AI Assistant", href: "/dashboard/assistant", icon: MessageSquare, badge: "Agent", description: "One assistant, every tool — CRM, deals, docs", personas: ["founder", "vc"] },
      { label: "ANKER AI", href: "/dashboard/anker-ai", icon: Sparkles, badge: "New", description: "Claude-style chatbot · Qwen3.x · GLM-5.2 · DeepSeek · Kimi" },
    ],
  },
  {
    heading: "Source & match",
    personas: ["founder", "vc"],
    items: [
      { label: "Discover", href: "/dashboard/discover", icon: Compass, badge: "AI", description: "Find & match investors", personas: ["founder", "vc"] },
      { label: "Find Investors", href: "/dashboard/find-investors", icon: Wand2, badge: "AI", description: "Upload deck → match investors", personas: ["founder"] },
      { label: "LP Matchmaking", href: "/dashboard/matchmaking", icon: TargetIcon, description: "Fund → LP scoring", personas: ["vc"] },
      { label: "Deal Flow", href: "/dashboard/portfolio/fund/deals", icon: Target, description: "Sourcing → IC → close · founder submissions", personas: ["vc"] },
      { label: "Imports", href: "/dashboard/imports", icon: FileSpreadsheet, description: "CSV/XLSX · enrichment · crawl · URL check", personas: ["vc"] },
    ],
  },
  {
    heading: "Relationships",
    personas: ["founder", "vc"],
    items: [
      { label: "CRM", href: "/dashboard/crm", icon: Users, description: "Relationships · tasks · pipeline", personas: ["founder", "vc"] },
      { label: "Network", href: "/dashboard/network", icon: Waypoints, description: "LinkedIn relationship graph · warm intros", personas: ["founder", "vc"] },
      { label: "Outreach", href: "/dashboard/outreach", icon: Send, description: "Campaigns · inbox · analytics · studio", personas: ["founder", "vc"] },
      { label: "Founder Campaigns", href: "/dashboard/campaigns", icon: Rocket, badge: "New", description: "Public submissions → assess → match → auto-outreach", personas: ["vc"] },
      { label: "LP Campaign", href: "/dashboard/outreach/lp-campaign", icon: FileSpreadsheet, badge: "AI", description: "Enrich · draft · export", personas: ["vc"] },
      { label: "Send Center", href: "/dashboard/send-center", icon: Mail, description: "Outbox · replies · deliverability", personas: ["founder", "vc"] },
    ],
  },
  {
    heading: "Fund back-office",
    personas: ["vc", "lp"],
    items: [
      { label: "Fund", href: "/dashboard/portfolio/fund", icon: Wallet, description: "Performance · reporting · data explorer · tear sheets · NAV", personas: ["vc"] },
      { label: "Fund performance", href: "/dashboard/portfolio/fund/performance", icon: Activity, description: "TVPI · DPI · RVPI · MOIC · Net IRR", personas: ["vc", "lp"] },
      { label: "Financial reporting", href: "/dashboard/portfolio/fund/reports", icon: FileSpreadsheet, badge: "New", description: "Quarterly close → publish to LPs", personas: ["vc"] },
      { label: "Data explorer", href: "/dashboard/portfolio/fund/explorer", icon: BarChart3, badge: "New", description: "Slice the portfolio · charts · CSV", personas: ["vc"] },
      { label: "Tear sheet", href: "/dashboard/portfolio/fund/tear-sheet", icon: FileStack, badge: "New", description: "One-page LP summary · print to PDF", personas: ["vc"] },
      { label: "Portfolio", href: "/dashboard/portfolio", icon: LayoutDashboard, description: "Companies · KPIs · investor-update ingest", personas: ["vc"] },
      { label: "Compliance", href: "/dashboard/portfolio/compliance", icon: ShieldIcon, description: "Regulatory obligation register · filing deadlines", personas: ["vc"] },
    ],
  },
  {
    heading: "Investor room",
    personas: ["lp"],
    items: [
      { label: "Capital account", href: "/lp", icon: Wallet, description: "Commitments · called · distributed · est. NAV", personas: ["lp"] },
      { label: "Distributions & calls", href: "/lp/distributions", icon: Banknote, description: "Notices & payment history addressed to you", personas: ["lp"] },
      { label: "Documents", href: "/lp/documents", icon: FileStack, description: "Statements, letters, K-1s & reports", personas: ["lp"] },
    ],
  },
  {
    heading: "Studio",
    items: [
      { label: "Decks", href: "/dashboard/decks", icon: Presentation, description: "Figma templates · AI-filled decks", personas: ["founder", "vc"] },
      { label: "Documents", href: "/dashboard/documents", icon: FileStack, description: "Pitch deck & data room" },
      { label: "Newsroom", href: "/dashboard/content", icon: Newspaper, badge: "New", description: "Write · AI-draft · publish to /newsroom" },
    ],
  },
  {
    heading: "Toolbox",
    personas: ["founder", "vc"],
    items: [
      { label: "Cap Table", href: "/dashboard/cap-table", icon: PieChart, description: "Model dilution scenarios", personas: ["founder"] },
      { label: "Runway", href: "/dashboard/runway", icon: Flame, description: "Burn & runway planning", personas: ["founder"] },
      { label: "Term Sheet", href: "/dashboard/term-sheet", icon: Scale, description: "Red-flag analyzer", personas: ["founder"] },
      { label: "Tools", href: "/dashboard/tools", icon: Calculator, description: "Native calculators · xlsx export", personas: ["founder", "vc"] },
      { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3, description: "Insights & tracking", personas: ["founder", "vc"] },
    ],
  },
]

/** A null persona (owner, or a user with no membership yet) sees everything. */
function visibleFor(personas: Persona[] | undefined, active: Persona | null): boolean {
  if (!active) return true
  if (!personas) return true
  return personas.includes(active)
}

const settingsItems = [
  {
    label: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
    description: "Company & account",
  },
  {
    label: "API Keys",
    href: "/dashboard/settings/api-keys",
    icon: KeyRound,
    badge: "AI",
    description: "Gemini / Claude keys · provider · test",
  },
  {
    label: "Extension",
    href: "/dashboard/settings/extension-tokens",
    icon: Chrome,
    description: "LinkedIn extension · install · tokens",
  },
  {
    label: "Help",
    href: "/dashboard/help",
    icon: HelpCircle,
    description: "Support & docs",
  },
]

export function DashboardSidebar({ user, isAdmin: isAdminProp, persona = null }: DashboardSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const role =
    (user.user_metadata as any)?.role ||
    (user.app_metadata as any)?.role ||
    "founder"
  // Trust the server-computed flag when the parent layout supplied it (always
  // does in the dashboard). Fall back to the legacy metadata-only check only
  // when the prop is explicitly undefined - keeps any other caller of this
  // component compiling without forcing them to thread a new prop.
  const isAdmin = isAdminProp ?? role === "admin"

  // Collapse state. The pre-paint script in the dashboard layout has already
  // set --sidebar-w from localStorage, so we hydrate from the same key to stay
  // in sync (useState starts false to keep SSR markup deterministic).
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("anker:sidebar") === "collapsed")
    } catch { /* storage blocked — stay expanded */ }
  }, [])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem("anker:sidebar", next ? "collapsed" : "expanded")
        document.documentElement.style.setProperty("--sidebar-w", next ? "4rem" : "16rem")
      } catch { /* storage blocked — width still updates below */ }
      return next
    })
  }, [])

  // Keep the CSS variable authoritative even when storage is unavailable.
  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-w", collapsed ? "4rem" : "16rem")
  }, [collapsed])

  // Compliance nav badge: count of filing deadlines overdue or entering their
  // window. Best-effort — a 401 (non-admin) or any error leaves it unset and
  // the badge simply doesn't render.
  const [complianceCount, setComplianceCount] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch("/api/portfolio/compliance/digest?count=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && typeof d?.count === "number") setComplianceCount(d.count) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  const firstName = user.user_metadata?.first_name || user.email?.split("@")[0] || "User"
  const initials = firstName.slice(0, 2).toUpperCase()

  const renderNavItem = (item: NavItem, isActive: boolean) => {
   // Attention count for the Compliance item (overdue / due-soon filings).
   const countBadge =
     item.href === "/dashboard/portfolio/compliance" && complianceCount ? complianceCount : null
   return (
    <Link
      href={item.href}
      // When collapsed the label is hidden, so the native tooltip carries the
      // name (plus the description, which is otherwise never surfaced).
      title={collapsed ? `${item.label}${item.description ? ` — ${item.description}` : ""}` : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center py-2.5 text-sm transition-all group relative",
        collapsed ? "justify-center px-0" : "gap-3 px-3",
        isActive
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
      )}
    >
      <item.icon className={cn(
        "w-4 h-4 shrink-0 transition-colors",
        isActive ? "text-background" : "text-muted-foreground group-hover:text-foreground"
      )} />
      {!collapsed && (
        <>
          <span className={cn(
            "font-medium flex-1",
            !isActive && "group-hover:translate-x-0.5 transition-transform"
          )}>
            {item.label}
          </span>
          {"badge" in item && item.badge && (
            <span className={cn(
              "px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider rounded",
              isActive
                ? "bg-background/20 text-background"
                : item.badge === "Beta" || item.badge === "AI"
                  ? "bg-emerald-500/10 text-emerald-600"
                  : "bg-foreground/10 text-foreground/60"
            )}>
              {item.badge}
            </span>
          )}
          {countBadge && (
            <span
              title={`${countBadge} filing${countBadge === 1 ? "" : "s"} overdue or due soon`}
              className={cn(
                "px-1.5 py-0.5 font-mono text-[9px] tracking-wider rounded tabular-nums",
                isActive ? "bg-background/20 text-background" : "bg-amber-500/15 text-amber-600"
              )}
            >
              {countBadge}
            </span>
          )}
          {isActive && <ChevronRight className="w-3 h-3 shrink-0" />}
        </>
      )}
      {/* Collapsed: a dot stands in for the badge so "AI"/"New" stay discoverable */}
      {collapsed && "badge" in item && item.badge && !isActive && (
        <span className={cn(
          "absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full",
          item.badge === "Beta" || item.badge === "AI" ? "bg-emerald-500" : "bg-foreground/40"
        )} />
      )}
      {/* Collapsed: amber dot signals compliance items need attention. */}
      {collapsed && countBadge && !isActive && (
        <span className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full bg-amber-500" />
      )}
    </Link>
  )
  }

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen border-r border-foreground/10 bg-background flex flex-col",
        "transition-[width] duration-200",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo + collapse toggle */}
      <div className={cn("border-b border-foreground/10", collapsed ? "p-3" : "p-6")}>
        <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between gap-2")}>
          <Link
            href="/dashboard"
            className="flex items-center gap-3 group min-w-0"
            title={collapsed ? "Anker — Founder Portal" : undefined}
          >
            <div className="w-9 h-9 rounded-lg bg-foreground flex items-center justify-center shrink-0 transition-transform group-hover:scale-105">
              <Box className="w-5 h-5 text-background" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <span className="font-display text-lg tracking-tight block truncate">Anker</span>
                <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Venture OS</span>
              </div>
            )}
          </Link>
          {!collapsed && (
            <button
              onClick={toggleCollapsed}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              aria-expanded
              className="p-2 shrink-0 text-muted-foreground hover:text-foreground hover:bg-foreground/10 rounded-lg transition-colors"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>
        {collapsed && (
          <button
            onClick={toggleCollapsed}
            title="Expand sidebar"
            aria-label="Expand sidebar"
            aria-expanded={false}
            className="mt-2 w-full flex justify-center p-2 text-muted-foreground hover:text-foreground hover:bg-foreground/10 rounded-lg transition-colors"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className={cn("flex-1 overflow-y-auto space-y-6", collapsed ? "px-2 py-4" : "p-4")}>
        {(() => {
          // Persona filter: drop items/groups the active persona can't see.
          // Owners / membership-less users pass through (persona === null).
          const groups = NAV_GROUPS
            .filter((g) => visibleFor(g.personas, persona))
            .map((g) => ({ ...g, items: g.items.filter((i) => visibleFor(i.personas, persona)) }))
            .filter((g) => g.items.length > 0)

          // Longest-match activation: /dashboard/portfolio/fund/deals lights
          // up Deal Flow only, not the shorter Fund href it also prefixes.
          const hrefs = groups.flatMap((g) => g.items.map((i) => i.href))
          const best = hrefs
            .filter((h) => pathname === h || (h !== "/dashboard" && pathname.startsWith(h + "/")))
            .sort((a, b) => b.length - a.length)[0] ?? (pathname === "/dashboard" ? "/dashboard" : null)
          return groups.map((group) => (
            <div key={group.heading}>
              {collapsed ? (
                <div className="mx-2 mb-2 border-t border-foreground/10" aria-hidden />
              ) : (
                <h3 className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider px-3 mb-2">
                  {group.heading}
                </h3>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    {renderNavItem(item, item.href === best)}
                  </li>
                ))}
              </ul>
            </div>
          ))
        })()}

        {/* Admin (only visible to role='admin') */}
        {isAdmin && (
          <div>
            {collapsed ? (
              <div className="mx-2 mb-2 border-t border-foreground/10 pt-2 flex justify-center" title="Admin">
                <Lock className="w-2.5 h-2.5 text-muted-foreground" />
              </div>
            ) : (
              <h3 className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider px-3 mb-2 flex items-center gap-1.5">
                <Lock className="w-2.5 h-2.5" />
                Admin
              </h3>
            )}
            <ul className="space-y-0.5">
              {[
                {
                  label: "Admin home",
                  href: "/dashboard/admin",
                  icon: LayoutDashboard,
                  description: "Overview · controls · quick links",
                },
                {
                  label: "Users & roles",
                  href: "/dashboard/admin/users",
                  icon: Users,
                  description: "Manage accounts · roles · sessions",
                },
                {
                  label: "Audit log",
                  href: "/dashboard/admin/audit",
                  icon: ShieldIcon,
                  description: "Who did what, when · immutable trail",
                },
                {
                  label: "System health",
                  href: "/dashboard/admin/system",
                  icon: Activity,
                  description: "Jobs · queues · error rates · integrations",
                },
                {
                  label: "Billing & credits",
                  href: "/dashboard/admin/billing",
                  icon: CreditCard,
                  description: "Plan · usage meters · credit balance",
                },
              ].map((item) => {
                // Admin home matches exactly (its href is a prefix of every
                // other admin route, which would otherwise keep it "active").
                const isActive = item.href === "/dashboard/admin"
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(item.href)
                return <li key={item.href}>{renderNavItem(item as any, isActive)}</li>
              })}
            </ul>
          </div>
        )}

        {/* Settings */}
        <div>
          {collapsed ? (
            <div className="mx-2 mb-2 border-t border-foreground/10" aria-hidden />
          ) : (
            <h3 className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider px-3 mb-2">
              Account
            </h3>
          )}
          <ul className="space-y-0.5">
            {settingsItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <li key={item.href}>
                  {renderNavItem(item, isActive)}
                </li>
              )
            })}
          </ul>
        </div>
      </nav>

      {/* User section */}
      <div className={cn("border-t border-foreground/10", collapsed ? "p-2" : "p-4")}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div
              className="w-9 h-9 rounded-lg bg-foreground text-background flex items-center justify-center"
              title={`${firstName} · ${user.email ?? ""}`}
            >
              <span className="font-mono text-xs font-medium">{initials}</span>
            </div>
            <ThemeToggle className="p-2 text-muted-foreground hover:text-foreground hover:bg-foreground/10 rounded-lg transition-colors" />
            <button
              onClick={handleSignOut}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-foreground/10 rounded-lg transition-colors"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-3 py-3 bg-foreground/5 rounded-lg">
            <div className="w-9 h-9 rounded-lg bg-foreground text-background flex items-center justify-center shrink-0">
              <span className="font-mono text-xs font-medium">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{firstName}</p>
              <p className="font-mono text-[10px] text-muted-foreground truncate">{user.email}</p>
            </div>
            <ThemeToggle className="p-2 text-muted-foreground hover:text-foreground hover:bg-foreground/10 rounded-lg transition-colors" />
            <button
              onClick={handleSignOut}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-foreground/10 rounded-lg transition-colors"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
