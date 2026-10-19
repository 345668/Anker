"use client"

/** The workspace's runs (docs/architecture/63 section 5, history): open one, compare two, run again with the same settings, download everything as a zip. */
import { useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { describeFilters, hasFilters, parseFilters } from "@/lib/matching/filters"
import { cn } from "@/lib/utils"

export interface HistoryRun {
  id: string; fundProfileId: string; fundName: string; createdAt: string; source: string; parentSessionId: string | null
  filters: unknown; options: unknown; exclusions: any
  qualifiedFirms: number; qualifiedContacts: number; contactsWithEmail: number; anchorCandidates: number
}
interface Comparison { newer: HistoryRun; older: HistoryRun; newFirms: string[]; droppedFirms: string[]; newCount: number; droppedCount: number; firmsDelta: number; contactsDelta: number }

const SOURCE: Record<string, string> = { page: "Page", assistant: "Anker AI", telegram: "Telegram", agent: "Agent" }
const n = (v: number) => v.toLocaleString("en-US")
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
const mandateText = (f: unknown) => { try { const p = parseFilters(f); return hasFilters(p) ? describeFilters(p) : "Whole directory" } catch { return "Whole directory" } }
const signed = (v: number) => (v > 0 ? `+${n(v)}` : n(v))

export function LpHistory({ runs, openId, onOpen, onRerun, canRerun, busy }: { runs: HistoryRun[]; openId: string | null; onOpen: (id: string) => void; onRerun: (r: HistoryRun) => void; canRerun: (r: HistoryRun) => boolean; busy: boolean }) {
  const [pick, setPick] = useState<string[]>([])
  const [cmp, setCmp] = useState<Comparison | null>(null), [cmpBusy, setCmpBusy] = useState(false), [err, setErr] = useState<string | null>(null)
  const toggle = (id: string) => { setCmp(null); setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p.slice(-1), id])) }
  async function compare() {
    if (pick.length !== 2) return
    setCmpBusy(true); setErr(null)
    try {
      const r = await fetch(`/api/lp/matching/sessions/${pick[0]}/compare?with=${pick[1]}`), j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || "The comparison could not be made.")
      setCmp(j)
    } catch (e: any) { setErr(e.message) } finally { setCmpBusy(false) }
  }
  return (
    <section className="border border-foreground/10 rounded-lg p-6" aria-label="Run history">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-display text-xl">Runs</h2>
        {pick.length === 2 && <Button size="sm" variant="outline" disabled={cmpBusy} onClick={compare}>{cmpBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Compare the two"}</Button>}
      </div>
      {runs.length === 0 ? <p className="text-sm text-muted-foreground">No runs yet. Your workspace&apos;s runs, whoever started them, appear here.</p> : (
        <ul className="space-y-3 max-h-[480px] overflow-y-auto">
          {runs.map((r) => (
            <li key={r.id} className={cn("p-3 border rounded-md transition-colors", r.id === openId ? "border-foreground/50" : "border-foreground/10 hover:border-foreground/30")}>
              <div className="flex items-start justify-between gap-2">
                <label className="flex items-start gap-2 min-w-0">
                  <input type="checkbox" checked={pick.includes(r.id)} onChange={() => toggle(r.id)} className="mt-1" aria-label={`Choose the run of ${when(r.createdAt)} to compare`} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium truncate">{r.fundName}</span>
                    <span className="block font-mono text-[10px] text-muted-foreground">{when(r.createdAt)} · {SOURCE[r.source] ?? r.source}{r.parentSessionId ? " · refines an earlier run" : ""}</span>
                  </span>
                </label>
                <span className="font-mono text-[10px] text-muted-foreground shrink-0">{n(r.qualifiedFirms)} firms · {n(r.qualifiedContacts)} people</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">{mandateText(r.filters)}{r.exclusions?.total ? ` · ${n(r.exclusions.total)} left out` : ""}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs">
                <button type="button" onClick={() => onOpen(r.id)} className="underline underline-offset-2">Open results</button>
                <button type="button" disabled={busy || !canRerun(r)} onClick={() => onRerun(r)} className="underline underline-offset-2 disabled:opacity-40 disabled:no-underline" title={canRerun(r) ? "Runs again with the same fund, mandate and options" : "This fund profile is no longer available"}>Run again</button>
                <a href={`/api/lp/export/bundle/${r.id}`} className="inline-flex items-center gap-1 underline underline-offset-2"><Download className="w-3 h-3" />Zip</a>
              </div>
            </li>
          ))}
        </ul>
      )}
      {err && <p role="alert" className="text-sm text-destructive mt-3">{err}</p>}
      {cmp && (
        <div className="mt-4 rounded-md bg-foreground/[0.04] p-4 text-sm space-y-2" role="region" aria-label="Comparison">
          <p><strong>{when(cmp.newer.createdAt)}</strong> against <strong>{when(cmp.older.createdAt)}</strong>: {signed(cmp.firmsDelta)} firms, {signed(cmp.contactsDelta)} people; {n(cmp.newCount)} firms new, {n(cmp.droppedCount)} no longer shown.</p>
          <p className="text-xs text-muted-foreground">Mandate then: {mandateText(cmp.older.filters)}. Mandate now: {mandateText(cmp.newer.filters)}.</p>
          {cmp.newFirms.length > 0 && <p className="text-xs"><strong>New:</strong> {cmp.newFirms.join(", ")}{cmp.newCount > cmp.newFirms.length ? ", …" : ""}</p>}
          {cmp.droppedFirms.length > 0 && <p className="text-xs"><strong>No longer shown:</strong> {cmp.droppedFirms.join(", ")}{cmp.droppedCount > cmp.droppedFirms.length ? ", …" : ""}</p>}
        </div>
      )}
    </section>
  )
}
