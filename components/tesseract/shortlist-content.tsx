"use client"

/**
 * Kanban view of crm_entries.  Reads /api/crm/entries and lets the user:
 *   - drag a card between stage columns (queued → contacted → …)
 *   - update notes / owner / last_contacted_at via the inspector
 *   - delete a row entirely
 *   - upload a new edited shortlist (top-of-page card)
 */

import { useMemo, useState, useTransition } from "react"
import {
  Inbox,
  Send,
  MessageCircle,
  Calendar,
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  Mail,
  Linkedin,
  ExternalLink,
  X,
  Sparkles,
  Database,
  RefreshCw,
} from "lucide-react"
import { ShortlistUploader } from "./shortlist-uploader"
import { FounderContextCard, useFounderContext } from "./founder-context-card"
import { OutreachComposer } from "./outreach-composer"

interface Entry {
  id: string
  source: string
  sourceSessionId: string | null
  firmId: string | null
  investorId: string | null
  displayName: string
  displayTitle: string | null
  displayEmail: string | null
  displayLinkedin: string | null
  displayLocation: string | null
  displayType: string | null
  displayScore: number | null
  displayTier: string | null
  whyMatch: string | null
  stage: string
  notes: string | null
  owner: string | null
  addedAt: string | null
  lastContactedAt: string | null
  updatedAt: string | null
  /** Twenty CRM sync state — populated after POST /api/twenty/sync. */
  twentyOpportunityId?: string | null
  twentyOpportunityUrl?: string | null
  twentyLastSyncedAt?: string | null
}

const STAGES = [
  { key: "queued",       label: "Queued",        icon: Inbox,         color: "text-slate-600 bg-slate-50 border-slate-200" },
  { key: "contacted",    label: "Contacted",     icon: Send,          color: "text-blue-700 bg-blue-50 border-blue-200" },
  { key: "responded",    label: "Responded",     icon: MessageCircle, color: "text-amber-700 bg-amber-50 border-amber-200" },
  { key: "meeting",      label: "Meeting",       icon: Calendar,      color: "text-cyan-700 bg-cyan-50 border-cyan-200" },
  { key: "in_diligence", label: "In diligence",  icon: Search,        color: "text-violet-700 bg-violet-50 border-violet-200" },
  { key: "committed",    label: "Committed",     icon: CheckCircle2,  color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  { key: "passed",       label: "Passed",        icon: XCircle,       color: "text-rose-700 bg-rose-50 border-rose-200" },
] as const

type StageKey = (typeof STAGES)[number]["key"]

interface Props {
  initialEntries: Entry[]
  /** "shortlist" (default) leads with the xlsx upload + intake workflow.
   *  "crm" hides the uploader and presents the same kanban as the working
   *  pipeline view at /dashboard/crm. */
  variant?: "shortlist" | "crm"
}

export function ShortlistContent({ initialEntries, variant = "shortlist" }: Props) {
  const isCrm = variant === "crm"
  const [entries, setEntries] = useState<Entry[]>(initialEntries)
  const [filter, setFilter] = useState("")
  const [sourceFilter, setSourceFilter] = useState<"all" | "lp_matching" | "founder_matching" | "manual">("all")
  const [selected, setSelected] = useState<Entry | null>(null)
  const [composing, setComposing] = useState<Entry | null>(null)
  const [founder, setFounder] = useFounderContext()
  const [pending, startTransition] = useTransition()
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return entries.filter((e) => {
      if (sourceFilter !== "all" && e.source !== sourceFilter) return false
      if (!f) return true
      return (
        e.displayName.toLowerCase().includes(f) ||
        (e.displayTitle ?? "").toLowerCase().includes(f) ||
        (e.displayEmail ?? "").toLowerCase().includes(f) ||
        (e.displayLocation ?? "").toLowerCase().includes(f) ||
        (e.whyMatch ?? "").toLowerCase().includes(f)
      )
    })
  }, [entries, filter, sourceFilter])

  const grouped = useMemo(() => {
    const g: Record<StageKey, Entry[]> = Object.fromEntries(
      STAGES.map((s) => [s.key, [] as Entry[]]),
    ) as Record<StageKey, Entry[]>
    for (const e of filtered) {
      const k = (STAGES.find((s) => s.key === e.stage)?.key ?? "queued") as StageKey
      g[k].push(e)
    }
    return g
  }, [filtered])

  async function moveStage(id: string, newStage: StageKey) {
    // optimistic
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              stage: newStage,
              lastContactedAt:
                newStage === "contacted" && !e.lastContactedAt
                  ? new Date().toISOString()
                  : e.lastContactedAt,
            }
          : e,
      ),
    )
    startTransition(async () => {
      try {
        const body: any = { stage: newStage }
        if (newStage === "contacted") body.lastContactedAt = new Date().toISOString()
        await fetch(`/api/crm/entries/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      } catch (e) {
        console.error("[shortlist] move stage failed", e)
      }
    })
  }

  async function deleteEntry(id: string) {
    if (!confirm("Remove this row from your CRM? Re-uploading the same shortlist with Contact=TRUE will recreate it.")) return
    setEntries((prev) => prev.filter((e) => e.id !== id))
    if (selected?.id === id) setSelected(null)
    startTransition(async () => {
      try {
        await fetch(`/api/crm/entries/${id}`, { method: "DELETE" })
      } catch (e) {
        console.error("[shortlist] delete failed", e)
      }
    })
  }

  async function saveNotes(id: string, notes: string) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, notes } : e)))
    startTransition(async () => {
      try {
        await fetch(`/api/crm/entries/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes }),
        })
      } catch (e) {
        console.error("[shortlist] save notes failed", e)
      }
    })
  }

  const totalCount = entries.length

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-foreground/10">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-2.5 mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                <span className="w-2.5 h-2.5 bg-[#2f45e0]" /> {isCrm ? "Pipeline" : "Shortlist"}
              </div>
              <h1 className="text-3xl font-display tracking-tight">{isCrm ? "CRM pipeline" : "Outreach shortlist"}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {isCrm
                  ? "Your working pipeline. Drag cards across stages, run the agent, send outreach, sync to Twenty."
                  : "Every LP / investor promoted from your edited xlsx shortlists. "}
                <span className="text-foreground/80">{totalCount} total</span>
                {pending && <Loader2 className="w-3 h-3 inline-block ml-2 animate-spin" />}
              </p>
            </div>
            {isCrm && (
              <a
                href="/dashboard/shortlist"
                className="text-xs font-mono px-3 py-1.5 rounded-md border border-foreground/15 text-muted-foreground hover:border-foreground/30 inline-flex items-center gap-1.5"
              >
                <Inbox className="w-3.5 h-3.5" /> Import shortlist
              </a>
            )}
          </div>

          {/* Upload card — shortlist intake only.  The CRM view is the
              working pipeline, so we don't lead with the uploader there. */}
          {!isCrm && <ShortlistUploader source="lp_matching" />}

          {/* Founder context — used by the local-AI to personalize DMs and replies. */}
          <FounderContextCard
            ctx={founder}
            onChange={setFounder}
            defaultCollapsed
            className={isCrm ? "" : "mt-4"}
          />

          {/* Filters */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[260px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search name, title, email, location, why-match…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-foreground/15 rounded-md bg-background focus:outline-none focus:border-foreground/40"
              />
            </div>
            <div className="flex items-center gap-1 text-xs">
              {(["all", "lp_matching", "founder_matching", "manual"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSourceFilter(s)}
                  className={`px-3 py-1.5 rounded-md font-mono ${
                    sourceFilter === s
                      ? "bg-foreground text-background"
                      : "border border-foreground/15 text-muted-foreground hover:border-foreground/30"
                  }`}
                >
                  {s === "all" ? "all" : s.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Kanban */}
      <div className="px-8 py-6">
        {totalCount === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Inbox className="w-12 h-12 mx-auto mb-4 opacity-40" />
            <p className="text-sm">
              No entries yet. Run a matchmaking, download the xlsx, uncheck rows you don't want,
              and re-upload it above.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {STAGES.map((s) => {
              const Icon = s.icon
              const items = grouped[s.key]
              return (
                <div
                  key={s.key}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (draggingId) {
                      moveStage(draggingId, s.key)
                      setDraggingId(null)
                    }
                  }}
                  className="flex flex-col min-h-[200px]"
                >
                  <div className={`flex items-center justify-between gap-2 px-3 py-2 rounded-t-md border ${s.color}`}>
                    <div className="flex items-center gap-1.5">
                      <Icon className="w-3.5 h-3.5" />
                      <span className="text-[11px] font-mono uppercase tracking-wider">{s.label}</span>
                    </div>
                    <span className="text-[11px] font-mono">{items.length}</span>
                  </div>
                  <div className="flex-1 border-x border-b border-foreground/10 rounded-b-md p-2 bg-foreground/[0.015] space-y-2">
                    {items.length === 0 ? (
                      <div className="text-center text-[10px] text-muted-foreground/50 py-4">empty</div>
                    ) : (
                      items.map((e) => (
                        <Card
                          key={e.id}
                          entry={e}
                          onClick={() => setSelected(e)}
                          onDragStart={() => setDraggingId(e.id)}
                          onDragEnd={() => setDraggingId(null)}
                          onCompose={() => setComposing(e)}
                        />
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Inspector drawer */}
      {selected && (
        <Inspector
          entry={selected}
          onClose={() => setSelected(null)}
          onMove={(stage) => moveStage(selected.id, stage)}
          onDelete={() => deleteEntry(selected.id)}
          onSaveNotes={(n) => saveNotes(selected.id, n)}
        />
      )}

      {composing && (
        <OutreachComposer
          entry={{
            id: composing.id,
            displayName: composing.displayName,
            displayTitle: composing.displayTitle,
            displayLinkedin: composing.displayLinkedin,
            displayEmail: composing.displayEmail,
            displayType: composing.displayType,
            stage: composing.stage,
          }}
          founder={founder}
          onClose={() => setComposing(null)}
        />
      )}
    </div>
  )
}

function Card({
  entry,
  onClick,
  onDragStart,
  onDragEnd,
  onCompose,
}: {
  entry: Entry
  onClick: () => void
  onDragStart: () => void
  onDragEnd: () => void
  onCompose: () => void
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="bg-background border border-foreground/10 rounded-md p-3 cursor-grab active:cursor-grabbing hover:border-foreground/30 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="font-medium text-sm leading-tight line-clamp-2">{entry.displayName}</div>
        {entry.displayScore != null && (
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-foreground/5 shrink-0">
            {entry.displayScore}
          </span>
        )}
      </div>
      {entry.displayTitle && (
        <div className="text-[11px] text-muted-foreground truncate">{entry.displayTitle}</div>
      )}
      {entry.displayLocation && (
        <div className="text-[10px] font-mono text-muted-foreground/80 mt-1 truncate">
          {entry.displayLocation}
        </div>
      )}
      <div className="flex items-center gap-2 mt-2 text-muted-foreground">
        {entry.displayEmail && <Mail className="w-3 h-3" />}
        {entry.displayLinkedin && <Linkedin className="w-3 h-3" />}
        {entry.displayTier && (
          <span className="text-[9px] font-mono uppercase tracking-wider ml-auto">
            {entry.displayTier}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onCompose() }}
        className="mt-2 w-full inline-flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-mono rounded border border-foreground/15 hover:bg-foreground/5"
        title="Generate 4-step DM sequence with the local model"
      >
        <Sparkles className="w-3 h-3" /> Outreach
      </button>
    </div>
  )
}

function Inspector({
  entry,
  onClose,
  onMove,
  onDelete,
  onSaveNotes,
}: {
  entry: Entry
  onClose: () => void
  onMove: (s: StageKey) => void
  onDelete: () => void
  onSaveNotes: (n: string) => void
}) {
  const [notes, setNotes] = useState(entry.notes ?? "")

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="fixed inset-0 bg-black/30" />
      <div
        className="relative w-[420px] max-w-full bg-background border-l border-foreground/10 h-full overflow-y-auto z-50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-foreground/10 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl leading-tight">{entry.displayName}</h2>
            {entry.displayTitle && (
              <p className="text-sm text-muted-foreground mt-0.5">{entry.displayTitle}</p>
            )}
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              {entry.displayLocation && <span>{entry.displayLocation}</span>}
              {entry.displayType && <span className="font-mono">{entry.displayType}</span>}
              {entry.displayScore != null && (
                <span className="font-mono">score {entry.displayScore}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Stage selector */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Stage
            </label>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {STAGES.map((s) => {
                const active = entry.stage === s.key
                return (
                  <button
                    key={s.key}
                    onClick={() => onMove(s.key)}
                    className={`text-xs px-2 py-1.5 rounded border ${
                      active
                        ? "bg-foreground text-background border-foreground"
                        : "border-foreground/15 hover:border-foreground/30"
                    }`}
                  >
                    {s.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Contact info */}
          <div className="space-y-1.5">
            {entry.displayEmail && (
              <a
                href={`mailto:${entry.displayEmail}`}
                className="flex items-center gap-2 text-sm text-foreground hover:underline"
              >
                <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                {entry.displayEmail}
              </a>
            )}
            {entry.displayLinkedin && (
              <a
                href={entry.displayLinkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-foreground hover:underline"
              >
                <Linkedin className="w-3.5 h-3.5 text-muted-foreground" />
                LinkedIn <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {/* Why match */}
          {entry.whyMatch && (
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Why this match
              </label>
              <p className="mt-1 text-sm leading-relaxed">{entry.whyMatch}</p>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => onSaveNotes(notes)}
              rows={5}
              placeholder="Internal notes — saved automatically on blur"
              className="mt-1 w-full text-sm border border-foreground/15 rounded-md p-2 focus:outline-none focus:border-foreground/40 bg-background"
            />
          </div>

          {/* Twenty CRM sync */}
          <TwentySyncRow entry={entry} />

          {/* Provenance */}
          <div className="pt-4 border-t border-foreground/10 space-y-1 text-[11px] font-mono text-muted-foreground">
            <div>source: {entry.source}</div>
            {entry.sourceSessionId && <div>session: {entry.sourceSessionId.slice(0, 8)}…</div>}
            {entry.firmId && <div>firm_id: {entry.firmId.slice(0, 18)}…</div>}
            {entry.investorId && <div>investor_id: {entry.investorId.slice(0, 18)}…</div>}
            {entry.addedAt && <div>added: {new Date(entry.addedAt).toLocaleString()}</div>}
            {entry.lastContactedAt && (
              <div>last contact: {new Date(entry.lastContactedAt).toLocaleString()}</div>
            )}
            {entry.twentyLastSyncedAt && (
              <div>twenty synced: {new Date(entry.twentyLastSyncedAt).toLocaleString()}</div>
            )}
          </div>

          <button
            onClick={onDelete}
            className="w-full flex items-center justify-center gap-2 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 py-2 rounded-md border border-rose-200 dark:border-rose-900"
          >
            <Trash2 className="w-3.5 h-3.5" /> Remove from CRM
          </button>
        </div>
      </div>
    </div>
  )
}

/** Sync-to-Twenty button + "View in Twenty" deep link.  When the
 *  TWENTY_* envs aren't set on the server, the API returns 503 and
 *  this just shows a brief "not configured" message. */
function TwentySyncRow({ entry }: { entry: Entry }) {
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<{ url: string | null; syncedAt: string | null }>({
    url: entry.twentyOpportunityUrl ?? null,
    syncedAt: entry.twentyLastSyncedAt ?? null,
  })

  async function sync() {
    setSyncing(true)
    setError(null)
    try {
      const res = await fetch("/api/twenty/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crmEntryId: entry.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 503) {
        setError("Twenty not configured (TWENTY_BASE_URL + TWENTY_API_KEY in .env.local).")
        return
      }
      if (!res.ok) throw new Error(data?.error ?? `Sync failed (${res.status})`)
      setLast({
        url: data?.twentyOpportunityUrl ?? null,
        syncedAt: new Date().toISOString(),
      })
      if (Array.isArray(data?.errors) && data.errors.length) {
        setError(data.errors.join("; "))
      }
    } catch (e: any) {
      setError(e?.message ?? "Sync failed")
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="pt-4 border-t border-foreground/10">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          <Database className="w-3 h-3" /> Twenty CRM
        </div>
        <button
          type="button"
          onClick={sync}
          disabled={syncing}
          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50"
          title={last.syncedAt ? "Re-sync to Twenty" : "Push to Twenty (Company + Person + Opportunity)"}
        >
          {syncing
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : last.syncedAt ? <RefreshCw className="w-3 h-3" /> : <Send className="w-3 h-3" />}
          {last.syncedAt ? "Re-sync" : "Sync to Twenty"}
        </button>
      </div>
      {last.url && (
        <a
          href={last.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-foreground/80 hover:text-foreground hover:underline"
        >
          View in Twenty
          <ExternalLink className="w-3 h-3" />
        </a>
      )}
      {last.syncedAt && (
        <div className="text-[10px] font-mono text-muted-foreground mt-1">
          last synced {new Date(last.syncedAt).toLocaleString()}
        </div>
      )}
      {error && (
        <div className="text-[10px] text-rose-600 mt-1">{error}</div>
      )}
    </div>
  )
}
