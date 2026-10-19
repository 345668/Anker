"use client"

/** What a run found and what it left out (docs/architecture/63 section 5, result summary): the change since the last run, every reason a row was removed, how much rests on known facts, and a plain explanation when nothing qualified. */
import { cn } from "@/lib/utils"

export interface RunExclusions { total: number; inCrm?: number; declined?: number; saved?: number; alreadyYours?: number; suppressed?: number; jurisdiction?: number; source?: number; restrictedPerson?: number }
export interface SincePrevious { previousSessionId: string; previousAt: string; newCount: number; droppedCount: number; newFirms: string[]; droppedFirms: string[]; firmsDelta: number; contactsDelta: number }
export interface SummaryInput {
  fundName: string; durationMs: number
  totals: { rawFirms: number; rawContacts: number; qualifiedFirms: number; qualifiedContacts: number }
  exclusions?: RunExclusions | null
  confidenceCounts?: { firms: Record<"high" | "medium" | "low", number>; contacts: Record<"high" | "medium" | "low", number> } | null
  sincePrevious?: SincePrevious | null
  filterSummary?: string
}

export const EXCLUSION_LABELS: Array<[keyof RunExclusions, string]> = [
  ["inCrm", "already in your CRM"], ["declined", "passed or declined"], ["saved", "excluded by you"], ["alreadyYours", "already your investors"],
  ["suppressed", "suppressed addresses"], ["jurisdiction", "in countries your fund does not approach"], ["source", "from sources not cleared for matching"], ["restrictedPerson", "asked us to restrict their data"],
]
const n = (v: number) => v.toLocaleString("en-US")
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" })

export function LpRunSummary({ s, minScore, onShowKnown }: { s: SummaryInput; minScore: number; onShowKnown?: () => void }) {
  const q = s.totals.qualifiedFirms + s.totals.qualifiedContacts
  const ex = s.exclusions && s.exclusions.total > 0 ? s.exclusions : null
  const c = s.confidenceCounts?.firms, cTotal = c ? c.high + c.medium + c.low : 0
  return (
    <section className="border border-foreground/10 rounded-lg p-6 space-y-4" aria-label="Run summary">
      <div>
        <h2 className="font-display text-xl">{q ? `${n(s.totals.qualifiedFirms)} firms and ${n(s.totals.qualifiedContacts)} people qualified` : "No LP qualified"}</h2>
        <p className="text-sm text-muted-foreground">{s.fundName} · {(s.durationMs / 1000).toFixed(1)} s{s.filterSummary ? ` · ${s.filterSummary}` : ""}</p>
      </div>

      {s.sincePrevious && (
        <div className="text-sm">
          <p>
            Since your run on {day(s.sincePrevious.previousAt)}: <strong>{n(s.sincePrevious.newCount)}</strong> firms new, <strong>{n(s.sincePrevious.droppedCount)}</strong> no longer shown
            {s.sincePrevious.firmsDelta ? ` (${s.sincePrevious.firmsDelta > 0 ? "+" : ""}${n(s.sincePrevious.firmsDelta)} firms in all)` : ""}.
          </p>
          {(s.sincePrevious.newFirms.length > 0 || s.sincePrevious.droppedFirms.length > 0) && (
            <details className="mt-1 text-muted-foreground">
              <summary className="cursor-pointer text-xs">Which ones</summary>
              {s.sincePrevious.newFirms.length > 0 && <p className="text-xs mt-1"><strong className="text-foreground">New:</strong> {s.sincePrevious.newFirms.join(", ")}{s.sincePrevious.newCount > s.sincePrevious.newFirms.length ? ", …" : ""}</p>}
              {s.sincePrevious.droppedFirms.length > 0 && <p className="text-xs mt-1"><strong className="text-foreground">No longer shown:</strong> {s.sincePrevious.droppedFirms.join(", ")}{s.sincePrevious.droppedCount > s.sincePrevious.droppedFirms.length ? ", …" : ""}</p>}
            </details>
          )}
        </div>
      )}

      {ex && (
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Left out before scoring · {n(ex.total)}</p>
          <ul className="flex flex-wrap gap-1.5">
            {EXCLUSION_LABELS.filter(([k]) => (ex[k] as number | undefined)).map(([k, label]) => (
              <li key={k} className="rounded-full border border-foreground/15 px-2.5 py-1 text-xs"><strong>{n(ex[k] as number)}</strong> {label}</li>
            ))}
          </ul>
        </div>
      )}

      {cTotal > 0 && c && (
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">How much each match rests on known facts</p>
          <div className="flex h-2 rounded-full overflow-hidden bg-foreground/10" role="img" aria-label={`${c.high} high, ${c.medium} medium, ${c.low} low confidence`}>
            <div className="bg-emerald-500/70" style={{ width: `${(c.high / cTotal) * 100}%` }} />
            <div className="bg-amber-500/70" style={{ width: `${(c.medium / cTotal) * 100}%` }} />
            <div className="bg-foreground/30" style={{ width: `${(c.low / cTotal) * 100}%` }} />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">{n(c.high)} high · {n(c.medium)} medium · {n(c.low)} low. Low means the directory has little on that investor; open one to see what is missing.</p>
        </div>
      )}

      {!q && (
        <div className={cn("rounded-md bg-foreground/[0.04] p-4 text-sm space-y-2")}>
          <p>{n(s.totals.rawFirms)} firms and {n(s.totals.rawContacts)} people were looked at{ex ? `, ${n(ex.total)} were left out by your rules` : ""}, and none scored {minScore} or more.</p>
          <ul className="list-disc pl-5 text-muted-foreground space-y-1">
            {s.filterSummary && <li>The mandate (&quot;{s.filterSummary}&quot;) may be narrower than your fund needs. Clear a region, country or type above.</li>}
            {ex && (ex.inCrm ?? 0) > 0 && <li>{n(ex.inCrm!)} are already in your CRM. {onShowKnown && <button type="button" onClick={onShowKnown} className="underline">Show them anyway</button>}</li>}
            {ex && ((ex.jurisdiction ?? 0) > 0) && <li>{n(ex.jurisdiction!)} are in countries your fund&apos;s rules exclude.</li>}
            <li>Lower the minimum qualification score under Settings, or check the sectors and geography on the fund profile.</li>
          </ul>
        </div>
      )}
    </section>
  )
}
