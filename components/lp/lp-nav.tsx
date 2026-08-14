"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const TABS = [
  { label: "Capital account", href: "/lp" },
  { label: "Distributions", href: "/lp/distributions" },
  { label: "Documents", href: "/lp/documents" },
]

/** LP portal sub-navigation (teal accent — LP persona). */
export function LpNav() {
  const pathname = usePathname() || ""
  return (
    <nav className="border-b border-foreground/10 bg-background/80 backdrop-blur-sm sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-6 lg:px-10 flex items-center gap-6 overflow-x-auto">
        {TABS.map((t) => {
          const active = t.href === "/lp" ? pathname === "/lp" : pathname.startsWith(t.href)
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`shrink-0 relative py-3 text-sm transition-colors ${active ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
              {active ? <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-[#127c78]" /> : null}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
