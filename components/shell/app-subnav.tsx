"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { useNavPersona } from "@/components/shell/nav-persona"
import { groupsForPersona } from "@/lib/nav/taxonomy"

/**
 * Contextual left rail for the top-nav shell — the density answer for VC
 * workflows (~25 destinations). It's the same grouped taxonomy the Products
 * mega-menu shows, but persistent while you work so you don't re-open the menu.
 * Collapsible (state persisted); hidden on mobile, where the bottom tab bar +
 * sheet take over.
 */
export function AppSubnav() {
  const { active } = useNavPersona()
  const pathname = usePathname()
  const groups = groupsForPersona(active)
  const [collapsed, setCollapsed] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try { setCollapsed(localStorage.getItem("anker:subnav") === "collapsed") } catch { /* ignore */ }
    setReady(true)
  }, [])
  function toggle() {
    setCollapsed((c) => {
      const next = !c
      try { localStorage.setItem("anker:subnav", next ? "collapsed" : "open") } catch { /* ignore */ }
      return next
    })
  }

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname === href || pathname.startsWith(href + "/")

  return (
    <aside className={`hidden md:flex flex-col shrink-0 border-r border-foreground/10 transition-[width] duration-200 ${collapsed ? "w-14" : "w-60"} ${ready ? "" : "invisible"}`}>
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {groups.map((g) => (
          <div key={g.heading} className="mb-4">
            {!collapsed && <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground px-3 mb-1.5">{g.heading}</div>}
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const on = isActive(it.href)
                return (
                  <li key={it.href + it.label}>
                    <Link
                      href={it.href}
                      title={collapsed ? it.label : undefined}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${on ? "bg-foreground/[0.07] text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]"} ${collapsed ? "justify-center px-0" : ""}`}
                    >
                      {it.icon && <it.icon className={`w-4 h-4 shrink-0 ${on ? "text-[#e5380f]" : ""}`} />}
                      {!collapsed && <span className="truncate">{it.label}</span>}
                      {!collapsed && it.badge && <span className="ml-auto text-[8px] font-mono uppercase tracking-wider text-[#e5380f]">{it.badge}</span>}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
      <button
        onClick={toggle}
        aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        className="flex items-center gap-2 border-t border-foreground/10 px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
      >
        {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <><PanelLeftClose className="w-4 h-4" /> Collapse</>}
      </button>
    </aside>
  )
}
