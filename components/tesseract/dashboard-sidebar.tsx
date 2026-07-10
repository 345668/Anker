"use client"

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
  Inbox,
  KeyRound,
  ShieldCheck as ShieldIcon,
  Wallet,
  Waypoints,
  Chrome,

  Presentation,
  Send,
} from "lucide-react"
import { cn } from "@/lib/utils"

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

interface NavItem {
  label: string
  href: string
  icon: any
  badge?: string
  description?: string
}

const NAV_GROUPS: Array<{ heading: string; items: NavItem[] }> = [
  {
    heading: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, description: "Overview & metrics" },
      { label: "AI Assistant", href: "/dashboard/assistant", icon: MessageSquare, badge: "Agent", description: "One assistant, every tool — CRM, deals, docs" },
    ],
  },
  {
    heading: "Source & match",
    items: [
      { label: "Discover", href: "/dashboard/discover", icon: Compass, badge: "AI", description: "Find & match investors" },
      { label: "Find Investors", href: "/dashboard/find-investors", icon: Wand2, badge: "AI", description: "Upload deck → match investors" },
      { label: "LP Matchmaking", href: "/dashboard/matchmaking", icon: TargetIcon, description: "Fund → LP scoring" },
      { label: "Deal Flow", href: "/dashboard/portfolio/fund/deals", icon: Target, description: "Sourcing → IC → close · founder submissions" },
    ],
  },
  {
    heading: "Relationships",
    items: [
      { label: "CRM", href: "/dashboard/crm", icon: Users, description: "Relationships · tasks · pipeline" },
      { label: "Network", href: "/dashboard/network", icon: Waypoints, description: "LinkedIn relationship graph · warm intros" },
      { label: "Outreach", href: "/dashboard/outreach", icon: Send, description: "Campaigns · inbox · analytics · studio" },
      { label: "LP Campaign", href: "/dashboard/outreach/lp-campaign", icon: FileSpreadsheet, badge: "AI", description: "Enrich · draft · export" },
    ],
  },
  {
    heading: "Fund & studio",
    items: [
      { label: "Fund", href: "/dashboard/portfolio/fund", icon: Wallet, description: "Investments · NAV · ledger · economics · legal" },
      { label: "Decks", href: "/dashboard/decks", icon: Presentation, description: "Figma templates · AI-filled decks" },
      { label: "Documents", href: "/dashboard/documents", icon: FileStack, description: "Pitch deck & data room" },
    ],
  },
  {
    heading: "Toolbox",
    items: [
      { label: "Cap Table", href: "/dashboard/cap-table", icon: PieChart, description: "Model dilution scenarios" },
      { label: "Runway", href: "/dashboard/runway", icon: Flame, description: "Burn & runway planning" },
      { label: "Term Sheet", href: "/dashboard/term-sheet", icon: Scale, description: "Red-flag analyzer" },
      { label: "Tools", href: "/dashboard/tools", icon: Calculator, description: "Native calculators · xlsx export" },
      { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3, description: "Insights & tracking" },
    ],
  },
]

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

export function DashboardSidebar({ user, isAdmin: isAdminProp }: DashboardSidebarProps) {
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

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  const firstName = user.user_metadata?.first_name || user.email?.split("@")[0] || "User"
  const initials = firstName.slice(0, 2).toUpperCase()

  const renderNavItem = (item: NavItem, isActive: boolean) => (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 text-sm transition-all group relative",
        isActive
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
      )}
    >
      <item.icon className={cn(
        "w-4 h-4 shrink-0 transition-colors",
        isActive ? "text-background" : "text-muted-foreground group-hover:text-foreground"
      )} />
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
      {isActive && (
        <ChevronRight className="w-3 h-3 shrink-0" />
      )}
    </Link>
  )

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-foreground/10 bg-background flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-foreground/10">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-lg bg-foreground flex items-center justify-center transition-transform group-hover:scale-105">
            <Box className="w-5 h-5 text-background" />
          </div>
          <div>
            <span className="font-display text-lg tracking-tight block">Tesseract</span>
            <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Founder Portal</span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-6">
        {(() => {
          // Longest-match activation: /dashboard/portfolio/fund/deals lights
          // up Deal Flow only, not the shorter Fund href it also prefixes.
          const hrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href))
          const best = hrefs
            .filter((h) => pathname === h || (h !== "/dashboard" && pathname.startsWith(h + "/")))
            .sort((a, b) => b.length - a.length)[0] ?? (pathname === "/dashboard" ? "/dashboard" : null)
          return NAV_GROUPS.map((group) => (
            <div key={group.heading}>
              <h3 className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider px-3 mb-2">
                {group.heading}
              </h3>
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
            <h3 className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider px-3 mb-2 flex items-center gap-1.5">
              <Lock className="w-2.5 h-2.5" />
              Admin
            </h3>
            <ul className="space-y-0.5">
              {[
                {
                  label: "Portfolio",
                  href: "/dashboard/portfolio",
                  icon: Box,
                  badge: "New",
                  description: "Companies · KPI snapshots · trends",
                },
                {
                  label: "Fund & LPs",
                  href: "/dashboard/portfolio/fund",
                  icon: Wallet,
                  badge: "New",
                  description: "Fund profile · LP commitments · capital",
                },
                {
                  label: "Capital calls",
                  href: "/dashboard/portfolio/fund/calls",
                  icon: Mail,
                  badge: "New",
                  description: "Draft · send notices · track payments",
                },
                {
                  label: "Distributions",
                  href: "/dashboard/portfolio/fund/distributions",
                  icon: PieChart,
                  badge: "New",
                  description: "Wire-back to LPs · DPI tracking",
                },
                {
                  label: "Data room",
                  href: "/dashboard/portfolio/fund/documents",
                  icon: FileStack,
                  badge: "New",
                  description: "Upload + scope docs · LP portal",
                },
                {
                  label: "LP Letters",
                  href: "/dashboard/portfolio/reports",
                  icon: FileStack,
                  badge: "AI",
                  description: "Auto-draft quarterly letter from portfolio",
                },
                {
                  label: "Data ops",
                  href: "/dashboard/admin",
                  icon: ShieldIcon,
                  description: "Crawl · URL check · enrich · deep research",
                },
                {
                  label: "AI & API Keys",
                  href: "/dashboard/settings/api-keys",
                  icon: KeyRound,
                  badge: "AI",
                  description: "Gemini / Claude keys · local toggle · test",
                },
                {
                  label: "Reply inbox",
                  href: "/dashboard/admin/inbox",
                  icon: Inbox,
                  description: "Triage inbound replies · classify · draft",
                },
                {
                  label: "Email outbox",
                  href: "/dashboard/admin/email",
                  icon: Mail,
                  description: "Send drafts via Resend · track opens/clicks",
                },
                {
                  label: "Templates Library",
                  href: "/dashboard/templates",
                  icon: FileSpreadsheet,
                  badge: "21",
                  description: "Reference templates · admin-only",
                },
              ].map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href)
                return <li key={item.href}>{renderNavItem(item as any, isActive)}</li>
              })}
            </ul>
          </div>
        )}

        {/* Settings */}
        <div>
          <h3 className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider px-3 mb-2">
            Account
          </h3>
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
      <div className="p-4 border-t border-foreground/10">
        <div className="flex items-center gap-3 px-3 py-3 bg-foreground/5 rounded-lg">
          <div className="w-9 h-9 rounded-lg bg-foreground text-background flex items-center justify-center">
            <span className="font-mono text-xs font-medium">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{firstName}</p>
            <p className="font-mono text-[10px] text-muted-foreground truncate">{user.email}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-foreground/10 rounded-lg transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
