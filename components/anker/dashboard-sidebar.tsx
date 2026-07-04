"use client"

import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"
import {
  Anchor,
  LayoutDashboard,
  Search,
  Users,
  FileText,
  MessageSquare,
  Target,
  TrendingUp,
  Settings,
  LogOut,
  ChevronRight,
  Sparkles,
  Building2,
  Briefcase,
  LineChart,
  Folder,
  HelpCircle,
  Network as NetworkIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface DashboardSidebarProps {
  user: User
}

const mainNavItems = [
  {
    label: "Overview",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Fundraise",
    href: "/dashboard/fundraising",
    icon: Sparkles,
    badge: "Hub",
  },
  {
    label: "Find Investors",
    href: "/dashboard/investors",
    icon: Search,
    badge: "AI",
  },
  {
    label: "Deal Flow",
    href: "/dashboard/deals",
    icon: TrendingUp,
  },
  {
    label: "Pipeline",
    href: "/dashboard/pipeline",
    icon: Target,
  },
  {
    label: "CRM",
    href: "/dashboard/crm",
    icon: Users,
  },
  {
    label: "Network",
    href: "/dashboard/network",
    icon: NetworkIcon,
    badge: "Galaxy",
  },
]

const workspaceItems = [
  {
    label: "Pitch Deck",
    href: "/dashboard/pitch-deck",
    icon: FileText,
    badge: "MBB",
  },
  {
    label: "Data Room",
    href: "/dashboard/data-room",
    icon: Folder,
  },
  {
    label: "AI Assistant",
    href: "/dashboard/chat",
    icon: MessageSquare,
    badge: "New",
  },
  {
    label: "Analytics",
    href: "/dashboard/analytics",
    icon: LineChart,
  },
]

const settingsItems = [
  {
    label: "Company Profile",
    href: "/dashboard/company",
    icon: Building2,
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
  },
  {
    label: "Help & Support",
    href: "/dashboard/help",
    icon: HelpCircle,
  },
]

export function DashboardSidebar({ user }: DashboardSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  const firstName = user.user_metadata?.first_name || user.email?.split("@")[0] || "User"
  const initials = firstName.slice(0, 2).toUpperCase()

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-border/50 bg-background/80 backdrop-blur-xl flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-border/50">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-foreground flex items-center justify-center">
            <Anchor className="w-5 h-5 text-background" />
          </div>
          <div>
            <span className="font-display text-lg font-semibold tracking-tight block">Anker</span>
            <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Founder Portal</span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-8">
        {/* Main Navigation */}
        <div>
          <h3 className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider px-3 mb-3">
            Main
          </h3>
          <ul className="space-y-1">
            {mainNavItems.map((item) => {
              const isActive = pathname === item.href || 
                (item.href !== "/dashboard" && pathname.startsWith(item.href))
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group",
                      isActive
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    <item.icon className={cn(
                      "w-4 h-4",
                      isActive ? "text-background" : "text-muted-foreground group-hover:text-foreground"
                    )} />
                    {item.label}
                    {item.badge && (
                      <span className={cn(
                        "ml-auto px-1.5 py-0.5 rounded font-mono text-[9px] uppercase tracking-wider",
                        isActive
                          ? "bg-background/20 text-background"
                          : "bg-primary/10 text-primary"
                      )}>
                        {item.badge}
                      </span>
                    )}
                    {isActive && (
                      <ChevronRight className="w-3 h-3 ml-auto" />
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Workspace */}
        <div>
          <h3 className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider px-3 mb-3">
            Workspace
          </h3>
          <ul className="space-y-1">
            {workspaceItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group",
                      isActive
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    <item.icon className={cn(
                      "w-4 h-4",
                      isActive ? "text-background" : "text-muted-foreground group-hover:text-foreground"
                    )} />
                    {item.label}
                    {item.badge && (
                      <span className={cn(
                        "ml-auto px-1.5 py-0.5 rounded font-mono text-[9px] uppercase tracking-wider",
                        isActive
                          ? "bg-background/20 text-background"
                          : item.badge === "New" 
                            ? "bg-green-500/10 text-green-600"
                            : "bg-amber-500/10 text-amber-600"
                      )}>
                        {item.badge}
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Settings */}
        <div>
          <h3 className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider px-3 mb-3">
            Settings
          </h3>
          <ul className="space-y-1">
            {settingsItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group",
                      isActive
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    <item.icon className={cn(
                      "w-4 h-4",
                      isActive ? "text-background" : "text-muted-foreground group-hover:text-foreground"
                    )} />
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </nav>

      {/* User section */}
      <div className="p-4 border-t border-border/50">
        <div className="flex items-center gap-3 px-3 py-3 rounded-lg bg-muted/50">
          <div className="w-9 h-9 rounded-full bg-foreground/10 border border-border flex items-center justify-center">
            <span className="font-mono text-xs font-medium">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{firstName}</p>
            <p className="font-mono text-[10px] text-muted-foreground truncate">{user.email}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
