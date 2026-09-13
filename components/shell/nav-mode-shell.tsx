"use client"
import type { User } from "@supabase/supabase-js"
import { DashboardSidebar } from "@/components/tesseract/dashboard-sidebar"
import { DashboardTopbar } from "./dashboard-topbar"
import { AppMobileNav } from "./app-mobile-nav"
import { NavPersonaProvider } from "./nav-persona"
import type { Persona } from "@/lib/org/active"

/** One operational shell. Historical nav preferences no longer change the layout. */
export function NavModeShell({ user, isAdmin, persona, children }: { user: User; isAdmin: boolean; persona: Persona | null; children: React.ReactNode }) {
  return <NavPersonaProvider persona={persona}>
    <div className="min-h-screen bg-background flex">
      <a className="platform-skip" href="#workspace-content">Skip to workspace</a>
      <DashboardSidebar user={user} isAdmin={isAdmin} persona={persona} />
      <main id="workspace-content" tabIndex={-1} className="platform-main platform-sidebar-main flex-1 min-w-0 relative">
        <DashboardTopbar />{children}
      </main>
      <AppMobileNav user={user} isAdmin={isAdmin} />
    </div>
  </NavPersonaProvider>
}
