"use client"

/**
 * The full result of a matching run, in the app (docs/architecture/10 O1–O6).
 *
 * Before this, a founder saw the top 10 firms and had to export a workbook to
 * see the rest. Here every firm group and independent investor is paged from
 * the server, with the factor breakdown behind each score, and can be saved to
 * the CRM or excluded from future runs without leaving the page.
 */
import { useCallback, useState } from "react"
import useSWR from "swr"
import { requestJson, swrFetcher } from "@/lib/http/client"
import { AlertCircle, Ban, CheckCircle2, ChevronDown, ChevronRight, Download, Linkedin, Loader2, Mail, Target, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataError, DataLoading } from "@/components/shell/data-state"
import { statusLabel, type VerificationStatus } from "@/lib/email-verification/types"

type Entity = Record<string, any>
export interface GroupRow { rank: number; score: number; tier: string; firm: Entity; primary: Entity | null; alternates: Entity[]; scoreFrom: string; peopleScored: number }
export interface IndependentRow { rank: number; score: number; tier: string; person: Entity }

const TIER_LABEL: Record<string, string> = { champion: "Champion", priority_a: "Priority A", priority_b: "Priority B", prospect_c: "Prospect C" }
const PAGE = 50

const money = (n: unknown) => {
  const v = Number(n)
  if (!Number.isFinite(v) || v <= 0) return null
  return v >= 1e6 ? `$${+(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}K`
}
const range = (a: unknown, b: unknown) => {
  const lo = money(a), hi = money(b)
  return lo && hi && lo !== hi ? `${lo}–${hi}` : lo ?? hi ?? "—"
}

/**
 * When this investor was last seen investing (docs/architecture/16).
 *
 * Only ever shown for a firm whose own pages carried the date, with the note
 * it came from — an unchecked firm shows nothing rather than "unknown".
 */
function LastInvestment({ e }: { e: Entity }) {
  if (!e.lastInvestmentAt) return null
  const when = new Date(`${String(e.lastInvestmentAt).slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(when.getTime())) return null
  const months = Math.max(0, Math.round((Date.now() - when.getTime()) / 2_629_800_000))
  const ago = months < 1 ? "this month" : months < 12 ? `${months} month${months === 1 ? "" : "s"} ago` : `${Math.floor(months / 12)}y ago`
  return (
    <span title={e.lastInvestmentNote ?? undefined} className={months <= 6 ? "text-foreground" : undefined}>
      Last seen investing {ago}
    </span>
  )
}

/** The components behind a score, in the order the white paper weights them. */
function Breakdown({ e }: { e: Entity }) {
  const c = e.components
  if (!c) return null
  const rows: [string, number, number][] = [
    ["Thesis fit", c.thesis?.value ?? 0, c.thesis?.points ?? 0],
    ["Stage", c.stage?.value ?? 0, c.stage?.points ?? 0],
    ["Check size", c.checkSize?.value ?? 0, c.checkSize?.points ?? 0],
    ["Geography", c.geography?.value ?? 0, c.geography?.points ?? 0],
    ["Lead capacity", c.lead?.value ?? 0, c.lead?.points ?? 0],
    ["Investor type", c.investorType?.value ?? 0, c.investorType?.points ?? 0],
    ["Evidence quality", c.quality?.value ?? 0, c.quality?.points ?? 0],
  ]
  return (
    <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-4 text-xs">
      {rows.map(([label, value, points]) => (
        <div key={label} className="flex items-center gap-2">
          <span className="w-28 text-muted-foreground">{label}</span>
          <span className="h-1.5 flex-1 rounded bg-foreground/10"><span className="block h-1.5 rounded bg-foreground/40" style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} /></span>
          <span className="font-mono w-10 text-right">{points.toFixed(1)}</span>
        </div>
      ))}
      {c.thesis?.semantic != null && <div className="text-muted-foreground">Thesis text similarity: {(c.thesis.semantic * 100).toFixed(0)}%</div>}
      {e.lastInvestmentNote && (
        <div className="text-muted-foreground sm:col-span-2 lg:col-span-4">
          Last investment on record: {e.lastInvestmentNote}
          {e.lastInvestmentSource && <> · <a href={e.lastInvestmentSource} target="_blank" rel="noopener noreferrer" className="hover:underline">source</a></>}
        </div>
      )}
      {(e.gates ?? []).length > 0 && <div className="text-muted-foreground">Held back by: {(e.gates ?? []).join(", ").replace(/_/g, " ")}</div>}
    </div>
  )
}

export function MatchResults({ runId, canWrite }: { runId: string; canWrite: boolean }) {
  const [kind, setKind] = useState<"group" | "independent">("group")
  const [page, setPage] = useState(1)
  const [tier, setTier] = useState("")
  const [emailStatus, setEmailStatus] = useState("")
  const [q, setQ] = useState("")
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState<{ type: "success" | "error" | null; message: string }>({ type: null, message: "" })
  const [busy, setBusy] = useState(false)

  const params = new URLSearchParams({ kind, page: String(page), limit: String(PAGE) })
  if (tier) params.set("tier", tier)
  if (emailStatus) params.set("emailStatus", emailStatus)
  if (q.trim()) params.set("q", q.trim())

  const { data, error, isLoading, mutate } = useSWR<{ rows: (GroupRow & IndependentRow)[]; total: number; page: number; limit: number }>(
    `/api/founder/matching/runs/${runId}/results?${params}`, swrFetcher, { keepPreviousData: true })

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE))

  const act = useCallback(async (action: "save" | "exclude", keys: string[]) => {
    if (!keys.length) return
    setBusy(true)
    try {
      const res = await requestJson<{ inserted?: number; alreadyPresent?: number; count?: number }>(`/api/founder/matching/runs/${runId}/actions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, keys }),
      })
      setSelected(new Set())
      void mutate()
      setStatus({
        type: "success",
        message: action === "save"
          ? `${res.inserted ?? 0} saved to your CRM${res.alreadyPresent ? ` · ${res.alreadyPresent} were already there` : ""}.`
          : `${res.count ?? keys.length} excluded — they will not appear in future runs.`,
      })
    } catch (e) {
      setStatus({ type: "error", message: e instanceof Error ? e.message : "That did not save. Please retry." })
    } finally { setBusy(false) }
  }, [runId, mutate])

  const keyOf = (r: GroupRow & IndependentRow) => kind === "group" ? (r.primary ? `contact:${r.primary.id}` : `firm:${r.firm.id}`) : `contact:${r.person.id}`
  const toggle = (k: string) => setSelected((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })

  return (
    <div className="border border-foreground/10 rounded-lg p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-xl">All matches</h2>
        <div className="flex rounded-md border border-foreground/15 overflow-hidden">
          {(["group", "independent"] as const).map((k) => (
            <button key={k} aria-pressed={k === kind} onClick={() => { setKind(k); setPage(1) }}
              className={`px-3 h-9 text-sm ${k === kind ? "bg-foreground/10 font-medium" : "text-muted-foreground"}`}>
              {k === "group" ? "Firms" : "Independent investors"}
            </button>
          ))}
        </div>
        <select aria-label="Tier" className="h-9 rounded-md border border-foreground/15 bg-background px-2 text-sm" value={tier} onChange={(e) => { setTier(e.target.value); setPage(1) }}>
          <option value="">All tiers</option>
          {Object.entries(TIER_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select aria-label="Email status" className="h-9 rounded-md border border-foreground/15 bg-background px-2 text-sm" value={emailStatus} onChange={(e) => { setEmailStatus(e.target.value); setPage(1) }}>
          <option value="">Any email status</option>
          <option value="valid">Verified</option>
          <option value="unknown">Unconfirmed</option>
          <option value="risky">Risky</option>
          <option value="invalid">Invalid</option>
        </select>
        <Input className="h-9 w-48" placeholder="Filter by name…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} aria-label="Filter results" />
        <span className="text-sm text-muted-foreground ml-auto">{total.toLocaleString()} {kind === "group" ? "firms" : "people"}</span>
      </div>

      {status.type && (
        <div role="alert" className={`mt-3 flex items-center gap-2 rounded-lg border p-3 text-sm ${status.type === "success" ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}>
          {status.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{status.message}</span>
          <button className="ml-auto" aria-label="Dismiss" onClick={() => setStatus({ type: null, message: "" })}><X className="w-4 h-4" /></button>
        </div>
      )}

      {selected.size > 0 && canWrite && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-foreground/15 bg-foreground/[0.03] p-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button size="sm" className="gap-2" disabled={busy} onClick={() => act("save", [...selected])}><Target className="w-4 h-4" />Save to CRM</Button>
          <Button size="sm" variant="outline" className="gap-2" disabled={busy} onClick={() => act("exclude", [...selected])}><Ban className="w-4 h-4" />Never suggest again</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {error ? <DataError label="Could not load these results." onRetry={() => void mutate()} />
        : isLoading && !rows.length ? <DataLoading label="Loading matches" />
        : rows.length === 0 ? <p className="mt-6 text-sm text-muted-foreground">No matches with these filters.</p>
        : (
          <ul className="mt-4 divide-y divide-foreground/5">
            {rows.map((r) => {
              const e: Entity = kind === "group" ? r.firm : r.person
              const key = keyOf(r)
              const isOpen = open.has(key)
              const contact = kind === "group" ? r.primary : r.person
              return (
                <li key={key} className="py-3">
                  <div className="flex items-start gap-3">
                    {canWrite && <input type="checkbox" className="mt-1.5" aria-label={`Select ${e.name}`} checked={selected.has(key)} onChange={() => toggle(key)} />}
                    <button className="mt-0.5 text-muted-foreground" aria-label={isOpen ? "Hide score breakdown" : "Show score breakdown"}
                      onClick={() => setOpen((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })}>
                      {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground w-10">#{r.rank}</span>
                        <span className="font-medium">{e.name}</span>
                        <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] font-mono uppercase">{TIER_LABEL[r.tier] ?? r.tier}</span>
                        <span className="font-mono text-xs">{Number(r.score).toFixed(1)}</span>
                        {e.inCrm && <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] font-mono uppercase">In CRM</span>}
                        {kind === "group" && r.scoreFrom === "people" && <span className="text-[10px] text-muted-foreground">scored from its partners</span>}
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{e.whyMatch}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>{[e.type, e.location].filter(Boolean).join(" · ")}</span>
                        {(e.stages ?? []).length > 0 && <span>{(e.stages ?? []).join(", ")}</span>}
                        <span>{range(e.checkSizeMin, e.checkSizeMax)}</span>
                        <LastInvestment e={e} />
                        {contact && (
                          <span className="flex items-center gap-2">
                            <span className="text-foreground">{contact.name}{contact.title ? ` · ${contact.title}` : ""}</span>
                            {contact.email && <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1 hover:underline" title={contact.email}><Mail className="w-3 h-3" />{statusLabel(contact.emailStatus as VerificationStatus | null)}</a>}
                            {contact.linkedin && <a href={contact.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`${contact.name} on LinkedIn`}><Linkedin className="w-3 h-3" /></a>}
                          </span>
                        )}
                        {kind === "group" && r.alternates?.length > 0 && <span>+{r.alternates.length} more at this firm</span>}
                      </div>
                      {isOpen && <Breakdown e={e} />}
                    </div>
                    {canWrite && (
                      <div className="flex items-center gap-1">
                        {!e.inCrm && <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => act("save", [key])}>Save</Button>}
                        <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => act("exclude", [key])} aria-label={`Never suggest ${e.name} again`}><Ban className="w-3.5 h-3.5" /></Button>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {page} of {pages.toLocaleString()}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1 || busy} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= pages || busy} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Everything the run can be exported as (docs/architecture/14 §6). */
export function Deliverables({ runId, canWrite }: { runId: string; canWrite: boolean }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const importTop = async () => {
    setBusy(true)
    try {
      const res = await requestJson<{ inserted: number; alreadyPresent: number }>("/api/crm/import-run", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId, top: 50 }),
      })
      setMessage(`${res.inserted} investors added to your CRM${res.alreadyPresent ? ` · ${res.alreadyPresent} were already there` : ""}.`)
    } catch (e) { setMessage(e instanceof Error ? e.message : "Import failed.") } finally { setBusy(false) }
  }
  const link = (format: string, label: string, hint: string) => (
    <a key={format} href={`/api/founder/export/${runId}?format=${format}`}
       className="flex items-start gap-3 rounded-lg border border-foreground/10 p-4 hover:border-foreground/25 transition-colors">
      <Download className="w-4 h-4 mt-0.5 text-muted-foreground" />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </a>
  )
  return (
    <div className="border border-foreground/10 rounded-lg p-6">
      <h2 className="font-display text-xl mb-4">Take it with you</h2>
      <div className="grid md:grid-cols-3 gap-3">
        {link("xlsx", "Investor shortlist (xlsx)", "6 sheets: Summary, Lead Candidates, Firm Groups, Independent Investors, Ready to Email, Import Selection")}
        {link("lists", "Lists of 200 (zip)", "Firm groups and independents split into files of 200, with a run manifest")}
        {link("csv&kind=groups", "Firm groups (csv)", "For CRMs and sequencers that import CSV")}
        {link("csv&kind=independents", "Independent investors (csv)", "Angels and unattached investors")}
        {link("methodology", "Methodology (md)", "How every score was produced — add &doc=docx for Word")}
        {link("outreach", "4-week outreach plan (md)", "Sequenced by segment — add &doc=docx for Word")}
      </div>
      {canWrite && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="outline" className="gap-2" disabled={busy} onClick={importTop}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}Add the top 50 to my CRM
          </Button>
          <span className="text-xs text-muted-foreground">One contact per firm. No file round trip.</span>
        </div>
      )}
      {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    </div>
  )
}
