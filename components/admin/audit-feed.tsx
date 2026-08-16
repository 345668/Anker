"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Search, Loader2, ShieldCheck } from "lucide-react"
import type { AuditEvent } from "@/lib/audit/audit-log"

const fmtTime = (s: string) => new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })

/** Human label for an action slug, e.g. "fund.status_changed" → "Fund status changed". */
function actionLabel(a: string): string {
  const [, verb] = a.includes(".") ? a.split(".") : ["", a]
  const t = (verb || a).replace(/_/g, " ")
  return t.charAt(0).toUpperCase() + t.slice(1)
}
function actionColor(a: string): string {
  if (/delete|remove|cancel|writ/.test(a)) return "bg-rose-500/10 text-rose-600 dark:text-rose-400"
  if (/approve|complete|close|won/.test(a)) return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
  if (/create|add|new|issue/.test(a)) return "bg-[#2f45e0]/10 text-[#2f45e0]"
  return "bg-foreground/[0.06] text-muted-foreground"
}

export function AuditFeed({
  initialEvents, initialCursor, stats, actions,
}: {
  initialEvents: AuditEvent[]
  initialCursor: string | null
  stats: { total: number; last24h: number; actors: number }
  actions: string[]
}) {
  const [events, setEvents] = useState(initialEvents)
  const [cursor, setCursor] = useState(initialCursor)
  const [actor, setActor] = useState("")
  const [action, setAction] = useState("")
  const [loading, setLoading] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (reset: boolean, before: string | null) => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (actor.trim()) p.set("actor", actor.trim())
      if (action) p.set("action", action)
      if (before) p.set("before", before)
      const res = await fetch(`/api/admin/audit?${p.toString()}`)
      const d = await res.json()
      if (res.ok) {
        setEvents((prev) => (reset ? d.events : [...prev, ...d.events]))
        setCursor(d.nextCursor)
      }
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [actor, action])

  // Re-query from the top when filters change (debounced for the actor field).
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => load(true, null), 300)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [actor, action, load])

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-px bg-foreground/10 border border-foreground/10 rounded-lg overflow-hidden">
        <Stat label="Events" value={stats.total.toLocaleString()} />
        <Stat label="Last 24h" value={stats.last24h.toLocaleString()} />
        <Stat label="Distinct actors" value={stats.actors.toLocaleString()} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Filter by actor email…" className="w-full h-9 pl-9 pr-3 text-sm border border-foreground/15 rounded-md bg-background outline-none focus:border-foreground/40" />
        </div>
        <select value={action} onChange={(e) => setAction(e.target.value)} className="h-9 px-2 text-sm border border-foreground/15 rounded-md bg-background">
          <option value="">All actions</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div className="border border-foreground/10 rounded-lg overflow-hidden">
        {events.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-muted-foreground">
            <ShieldCheck className="w-8 h-8 mx-auto mb-3 opacity-40" />
            {loading ? "Loading…" : "No audit events match. Actions across the platform will appear here as they happen."}
          </div>
        ) : (
          <ul className="divide-y divide-foreground/[0.06]">
            {events.map((e) => (
              <li key={e.id} className="px-4 py-3 flex items-start gap-3 hover:bg-foreground/[0.02]">
                <span className={`shrink-0 mt-0.5 text-[11px] font-medium px-2 py-0.5 rounded ${actionColor(e.action)}`}>{actionLabel(e.action)}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">
                    <span className="font-medium">{e.actor_email ?? "system"}</span>
                    {e.target_label && <span className="text-muted-foreground"> · {e.target_type} “{e.target_label}”</span>}
                  </div>
                  {Object.keys(e.metadata).length > 0 && (
                    <div className="mt-0.5 text-xs text-muted-foreground font-mono truncate">
                      {Object.entries(e.metadata).map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}
                    </div>
                  )}
                </div>
                <span className="shrink-0 text-[11px] font-mono text-muted-foreground whitespace-nowrap">{fmtTime(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {cursor && (
        <div className="flex justify-center">
          <button onClick={() => load(false, cursor)} disabled={loading} className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Load more
          </button>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background p-3.5">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  )
}
