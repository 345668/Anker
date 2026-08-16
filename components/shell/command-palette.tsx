"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, CornerDownLeft } from "lucide-react"
import { flatDestinations, personaVisible, type CommandDest } from "@/lib/nav/taxonomy"
import type { Persona } from "@/lib/org/active"

type Dest = CommandDest

/**
 * Deep links + actions the main nav doesn't surface but power users want from
 * ⌘K (record views, "new" flows, account). Persona-scoped; everything else comes
 * from the shared taxonomy via flatDestinations, so the palette never drifts.
 */
const EXTRAS: (Dest & { personas?: Persona[] })[] = [
  { label: "Contacts — table", href: "/dashboard/crm/table", group: "Relationships", personas: ["founder", "vc"] },
  { label: "Deals — table", href: "/dashboard/deals/table", group: "Source & match", personas: ["vc"] },
  { label: "Investment firms — table", href: "/dashboard/investors/table", group: "Source & match", personas: ["vc"] },
  { label: "Entities (Funds & SPVs)", href: "/dashboard/entities", group: "Fund OS", personas: ["vc"] },
  { label: "Investments", href: "/dashboard/portfolio/fund/investments", group: "Fund OS", personas: ["vc"] },
  { label: "Partners (LPs)", href: "/dashboard/portfolio/fund/partners", group: "Fund OS", personas: ["vc"] },
  { label: "Capital calls — table", href: "/dashboard/portfolio/fund/calls/table", group: "Fund OS", personas: ["vc"] },
  { label: "Initiate capital call", href: "/dashboard/portfolio/fund/calls/new", group: "Fund OS", personas: ["vc"] },
  { label: "Distributions — table", href: "/dashboard/portfolio/fund/distributions/table", group: "Fund OS", personas: ["vc"] },
  { label: "Initiate distribution", href: "/dashboard/portfolio/fund/distributions/new", group: "Fund OS", personas: ["vc"] },
]

const ACCOUNT: Dest[] = [
  { label: "Settings", href: "/dashboard/settings", group: "Account" },
  { label: "API Keys", href: "/dashboard/settings/api-keys", group: "Account", desc: "Gemini / Claude keys · provider · test" },
  { label: "Extension", href: "/dashboard/settings/extension-tokens", group: "Account", desc: "LinkedIn extension · tokens" },
  { label: "Help", href: "/dashboard/help", group: "Account", desc: "Support & docs" },
]

export function CommandPalette({ persona = null }: { persona?: Persona | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Persona-scoped destinations, sourced from the shared taxonomy so ⌘K always
  // matches the nav. Home first, then nav, then power-user deep links + account.
  const DESTS: Dest[] = useMemo(() => [
    { label: "Home", href: "/dashboard", group: "Overview" },
    ...flatDestinations(persona),
    ...EXTRAS.filter((e) => personaVisible(e.personas, persona)),
    ...ACCOUNT,
  ], [persona])

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
    return DESTS.filter((d) => `${d.label} ${d.group} ${d.desc ?? ""}`.toLowerCase().includes(s))
  }, [q, DESTS])

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
                key={`${d.group}|${d.href}`}
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
