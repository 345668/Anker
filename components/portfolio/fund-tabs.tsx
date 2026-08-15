"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronDown } from "lucide-react"

const BASE = "/dashboard/portfolio/fund"

const TABS: { label: string; href: string; exact?: boolean }[] = [
  { label: "Overview", href: BASE, exact: true },
  { label: "Fund performance", href: `${BASE}/performance` },
  { label: "Investments", href: `${BASE}/investments` },
  { label: "Partners", href: `${BASE}/partners` },
  { label: "Capital activity", href: `${BASE}/calls` },
  { label: "Distributions", href: `${BASE}/distributions` },
  { label: "Financial reporting", href: `${BASE}/reports` },
  { label: "Data explorer", href: `${BASE}/explorer` },
]

// Carta's "More ▾" overflow — secondary fund routes that don't earn a top slot.
const MORE: { label: string; href: string }[] = [
  { label: "Tear sheet", href: `${BASE}/tear-sheet` },
  { label: "Economics", href: `${BASE}/economics` },
  { label: "Ledger", href: `${BASE}/ledger` },
  { label: "Legal", href: `${BASE}/legal` },
  { label: "Management co.", href: `${BASE}/management` },
  { label: "Syndication", href: `${BASE}/syndication` },
  { label: "Fund plan", href: `${BASE}/plan` },
  { label: "Assessment", href: `${BASE}/assessment` },
  { label: "LPs", href: `${BASE}/lps` },
  { label: "Documents", href: `${BASE}/documents` },
]

/** Carta-style fund detail tab bar with a "More" overflow. */
export function FundTabs() {
  const pathname = usePathname() || ""
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/")
  const moreActive = MORE.some((m) => isActive(m.href))

  return (
    <nav className="border-b border-foreground/10 bg-background/80 backdrop-blur-sm sticky top-14 z-30">
      <div className="max-w-6xl px-6 lg:px-8 flex items-center gap-6 overflow-x-auto">
        {TABS.map((t) => {
          const active = isActive(t.href, t.exact)
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

        <div ref={ref} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={`relative inline-flex items-center gap-1 py-3.5 text-sm transition-colors ${moreActive ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
            aria-haspopup="menu" aria-expanded={open}
          >
            More <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            {moreActive ? <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-[#2f45e0]" /> : null}
          </button>
          {open && (
            <div className="absolute right-0 top-full mt-1 w-52 z-50 rounded-md border border-foreground/15 bg-popover shadow-lg py-1.5">
              {MORE.map((m) => {
                const active = isActive(m.href)
                return (
                  <Link
                    key={m.href}
                    href={m.href}
                    onClick={() => setOpen(false)}
                    className={`block px-3.5 py-2 text-sm hover:bg-foreground/[0.05] ${active ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {m.label}
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
