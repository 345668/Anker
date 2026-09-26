"use client"

/**
 * DealPipeline — the founder CRM over the entity model.
 * Doc: docs/architecture/25-per-persona-crm.md phase 3.
 *
 * Everything shown here comes from the persona's CrmDefinition: the column set,
 * the stage labels, the words for a person/company/deal, the funnel. Nothing
 * branches on persona, which is the property that lets VC and LP reuse this with
 * their own definition in phases 5 and 6.
 *
 * Deliberately not ported from the previous page: boards, saved views, bulk
 * actions, tags editing and follow-up tasks. Tasks in particular cannot move yet —
 * crm_tasks.crm_entry_id has a foreign key to crm_entries, so a task cannot attach
 * to a deal until that column gains a deal link. The header links back rather than
 * pretending those features moved.
 */

import { useMemo, useState } from "react"
import useSWR from "swr"
import { requestJson, errorMessage, swrFetcher } from "@/lib/http/client"
import { Loader2, Search, ExternalLink, Clock } from "lucide-react"
import type { CrmDefinition } from "@/lib/crm/definitions/types"

export type DealRow = {
  id: string
  stage: string
  companyId: string | null
  companyName: string | null
  personId: string | null
  displayName: string
  displayTitle: string | null
  displayEmail: string | null
  displayLinkedin: string | null
  displayLocation: string | null
  displayType: string | null
  displayScore: number | null
  displayTier: string | null
  whyMatch: string | null
  notes: string | null
  owner: string | null
  tags: string[]
  addedAt: string | null
  lastContactedAt: string | null
  activityCount: number
}

type Funnel = { key: string; label: string; count: number }[]

const STAGE_TONE: Record<string, string> = {
  queued: "bg-slate-100 text-slate-700",
  identified: "bg-slate-100 text-slate-700",
  researched: "bg-slate-100 text-slate-700",
  contacted: "bg-blue-100 text-blue-700",
  responded: "bg-amber-100 text-[var(--platform-warning)]",
  meeting: "bg-cyan-100 text-cyan-700",
  diligence: "bg-violet-100 text-violet-700",
  soft_circle: "bg-teal-100 text-teal-700",
  term_sheet: "bg-indigo-100 text-indigo-700",
  committed: "bg-emerald-100 text-emerald-700",
  wired: "bg-emerald-100 text-emerald-700",
  passed: "bg-rose-100 text-rose-700",
  declined: "bg-rose-100 text-rose-700",
  lost: "bg-rose-100 text-rose-700",
}

const daysSince = (iso: string | null) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null

export function DealPipeline({
  definition, initialDeals, funnel, canWrite,
}: {
  definition: CrmDefinition
  initialDeals: DealRow[]
  funnel: Funnel
  canWrite: boolean
}) {
  const [deals, setDeals] = useState(initialDeals)
  const [q, setQ] = useState("")
  const [stageFilter, setStageFilter] = useState<string[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const d of deals) m[d.stage] = (m[d.stage] ?? 0) + 1
    return m
  }, [deals])

  // Conversion reads off the definition's ordering rather than a hardcoded list,
  // so a stage added to the pipeline cannot silently drop out of the metric.
  const kpis = useMemo(() => {
    // Widened to string: compared against a stored stage, which may be a legacy
    // spelling the definition does not list.
    const order: string[] = definition.stages.map((s) => s.key)
    const repliedAt = order.indexOf("responded")
    const entry = order[0]
    let past = 0, engaged = 0, won = 0, lost = 0
    for (const d of deals) {
      const at = order.indexOf(d.stage)
      const kind = definition.stages[at]?.kind
      if (d.stage !== entry) past++
      if (repliedAt >= 0 && at >= repliedAt && kind !== "lost") engaged++
      if (kind === "won") won++
      if (kind === "lost") lost++
    }
    return { past, engaged, won, lost, rate: past ? Math.round((engaged / past) * 100) : null }
  }, [deals, definition])

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return deals.filter((d) => {
      if (stageFilter.length && !stageFilter.includes(d.stage)) return false
      if (!needle) return true
      return [d.displayName, d.companyName, d.displayTitle, d.displayEmail, d.displayLocation, d.owner]
        .some((v) => v?.toLowerCase().includes(needle))
    })
  }, [deals, q, stageFilter])

  async function moveStage(id: string, stage: string) {
    if (!canWrite) { setError("Your workspace access is read only."); return }
    const previous = deals
    setError(null)
    setBusyId(id)
    // Optimistic, reverted on failure — a stage move is the one interaction here
    // that must feel instant, and the server is the authority on whether the
    // target stage is in this persona's pipeline.
    setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, stage } : d)))
    try {
      await requestJson(`/api/crm/deals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      })
    } catch (e) {
      setDeals(previous)
      setError(errorMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  const label = (key: string) => definition.stages.find((s) => s.key === key)?.label ?? key
  const open = openId ? deals.find((d) => d.id === openId) ?? null : null

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          {error}
        </div>
      )}

      {/* Funnel — the definition's pipeline, in its order */}
      <div className="flex flex-wrap items-center gap-1.5">
        {definition.stages.map((s) => {
          const on = stageFilter.includes(s.key)
          return (
            <button
              key={s.key}
              aria-pressed={on}
              title={s.hint}
              onClick={() => setStageFilter((f) => (f.includes(s.key) ? f.filter((x) => x !== s.key) : [...f, s.key]))}
              className={`rounded-full border px-2.5 py-1 text-xs font-mono transition ${
                on ? "border-foreground bg-foreground text-background" : `${STAGE_TONE[s.key] ?? ""} border-transparent hover:opacity-80`
              }`}
            >
              {s.label} {counts[s.key] ?? funnel.find((f) => f.key === s.key)?.count ?? 0}
            </button>
          )
        })}
        {stageFilter.length > 0 && (
          <button onClick={() => setStageFilter([])} className="ml-1 text-xs underline text-muted-foreground">
            clear
          </button>
        )}
      </div>

      {/* KPIs */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Engaged", kpis.engaged, "replied or further"],
          ["Response rate", kpis.rate == null ? "—" : `${kpis.rate}%`, "of those approached"],
          [label(definition.stages.find((s) => s.kind === "won")!.key), kpis.won, "closed"],
          ["Passed", kpis.lost, "out of the pipeline"],
        ].map(([k, v, hint]) => (
          <div key={String(k)} className="rounded-lg border border-foreground/10 px-3 py-2">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="font-mono text-lg">{v as any}</dd>
            <dd className="text-[11px] text-muted-foreground">{hint}</dd>
          </div>
        ))}
      </dl>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <label className="sr-only" htmlFor="deal-search">Search {definition.person.many.toLowerCase()}</label>
        <input
          id="deal-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${definition.person.many.toLowerCase()}, ${definition.company.many.toLowerCase()}, owner…`}
          className="h-11 w-full rounded border border-input bg-background pl-9 pr-3 text-sm"
        />
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {visible.length.toLocaleString()} of {deals.length.toLocaleString()} shown
      </p>

      {/* List */}
      <ul className="divide-y divide-foreground/10 rounded-lg border border-foreground/10">
        {visible.slice(0, 500).map((d) => {
          const stale = daysSince(d.lastContactedAt)
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 hover:bg-foreground/[0.02]">
              <button onClick={() => setOpenId(d.id === openId ? null : d.id)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-medium">{d.displayName}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[d.displayTitle, d.companyName ?? `no ${definition.company.one.toLowerCase()}`].filter(Boolean).join(" · ")}
                </span>
              </button>

              {d.displayScore != null && (
                <span className="font-mono text-xs text-muted-foreground" title="Match score">{d.displayScore}</span>
              )}
              {d.activityCount > 0 && (
                <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground" title={`${d.activityCount} logged`}>
                  <Clock className="h-3 w-3" /> {d.activityCount}
                </span>
              )}
              {stale != null && (
                <span className="font-mono text-xs text-muted-foreground" title="Days since last contact">{stale}d</span>
              )}

              <label className="sr-only" htmlFor={`stage-${d.id}`}>Stage for {d.displayName}</label>
              <div className="flex items-center gap-1.5">
                {busyId === d.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                <select
                  id={`stage-${d.id}`}
                  disabled={!canWrite || busyId === d.id}
                  value={d.stage}
                  onChange={(e) => moveStage(d.id, e.target.value)}
                  className={`h-8 rounded border-transparent px-2 text-xs font-mono ${STAGE_TONE[d.stage] ?? ""}`}
                >
                  {definition.stages.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>
            </li>
          )
        })}
        {!visible.length && (
          <li className="px-3 py-10 text-center">
            <p className="text-sm font-medium">{deals.length ? "Nothing matches those filters" : definition.emptyState.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{deals.length ? "Clear the search or stage filters." : definition.emptyState.body}</p>
          </li>
        )}
      </ul>

      {visible.length > 500 && (
        <p className="text-xs text-muted-foreground">
          Showing the first 500. Narrow the search to see the rest.
        </p>
      )}

      {open && <DealDetail deal={open} definition={definition} onClose={() => setOpenId(null)} />}
    </div>
  )
}

/** The history behind one record, from crm_activities. */
function DealDetail({ deal, definition, onClose }: { deal: DealRow; definition: CrmDefinition; onClose: () => void }) {
  const { data, error } = useSWR<{ activities: { id: string; kind: string; subject: string | null; body: string | null; occurredAt: string | null }[] }>(
    `/api/crm/deals/${deal.id}`, swrFetcher,
  )

  return (
    <aside className="rounded-lg border border-foreground/15 bg-foreground/[0.02] p-4" aria-label={`Detail for ${deal.displayName}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{deal.displayName}</h2>
          <p className="truncate text-sm text-muted-foreground">
            {[deal.displayTitle, deal.companyName, deal.displayLocation].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <button onClick={onClose} className="text-sm underline text-muted-foreground">close</button>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
        <Field k="Stage" v={definition.stages.find((s) => s.key === deal.stage)?.label ?? deal.stage} />
        <Field k={definition.company.one} v={deal.companyName ?? "—"} />
        <Field k="Owner" v={deal.owner ?? "—"} />
        <Field k="Score" v={deal.displayScore == null ? "—" : String(deal.displayScore)} />
        <Field k="Tier" v={deal.displayTier ?? "—"} />
        <Field k="Last contact" v={deal.lastContactedAt ? `${daysSince(deal.lastContactedAt)}d ago` : "never"} />
      </dl>

      {deal.displayEmail && <p className="mt-2 text-sm">{deal.displayEmail}</p>}
      {deal.displayLinkedin && (
        <a href={deal.displayLinkedin} target="_blank" rel="noreferrer noopener"
           className="mt-1 inline-flex items-center gap-1 text-sm underline">
          LinkedIn <ExternalLink className="h-3 w-3" />
        </a>
      )}

      {deal.whyMatch && (
        <section className="mt-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Why this match</h3>
          <p className="mt-1 text-sm">{deal.whyMatch}</p>
        </section>
      )}

      <section className="mt-4">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">History</h3>
        {error && <p className="mt-1 text-sm text-muted-foreground">The history could not be loaded.</p>}
        {!data && !error && <p className="mt-1 text-sm text-muted-foreground">Loading…</p>}
        {data && !data.activities.length && <p className="mt-1 text-sm text-muted-foreground">Nothing logged yet.</p>}
        {data && data.activities.length > 0 && (
          <ol className="mt-2 space-y-2">
            {data.activities.map((a) => (
              <li key={a.id} className="border-l-2 border-foreground/15 pl-3">
                <p className="text-xs font-mono text-muted-foreground">
                  {a.kind.replace("_", " ")}
                  {a.occurredAt ? ` · ${new Date(a.occurredAt).toLocaleDateString()}` : ""}
                </p>
                {a.subject && <p className="text-sm font-medium">{a.subject}</p>}
                {a.body && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{a.body}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  )
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</dt>
      <dd className="truncate">{v}</dd>
    </div>
  )
}
