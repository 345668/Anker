"use client"

import { useEffect, useRef, useState } from "react"
import { Building2, Wallet, Check, ChevronsUpDown, Plus } from "lucide-react"

type Membership = { orgId: string; name: string; kind: "company" | "fund"; persona: string | null }

/** Carta-style entity switcher for the app top bar. Self-fetches memberships. */
export function EntitySwitcher() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Membership[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch("/api/org/active")
      .then((r) => r.json())
      .then((d) => { setItems(d.memberships ?? []); setActiveId(d.activeOrgId ?? null) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  const active = items.find((m) => m.orgId === activeId) ?? items[0] ?? null

  async function pick(orgId: string) {
    if (orgId === activeId) { setOpen(false); return }
    setBusy(true)
    try {
      await fetch("/api/org/active", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orgId }) })
      // hard reload so server components re-render under the new active org
      window.location.reload()
    } catch { setBusy(false) }
  }

  if (!active) return null
  const Icon = active.kind === "fund" ? Wallet : Building2

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="inline-flex items-center gap-2.5 rounded-md border border-foreground/15 bg-background px-3 py-1.5 text-sm hover:border-foreground/40 transition-colors max-w-[240px]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="grid place-items-center w-6 h-6 rounded bg-foreground/[0.06] text-foreground/70 shrink-0">
          <Icon className="w-3.5 h-3.5" />
        </span>
        <span className="truncate font-medium">{active.name}</span>
        <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-72 z-50 rounded-md border border-foreground/15 bg-popover shadow-lg py-1.5" role="listbox">
          <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">Workspaces</div>
          {items.map((m) => {
            const MIcon = m.kind === "fund" ? Wallet : Building2
            const on = m.orgId === active.orgId
            return (
              <button
                key={m.orgId}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => pick(m.orgId)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-foreground/[0.05] text-left"
              >
                <span className="grid place-items-center w-6 h-6 rounded bg-foreground/[0.06] text-foreground/70 shrink-0">
                  <MIcon className="w-3.5 h-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{m.name}</span>
                  <span className="block text-[11px] text-muted-foreground capitalize">{m.kind}{m.persona ? ` · ${m.persona}` : ""}</span>
                </span>
                {on && <Check className="w-4 h-4 text-foreground shrink-0" />}
              </button>
            )
          })}
          <div className="mt-1 pt-1 border-t border-foreground/10">
            <a href="/onboarding" className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground">
              <span className="grid place-items-center w-6 h-6 rounded border border-dashed border-foreground/30 shrink-0"><Plus className="w-3.5 h-3.5" /></span>
              Create a workspace
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
