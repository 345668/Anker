"use client"

import { useEffect, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { DashboardSidebar } from "@/components/tesseract/dashboard-sidebar"
import { DashboardTopbar } from "@/components/shell/dashboard-topbar"
import { AppNav } from "@/components/shell/app-nav"
import type { Persona } from "@/lib/org/active"

/**
 * Chooses the dashboard chrome: the legacy left sidebar (default) or the new
 * website-style top nav (redesign Phase 1), gated by the `anker:nav` flag in
 * localStorage. Set `localStorage.anker:nav = "top"` to dogfood the top nav;
 * anything else keeps the sidebar.
 *
 * The flag is client-only, so we render the sidebar during SSR and the first
 * paint, then swap to the top nav after mount if the flag is set. That's a brief
 * swap for dogfooders only; when the redesign ships this becomes the default and
 * the flag/branch goes away.
 */
export function NavModeShell({
  user, isAdmin, persona, children,
}: {
  user: User
  isAdmin: boolean
  persona: Persona | null
  children: React.ReactNode
}) {
  const [mode, setMode] = useState<"sidebar" | "top">("sidebar")
  useEffect(() => {
    try {
      if (localStorage.getItem("anker:nav") === "top") setMode("top")
    } catch { /* ignore */ }
  }, [])

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
      <div className="min-h-screen bg-background">
        {grid}
        <AppNav user={user} isAdmin={isAdmin} persona={persona} />
        <main className="relative z-10">{children}</main>
      </div>
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
