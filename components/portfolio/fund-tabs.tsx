"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const BASE = "/dashboard/portfolio/fund"
const TABS: { label: string; href: string; exact?: boolean }[] = [
  { label: "Overview", href: BASE, exact: true },
  { label: "Fund performance", href: `${BASE}/performance` },
  { label: "Investments", href: `${BASE}/investments` },
  { label: "Partners", href: `${BASE}/partners` },
  { label: "Capital activity", href: `${BASE}/calls` },
  { label: "Distributions", href: `${BASE}/distributions` },
  { label: "Financial reporting", href: `${BASE}/reports` },
  { label: "Economics", href: `${BASE}/economics` },
  { label: "Legal", href: `${BASE}/legal` },
]

/** Carta-style fund detail tab bar. */
export function FundTabs() {
  const pathname = usePathname() || ""
  return (
    <nav className="border-b border-foreground/10 bg-background/80 backdrop-blur-sm sticky top-14 z-30">
      <div className="max-w-6xl px-6 lg:px-8 flex items-center gap-6 overflow-x-auto">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + "/")
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`shrink-0 relative py-3.5 text-sm transition-colors ${active ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
              {active ? <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-[#2f45e0]" /> : null}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
