"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, CornerDownLeft } from "lucide-react"

type Dest = { label: string; href: string; group: string }

// Curated navigation targets for ⌘K. Kept in sync with the sidebar's key pages.
const DESTS: Dest[] = [
  { label: "Dashboard", href: "/dashboard", group: "Overview" },
  { label: "AI Assistant", href: "/dashboard/assistant", group: "Overview" },
  { label: "ANKER AI", href: "/dashboard/anker-ai", group: "Overview" },
  { label: "Discover investors", href: "/dashboard/discover", group: "Source & match" },
  { label: "Find Investors", href: "/dashboard/find-investors", group: "Source & match" },
  { label: "LP Matchmaking", href: "/dashboard/matchmaking", group: "Source & match" },
  { label: "Deal Flow", href: "/dashboard/portfolio/fund/deals", group: "Source & match" },
  { label: "Deals", href: "/dashboard/deals", group: "Source & match" },
  { label: "Deals — table", href: "/dashboard/deals/table", group: "Source & match" },
  { label: "Investment firms — table", href: "/dashboard/investors/table", group: "Source & match" },
  { label: "Pipeline", href: "/dashboard/pipeline", group: "Source & match" },
  { label: "CRM", href: "/dashboard/crm", group: "Relationships" },
  { label: "Contacts — table", href: "/dashboard/crm/table", group: "Relationships" },
  { label: "Network", href: "/dashboard/network", group: "Relationships" },
  { label: "Outreach", href: "/dashboard/outreach", group: "Relationships" },
  { label: "LP Campaign", href: "/dashboard/outreach/lp-campaign", group: "Relationships" },
  { label: "Send Center", href: "/dashboard/send-center", group: "Relationships" },
  { label: "Entities (Funds & SPVs)", href: "/dashboard/entities", group: "Fund & studio" },
  { label: "Fund", href: "/dashboard/portfolio/fund", group: "Fund & studio" },
  { label: "Fund performance", href: "/dashboard/portfolio/fund/performance", group: "Fund & studio" },
  { label: "Capital calls — table", href: "/dashboard/portfolio/fund/calls/table", group: "Fund & studio" },
  { label: "Distributions — table", href: "/dashboard/portfolio/fund/distributions/table", group: "Fund & studio" },
  { label: "Financial reporting", href: "/dashboard/portfolio/fund/reports", group: "Fund & studio" },
  { label: "Portfolio", href: "/dashboard/portfolio", group: "Fund & studio" },
  { label: "Investments", href: "/dashboard/portfolio/fund/investments", group: "Fund & studio" },
  { label: "Partners (LPs)", href: "/dashboard/portfolio/fund/partners", group: "Fund & studio" },
  { label: "Cap Table", href: "/dashboard/cap-table", group: "Fund & studio" },
  { label: "Runway", href: "/dashboard/runway", group: "Fund & studio" },
  { label: "Term Sheet", href: "/dashboard/term-sheet", group: "Fund & studio" },
  { label: "Decks", href: "/dashboard/decks", group: "Fund & studio" },
  { label: "Documents", href: "/dashboard/documents", group: "Fund & studio" },
  { label: "Data Room", href: "/dashboard/data-room", group: "Fund & studio" },
  { label: "Tools", href: "/dashboard/tools", group: "Toolbox" },
  { label: "Analytics", href: "/dashboard/analytics", group: "Toolbox" },
  { label: "Settings", href: "/dashboard/settings", group: "Toolbox" },
]

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((v) => !v) }
      if (e.key === "Escape") setOpen(false)
    }
    function onOpen() { setOpen(true) }
    document.addEventListener("keydown", onKey)
    window.addEventListener("open-command-palette", onOpen as EventListener)
    return () => { document.removeEventListener("keydown", onKey); window.removeEventListener("open-command-palette", onOpen as EventListener) }
  }, [])

  useEffect(() => {
    if (open) { setQ(""); setIdx(0); setTimeout(() => inputRef.current?.focus(), 20) }
  }, [open])

  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return DESTS
    return DESTS.filter((d) => `${d.label} ${d.group}`.toLowerCase().includes(s))
  }, [q])

  function go(d: Dest) { setOpen(false); router.push(d.href) }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4" role="dialog" aria-modal="true">
      <button aria-label="Close" className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-xl rounded-lg border border-foreground/15 bg-popover shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-foreground/10">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setIdx(0) }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)) }
              if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)) }
              if (e.key === "Enter" && results[idx]) { e.preventDefault(); go(results[idx]) }
            }}
            placeholder="Navigate to…"
            className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="text-[10px] font-mono text-muted-foreground border border-foreground/15 rounded px-1.5 py-0.5">ESC</kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto py-1.5">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">No matches.</div>
          ) : (
            results.map((d, i) => (
              <button
                key={d.href}
                onClick={() => go(d)}
                onMouseEnter={() => setIdx(i)}
                className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm ${i === idx ? "bg-foreground/[0.06]" : ""}`}
              >
                <span>{d.label}</span>
                <span className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{d.group}</span>
                  {i === idx && <CornerDownLeft className="w-3.5 h-3.5 text-muted-foreground" />}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
