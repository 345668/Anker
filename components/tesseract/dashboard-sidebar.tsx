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

// Streamlined navigation - removed duplicates
const mainNavItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    description: "Overview & metrics",
  },
  {
    label: "Discover",
    href: "/dashboard/discover",
    icon: Compass,
    badge: "AI",
    description: "Find & match investors",
  },
  {
    label: "Pipeline",
    href: "/dashboard/pipeline",
    icon: Target,
    description: "Track your deals",
  },
  {
    label: "CRM",
    href: "/dashboard/crm",
    icon: Users,
    description: "Manage contacts",
  },
  {
    label: "Outreach",
    href: "/dashboard/outreach",
    icon: Mail,
    badge: "New",
    description: "Email campaigns",
  },
  {
    label: "LP Campaign",
    href: "/dashboard/outreach/lp-campaign",
    icon: FileSpreadsheet,
    badge: "AI",
    description: "Enrich · Draft · Export",
  },
  {
    label: "Shortlist",
    href: "/dashboard/shortlist",
    icon: Inbox,
    badge: "New",
    description: "Edited xlsx → CRM kanban",
  },
]

const fundraiseItems = [
  {
    label: "Find Investors",
    href: "/dashboard/find-investors",
    icon: Wand2,
    badge: "AI",
    description: "Upload deck → match investors",
  },
  {
    label: "LP Matchmaking",
    href: "/dashboard/matchmaking",
    icon: TargetIcon,
    badge: "v2",
    description: "Fund → LP scoring",
  },
  {
    label: "Cap Table",
    href: "/dashboard/cap-table",
    icon: PieChart,
    badge: "New",
    description: "Model dilution scenarios",
  },
  {
    label: "Runway",
    href: "/dashboard/runway",
    icon: Flame,
    badge: "New",
    description: "Burn & runway planning",
  },
  {
    label: "Term Sheet",
    href: "/dashboard/term-sheet",
    icon: Scale,
    badge: "New",
    description: "Red-flag analyzer",
  },
]

const workspaceItems = [
  {
    label: "Tools",
    href: "/dashboard/tools",
    icon: Calculator,
    badge: "5",
    description: "Native calculators · xlsx export",
  },
  {
    label: "Documents",
    href: "/dashboard/documents",
    icon: FileStack,
    description: "Pitch deck & data room",
  },
  {
    label: "Analytics",
    href: "/dashboard/analytics",
    icon: BarChart3,
    description: "Insights & tracking",
  },
  {
    label: "AI Assistant",
    href: "/dashboard/assistant",
    icon: MessageSquare,
    badge: "Agent",
    description: "Research · matchmake · generate docs",
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

  const renderNavItem = (item: typeof mainNavItems[0], isActive: boolean) => (
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
        {/* Main */}
        <div>
          <h3 className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider px-3 mb-2">
            Main
          </h3>
          <ul className="space-y-0.5">
            {mainNavItems.map((item) => {
              const isActive = pathname === item.href || 
                (item.href !== "/dashboard" && pathname.startsWith(item.href))
              return (
                <li key={item.href}>
                  {renderNavItem(item, isActive)}
                </li>
              )
            })}
          </ul>
        </div>

        {/* Fundraise tools */}
        <div>
          <h3 className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider px-3 mb-2">
            Fundraise
          </h3>
          <ul className="space-y-0.5">
            {fundraiseItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href)
              return (
                <li key={item.href}>
                  {renderNavItem(item, isActive)}
                </li>
              )
            })}
          </ul>
        </div>

        {/* Workspace */}
        <div>
          <h3 className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider px-3 mb-2">
            Workspace
          </h3>
          <ul className="space-y-0.5">
            {workspaceItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href)
              return (
                <li key={item.href}>
                  {renderNavItem(item, isActive)}
                </li>
              )
            })}
          </ul>
        </div>

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
