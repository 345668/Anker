"use client"

import { useMemo, useState } from "react"
import { Search, Users } from "lucide-react"
import type { LpSharingRow } from "@/lib/portfolio/information-sharing"
import { EmptyState } from "@/components/shell/empty-state"
import { PermissionsTooltip } from "@/components/portfolio/permissions-tooltip"

/**
 * Carta-style information-sharing matrix — per-LP × category disclosure grid.
 * Green "Sharing" / red "Not sharing" dots, click to toggle. Optimistic, with
 * rollback if the PATCH fails.
 */

type Cat = "soi" | "deal_irr" | "fund_performance" | "cap_account"
const CATS: { key: Cat; label: string }[] = [
  { key: "soi", label: "SOI" },
  { key: "deal_irr", label: "Deal IRR" },
  { key: "fund_performance", label: "Fund performance" },
  { key: "cap_account", label: "Cap. account" },
]

export function InformationSharingMatrix({ initial, fundId }: { initial: LpSharingRow[]; fundId: string }) {
  const [rows, setRows] = useState<LpSharingRow[]>(initial)
  const [q, setQ] = useState("")
  const [pending, setPending] = useState<Set<string>>(new Set())

  const filtered = useMemo(
    () => rows.filter((r) => r.lp_name.toLowerCase().includes(q.toLowerCase())),
    [rows, q],
  )

  async function toggle(lpId: string, cat: Cat) {
    const row = rows.find((r) => r.lp_id === lpId)
    if (!row) return
    const next = !row[cat]
    const key = `${lpId}:${cat}`
    setPending((p) => new Set(p).add(key))
    setRows((rs) => rs.map((r) => (r.lp_id === lpId ? { ...r, [cat]: next } : r)))
    try {
      const res = await fetch("/api/portfolio/information-sharing", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fundId, lpId, category: cat, value: next }),
      })
      if (!res.ok) throw new Error()
    } catch {
      // rollback
      setRows((rs) => rs.map((r) => (r.lp_id === lpId ? { ...r, [cat]: !next } : r)))
    } finally {
      setPending((p) => { const n = new Set(p); n.delete(key); return n })
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search partners…"
            className="h-9 w-64 rounded-md border border-foreground/15 bg-background pl-8 pr-3 text-sm outline-none focus:border-foreground/40"
          />
        </div>
        <p className="text-xs text-muted-foreground hidden sm:block">Click a cell to change what each LP can see.</p>
      </div>

      <div className="overflow-x-auto border border-foreground/10 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-foreground/10 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              <th className="text-left px-4 py-2.5 sticky left-0 bg-background">Partner</th>
              <th className="text-left px-4 py-2.5 whitespace-nowrap">Can see</th>
              {CATS.map((c) => (
                <th key={c.key} className="text-left px-4 py-2.5 whitespace-nowrap">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={CATS.length + 2} className="px-4">
                <EmptyState compact icon={Users} title="No partners" description={q ? "No partners match your search." : "Add LPs on the fund overview to manage their disclosures here."} />
              </td></tr>
            ) : filtered.map((r) => (
              <tr key={r.lp_id} className="border-b border-foreground/[0.06] last:border-0">
                <td className="px-4 py-2.5 font-medium sticky left-0 bg-background">{r.lp_name}</td>
                <td className="px-4 py-2.5">
                  <PermissionsTooltip items={CATS.map((c) => ({ label: c.label, granted: r[c.key] }))} />
                </td>
                {CATS.map((c) => {
                  const on = r[c.key]
                  const busy = pending.has(`${r.lp_id}:${c.key}`)
                  return (
                    <td key={c.key} className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => toggle(r.lp_id, c.key)}
                        disabled={busy}
                        className={`inline-flex items-center gap-1.5 text-[13px] rounded-md px-2 py-1 -ml-2 hover:bg-foreground/[0.05] transition-colors ${busy ? "opacity-50" : ""}`}
                        aria-pressed={on}
                      >
                        <span className={`w-2 h-2 rounded-full ${on ? "bg-emerald-500" : "bg-rose-500"}`} />
                        <span className={on ? "text-foreground" : "text-muted-foreground"}>{on ? "Sharing" : "Not sharing"}</span>
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
