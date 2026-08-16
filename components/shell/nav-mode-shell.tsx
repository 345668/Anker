"use client"

import { useEffect, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { DashboardSidebar } from "@/components/tesseract/dashboard-sidebar"
import { DashboardTopbar } from "@/components/shell/dashboard-topbar"
import { AppNav } from "@/components/shell/app-nav"
import { AppSubnav } from "@/components/shell/app-subnav"
import { AppMobileNav } from "@/components/shell/app-mobile-nav"
import { NavPersonaProvider } from "@/components/shell/nav-persona"
import type { Persona } from "@/lib/org/active"

/**
 * Chooses the dashboard chrome: the legacy left sidebar (default) or the new
 * website-style top nav (redesign), gated by the `anker:nav` flag.
 *
 * The choice lives in BOTH a cookie (so the server renders the right chrome on
 * first paint — no flash) and localStorage (so the client toggle is instant).
 * `initialMode` comes from the server cookie read; the effect reconciles a
 * `?nav=top|sidebar` URL param and keeps cookie + localStorage in sync.
 *
 * Toggle without the console:
 *   /dashboard?nav=top      → new top nav (sticky)
 *   /dashboard?nav=sidebar  → sidebar (sticky)
 */
export function NavModeShell({
  user, isAdmin, persona, initialMode = "sidebar", children,
}: {
  user: User
  isAdmin: boolean
  persona: Persona | null
  initialMode?: "sidebar" | "top"
  children: React.ReactNode
}) {
  const [mode, setMode] = useState<"sidebar" | "top">(initialMode)

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("nav")
      let next: "sidebar" | "top" | null = q === "top" || q === "sidebar" ? q : null
      if (!next) {
        const stored = localStorage.getItem("anker:nav")
        next = stored === "top" ? "top" : stored === "sidebar" ? "sidebar" : initialMode
      }
      setMode(next)
      localStorage.setItem("anker:nav", next)
      // Mirror to a cookie so the next server render picks the same chrome.
      document.cookie = `anker_nav=${next}; path=/; max-age=31536000; samesite=lax`
    } catch { /* ignore */ }
  }, [initialMode])

  // Subtle grid background — shared by both chromes (Optimus style).
  const grid = (
    <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-30">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={`h-${i}`} className="absolute h-px bg-foreground/10" style={{ top: `${12.5 * (i + 1)}%`, left: 0, right: 0 }} />
      ))}
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={`v-${i}`} className="absolute w-px bg-foreground/10" style={{ left: `${8.33 * (i + 1)}%`, top: 0, bottom: 0 }} />
      ))}
    </div>
  )

  if (mode === "top") {
    return (
      <NavPersonaProvider persona={persona}>
        <div className="min-h-screen bg-background flex flex-col">
          {grid}
          <AppNav user={user} isAdmin={isAdmin} />
          <div className="flex flex-1 min-h-0 relative z-10">
            <AppSubnav />
            <main className="flex-1 min-w-0 pb-16 md:pb-0">{children}</main>
          </div>
          <AppMobileNav user={user} isAdmin={isAdmin} />
        </div>
      </NavPersonaProvider>
    )
  }

  return (
    <div className="min-h-screen bg-background flex">
      {grid}
      {/* Sidebar width var so the main column follows the collapse toggle. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `try{document.documentElement.style.setProperty('--sidebar-w',localStorage.getItem('anker:sidebar')==='collapsed'?'4rem':'16rem')}catch(e){}`,
        }}
      />
      <DashboardSidebar user={user} isAdmin={isAdmin} persona={persona} />
      <main className="flex-1 relative z-10 transition-[margin] duration-200" style={{ marginLeft: "var(--sidebar-w, 16rem)" }}>
        <DashboardTopbar />
        {children}
      </main>
    </div>
  )
}
