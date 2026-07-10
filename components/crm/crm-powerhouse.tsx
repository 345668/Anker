"use client"

/**
 * CrmPowerhouse — /dashboard/crm, exclusively for relationship management.
 *
 * Structure (Attio-style):
 *   - Editorial header + live KPIs (pipeline funnel, response rate, stale, overdue)
 *   - Today queue: open follow-ups due/overdue, checked off inline
 *   - Toolbar: search · filter chips (stage/tier/score/stale/tags) · saved
 *     views · board tabs · view mode (List | Grid | Kanban)
 *   - List mode: contact list on the left, persistent ContactDetail pane right
 *   - Grid mode: the Excel-style CrmGrid full-width; row click opens the
 *     detail as an overlay drawer. Kanban: stage columns with drag & drop.
 *   - Bulk bar on multi-select: stage / tier / board / tag / export CSV / delete
 *
 * Outreach lives on /dashboard/outreach — the detail pane deep-links to it.
 */

import { useMemo, useState, useTransition } from "react"
import useSWR from "swr"
import {
  LayoutGrid, Table2, Columns3, Plus, Pencil, Check, X, Trash2, Loader2,
  Download, Bookmark, ChevronDown, SlidersHorizontal, CalendarClock, Linkedin,
} from "lucide-react"
import { CrmGrid, type CrmRow } from "@/components/tesseract/crm-grid"
import { LinkedInImportDialog } from "@/components/tesseract/linkedin-import-dialog"
import { ContactDetail } from "./contact-detail"
import { useCrmWebMcp } from "@/components/webmcp/crm-tools"

export interface Board {
  id: string
  name: string
  sourceSessionId: string | null
  position: number | null
  isDefault: boolean
  count: number
}

interface Props {
  initialBoards: Board[]
  initialEntries: CrmRow[]
  unassigned?: number
}

const STAGES = ["queued", "contacted", "responded", "meeting", "in_diligence", "committed", "passed"] as const
const STAGE_LABEL: Record<string, string> = {
  queued: "Queued", contacted: "Contacted", responded: "Responded", meeting: "Meeting",
  in_diligence: "Diligence", committed: "Committed", passed: "Passed",
}
const STAGE_COLOR: Record<string, string> = {
  queued: "bg-slate-100 text-slate-700",
  contacted: "bg-blue-100 text-blue-700",
  responded: "bg-amber-100 text-amber-700",
  meeting: "bg-cyan-100 text-cyan-700",
  in_diligence: "bg-violet-100 text-violet-700",
  committed: "bg-emerald-100 text-emerald-700",
  passed: "bg-rose-100 text-rose-700",
}
const TIERS = ["A", "B", "C"]
const STALE_DAYS = 14

interface Filters {
  q: string
  stages: string[]
  tiers: string[]
  minScore: number | null
  staleOnly: boolean
  tags: string[]
}
const EMPTY_FILTERS: Filters = { q: "", stages: [], tiers: [], minScore: null, staleOnly: false, tags: [] }

interface SavedView { id: string; name: string; filters: Partial<Filters> & { boardId?: string } }
interface Task { id: string; crm_entry_id: string | null; title: string; due_at: string | null; done_at: string | null; entry_name?: string | null }

const fetcher = (u: string) => fetch(u).then((r) => r.json())

const isStale = (e: CrmRow) =>
  ["contacted", "responded"].includes(e.stage) &&
  (!e.lastContactedAt || Date.now() - new Date(e.lastContactedAt).getTime() > STALE_DAYS * 86400000)

const daysAgo = (iso: string | null) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null

export function CrmPowerhouse({ initialBoards, initialEntries, unassigned = 0 }: Props) {
  const [boards, setBoards] = useState<Board[]>(initialBoards)
  const [entries, setEntries] = useState<CrmRow[]>(initialEntries)
  const [activeBoard, setActiveBoard] = useState<string>("all")
  const [view, setView] = useState<"list" | "grid" | "kanban">("list")
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [filterOpen, setFilterOpen] = useState(false)
  const [viewsOpen, setViewsOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detailId, setDetailId] = useState<string | null>(initialEntries[0]?.id ?? null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState("")
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [, startTransition] = useTransition()

  const { data: viewData, mutate: mutateViews } = useSWR<{ views: SavedView[] }>("/api/crm/views", fetcher)
  const { data: taskData, mutate: mutateTasks } = useSWR<{ tasks: Task[] }>("/api/crm/tasks?open=1", fetcher)

  const savedViews = viewData?.views ?? []
  const todayTasks = (taskData?.tasks ?? []).filter(
    (t) => t.due_at && new Date(t.due_at).getTime() < Date.now() + 86400000,
  )

  useCrmWebMcp({
    entries: entries as any,
    setFilter: (q: string) => setFilters((f) => ({ ...f, q })),
    setStudioRow: ((row: any) => { if (row?.id) setDetailId(row.id) }) as any,
    updateEntry: patchEntry,
  })

  // ── mutations ──────────────────────────────────────────────────────
  function patchEntry(id: string, patch: Record<string, any>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...localPatch(patch) } : e)))
    // tags are written by the bulk endpoint from the detail pane — local only here.
    const serverPatch = { ...patch }
    delete (serverPatch as any).tags
    if (!Object.keys(serverPatch).length) return
    startTransition(async () => {
      try {
        await fetch(`/api/crm/entries/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(serverPatch),
        })
      } catch (e) { console.error("[crm] update failed", e) }
    })
  }

  function deleteEntry(id: string) {
    if (!confirm("Remove this contact from your CRM?")) return
    setEntries((prev) => prev.filter((e) => e.id !== id))
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n })
    if (detailId === id) setDetailId(null)
    startTransition(async () => {
      try { await fetch(`/api/crm/entries/${id}`, { method: "DELETE" }) }
      catch (e) { console.error("[crm] delete failed", e) }
    })
  }

  async function bulk(set: Record<string, unknown>) {
    const ids = Array.from(selected)
    if (!ids.length) return
    setEntries((prev) => prev.map((e) => (selected.has(e.id) ? { ...e, ...localPatch(set) } : e)))
    await fetch("/api/crm/entries/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, set }),
    })
  }

  async function bulkDelete() {
    const ids = Array.from(selected)
    if (!ids.length || !confirm(`Remove ${ids.length} contacts from your CRM?`)) return
    setEntries((prev) => prev.filter((e) => !selected.has(e.id)))
    setSelected(new Set())
    await fetch("/api/crm/entries/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action: "delete" }),
    })
  }

  function exportCsv(rows: CrmRow[]) {
    const headers = ["name", "title", "type", "email", "linkedin", "location", "stage", "tier", "score", "tags", "last_contacted", "notes"]
    const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const csv = [headers.join(",")].concat(rows.map((e) => [
      e.displayName, e.displayTitle, e.displayType, e.displayEmail, e.displayLinkedin,
      e.displayLocation, e.stage, e.displayTier, e.displayScore,
      ((e as any).tags ?? []).join("; "), e.lastContactedAt?.slice(0, 10), e.notes,
    ].map(esc).join(","))).join("\n")
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    a.download = `anker-crm-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  // ── boards ─────────────────────────────────────────────────────────
  async function createBoard() {
    const name = prompt("Name this board (e.g. 'Climate LPs', 'Seed angels')")?.trim()
    if (!name) return
    const res = await fetch("/api/crm/boards", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.board) { setBoards((p) => [...p, { ...data.board, count: 0 }]); setActiveBoard(data.board.id) }
  }
  async function commitRename(id: string) {
    const name = renameVal.trim(); setRenaming(null)
    if (!name) return
    setBoards((p) => p.map((b) => (b.id === id ? { ...b, name } : b)))
    await fetch(`/api/crm/boards/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    })
  }
  async function deleteBoard(b: Board) {
    if (b.isDefault) { alert("This is your default board — rename it instead."); return }
    if (!confirm(`Delete board "${b.name}"? Its contacts move to your default board.`)) return
    const res = await fetch(`/api/crm/boards/${b.id}`, { method: "DELETE" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { alert(data?.error ?? "Delete failed"); return }
    setEntries((p) => p.map((e) => (e.boardId === b.id ? { ...e, boardId: data?.movedTo ?? null } : e)))
    setBoards((p) => p.filter((x) => x.id !== b.id))
    if (activeBoard === b.id) setActiveBoard("all")
  }

  // ── saved views ────────────────────────────────────────────────────
  async function saveCurrentView() {
    const name = prompt("Name this view (e.g. 'Tier A · stale', 'Committed')")?.trim()
    if (!name) return
    await fetch("/api/crm/views", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, filters: { ...filters, boardId: activeBoard } }),
    })
    mutateViews()
  }
  function applyView(v: SavedView) {
    const f = v.filters || {}
    setFilters({
      q: f.q ?? "", stages: f.stages ?? [], tiers: f.tiers ?? [],
      minScore: f.minScore ?? null, staleOnly: !!f.staleOnly, tags: f.tags ?? [],
    })
    if (f.boardId) setActiveBoard(f.boardId)
    setViewsOpen(false)
  }
  async function deleteView(v: SavedView) {
    await fetch(`/api/crm/views/${v.id}`, { method: "DELETE" })
    mutateViews()
  }

  // ── derived ────────────────────────────────────────────────────────
  const allTags = useMemo(() => {
    const s = new Set<string>()
    for (const e of entries) for (const t of ((e as any).tags ?? [])) s.add(t)
    return Array.from(s).sort()
  }, [entries])

  const visible = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    return entries.filter((e) => {
      if (activeBoard === "__none__" && e.boardId) return false
      if (activeBoard !== "all" && activeBoard !== "__none__" && e.boardId !== activeBoard) return false
      if (filters.stages.length && !filters.stages.includes(e.stage)) return false
      if (filters.tiers.length && !filters.tiers.includes(e.displayTier ?? "")) return false
      if (filters.minScore != null && (e.displayScore ?? -1) < filters.minScore) return false
      if (filters.staleOnly && !isStale(e)) return false
      if (filters.tags.length) {
        const t = new Set(((e as any).tags ?? []) as string[])
        if (!filters.tags.some((x) => t.has(x))) return false
      }
      if (!q) return true
      return [e.displayName, e.displayTitle, e.displayType, e.displayEmail, e.displayLocation, e.whyMatch]
        .some((v) => (v ?? "").toLowerCase().includes(q))
    })
  }, [entries, activeBoard, filters])

  const kpis = useMemo(() => {
    const byStage: Record<string, number> = {}
    let contactedPlus = 0, engaged = 0, stale = 0
    for (const e of entries) {
      byStage[e.stage] = (byStage[e.stage] ?? 0) + 1
      if (e.stage !== "queued") contactedPlus++
      if (["responded", "meeting", "in_diligence", "committed"].includes(e.stage)) engaged++
      if (isStale(e)) stale++
    }
    return {
      total: entries.length, byStage,
      responseRate: contactedPlus ? Math.round((engaged / contactedPlus) * 100) : null,
      stale,
      overdue: (taskData?.tasks ?? []).filter((t) => t.due_at && new Date(t.due_at).getTime() < Date.now()).length,
    }
  }, [entries, taskData])

  const detailRow = detailId ? entries.find((e) => e.id === detailId) ?? null : null
  const activeFilterCount =
    filters.stages.length + filters.tiers.length + filters.tags.length +
    (filters.minScore != null ? 1 : 0) + (filters.staleOnly ? 1 : 0)

  const boardLites = useMemo(() => boards.map((b) => ({ id: b.id, name: b.name })), [boards])
  const chipBase = "h-7 px-2.5 rounded-full text-[11px] font-mono border transition-colors"
  const chipOn = "bg-foreground text-background border-foreground"
  const chipOff = "border-foreground/15 text-muted-foreground hover:bg-foreground/5"

  async function completeTask(t: Task) {
    await fetch(`/api/crm/tasks/${t.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done: true }),
    })
    mutateTasks()
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="px-6 lg:px-10 pt-6 pb-4 border-b border-foreground/10">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-1.5">
              <span className="w-8 h-px bg-foreground/30" />
              CRM · investor relationships
            </span>
            <h1 className="text-3xl lg:text-4xl font-display tracking-tight leading-[0.95]">Relationships.</h1>
          </div>
          <div className="flex items-center gap-5">
            <Kpi label="Contacts" value={String(kpis.total)} />
            <Kpi label="Response rate" value={kpis.responseRate != null ? `${kpis.responseRate}%` : "—"} />
            <Kpi label="Stale" value={String(kpis.stale)} warn={kpis.stale > 0} />
            <Kpi label="Overdue" value={String(kpis.overdue)} warn={kpis.overdue > 0} />
            <button onClick={() => setImportOpen(true)} title="Import a LinkedIn profile by pasting its HTML"
              className="inline-flex items-center gap-2 rounded-full h-9 px-4 border border-foreground/15 hover:bg-foreground/5 text-sm">
              <Linkedin className="w-4 h-4" /> Import
            </button>
            <button onClick={() => exportCsv(visible)} title="Export current view as CSV"
              className="inline-flex items-center gap-2 rounded-full h-9 px-4 border border-foreground/15 hover:bg-foreground/5 text-sm">
              <Download className="w-4 h-4" /> Export
            </button>
          </div>
        </div>

        {/* Funnel strip */}
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          {STAGES.map((s) => (
            <button key={s}
              onClick={() => setFilters((f) => ({ ...f, stages: f.stages.includes(s) ? f.stages.filter((x) => x !== s) : [...f.stages, s] }))}
              className={`${chipBase} ${filters.stages.includes(s) ? chipOn : `${STAGE_COLOR[s]} border-transparent hover:opacity-80`}`}>
              {STAGE_LABEL[s]} {kpis.byStage[s] ?? 0}
            </button>
          ))}
        </div>

        {/* Today queue */}
        {todayTasks.length > 0 && (
          <div className="mt-3 flex items-center gap-2 flex-wrap p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5">
            <CalendarClock className="w-4 h-4 text-amber-700 shrink-0" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-amber-800 mr-1">Today</span>
            {todayTasks.slice(0, 5).map((t) => (
              <button key={t.id} onClick={() => completeTask(t)} title="Click to complete"
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-background border border-foreground/15 text-xs hover:border-emerald-500/50 group">
                <span className="w-3 h-3 rounded-sm border border-foreground/30 group-hover:bg-emerald-500/20" />
                <span className="max-w-[220px] truncate">{t.title}{t.entry_name ? ` · ${t.entry_name}` : ""}</span>
              </button>
            ))}
            {todayTasks.length > 5 && <span className="text-xs text-amber-800">+{todayTasks.length - 5} more</span>}
          </div>
        )}

        {/* Toolbar */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <input value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder="Search name, firm, title, email…"
            className="h-9 w-64 px-3 rounded-md border border-input bg-background text-sm" />

          <div className="relative">
            <button onClick={() => { setFilterOpen((v) => !v); setViewsOpen(false) }}
              className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-sm ${activeFilterCount ? "border-foreground/50" : "border-input"} hover:bg-foreground/5`}>
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filters{activeFilterCount ? ` · ${activeFilterCount}` : ""}
            </button>
            {filterOpen && (
              <div className="absolute z-30 mt-1 w-[340px] p-4 rounded-lg border border-foreground/10 bg-background shadow-xl space-y-3">
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5">Tier</div>
                  <div className="flex gap-1.5">
                    {TIERS.map((t) => (
                      <button key={t}
                        onClick={() => setFilters((f) => ({ ...f, tiers: f.tiers.includes(t) ? f.tiers.filter((x) => x !== t) : [...f.tiers, t] }))}
                        className={`${chipBase} ${filters.tiers.includes(t) ? chipOn : chipOff}`}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5">Min score</div>
                  <input type="number" value={filters.minScore ?? ""} placeholder="e.g. 70"
                    onChange={(e) => setFilters((f) => ({ ...f, minScore: e.target.value === "" ? null : Number(e.target.value) }))}
                    className="h-8 w-24 px-2 rounded-md border border-input bg-background text-sm font-mono" />
                </div>
                {allTags.length > 0 && (
                  <div>
                    <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5">Tags</div>
                    <div className="flex gap-1.5 flex-wrap">
                      {allTags.map((t) => (
                        <button key={t}
                          onClick={() => setFilters((f) => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t] }))}
                          className={`${chipBase} ${filters.tags.includes(t) ? chipOn : chipOff}`}>{t}</button>
                      ))}
                    </div>
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={filters.staleOnly}
                    onChange={(e) => setFilters((f) => ({ ...f, staleOnly: e.target.checked }))} />
                  Stale only (no touch in {STALE_DAYS}+ days)
                </label>
                <div className="flex justify-between pt-1">
                  <button onClick={() => setFilters(EMPTY_FILTERS)} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">Clear all</button>
                  <button onClick={() => setFilterOpen(false)} className="text-xs font-medium">Done</button>
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button onClick={() => { setViewsOpen((v) => !v); setFilterOpen(false) }}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-input hover:bg-foreground/5 text-sm">
              <Bookmark className="w-3.5 h-3.5" /> Views <ChevronDown className="w-3 h-3" />
            </button>
            {viewsOpen && (
              <div className="absolute z-30 mt-1 w-64 py-1 rounded-lg border border-foreground/10 bg-background shadow-xl">
                {savedViews.map((v) => (
                  <div key={v.id} className="flex items-center group">
                    <button onClick={() => applyView(v)} className="flex-1 text-left px-3 py-1.5 text-sm hover:bg-foreground/5 truncate">{v.name}</button>
                    <button onClick={() => deleteView(v)} className="px-2 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {!savedViews.length && <div className="px-3 py-2 text-xs text-muted-foreground">No saved views yet.</div>}
                <button onClick={saveCurrentView}
                  className="w-full text-left px-3 py-1.5 text-sm border-t border-foreground/10 hover:bg-foreground/5 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Save current view
                </button>
              </div>
            )}
          </div>

          {/* Board tabs */}
          <div className="flex items-center gap-1 ml-2 overflow-x-auto">
            <BoardTab active={activeBoard === "all"} onClick={() => setActiveBoard("all")} label={`All · ${entries.length}`} />
            {boards.map((b) => renaming === b.id ? (
              <span key={b.id} className="inline-flex items-center gap-1">
                <input autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") commitRename(b.id); if (e.key === "Escape") setRenaming(null) }}
                  className="h-7 w-28 px-2 rounded-md border border-input bg-background text-xs" />
                <button onClick={() => commitRename(b.id)}><Check className="w-3.5 h-3.5" /></button>
              </span>
            ) : (
              <span key={b.id} className="group inline-flex items-center">
                <BoardTab active={activeBoard === b.id} onClick={() => setActiveBoard(b.id)}
                  label={`${b.name} · ${entries.filter((e) => e.boardId === b.id).length}`} />
                <span className="hidden group-hover:inline-flex">
                  <button onClick={() => { setRenaming(b.id); setRenameVal(b.name) }} className="p-0.5 text-muted-foreground hover:text-foreground"><Pencil className="w-3 h-3" /></button>
                  {!b.isDefault && <button onClick={() => deleteBoard(b)} className="p-0.5 text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>}
                </span>
              </span>
            ))}
            {unassigned > 0 && <BoardTab active={activeBoard === "__none__"} onClick={() => setActiveBoard("__none__")} label={`Unassigned · ${unassigned}`} />}
            <button onClick={createBoard} className="h-7 w-7 rounded-full border border-foreground/15 flex items-center justify-center text-muted-foreground hover:bg-foreground/5">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* View mode */}
          <div className="ml-auto flex items-center rounded-md border border-input overflow-hidden">
            {([["list", Columns3], ["grid", Table2], ["kanban", LayoutGrid]] as const).map(([m, Icon]) => (
              <button key={m} onClick={() => setView(m)}
                className={`h-9 px-3 text-xs inline-flex items-center gap-1.5 ${view === m ? "bg-foreground text-background" : "hover:bg-foreground/5"}`}>
                <Icon className="w-3.5 h-3.5" />
                {m === "list" ? "List" : m === "grid" ? "Grid" : "Kanban"}
              </button>
            ))}
          </div>
        </div>

        {/* Bulk bar */}
        {selected.size > 0 && (
          <div className="mt-3 flex items-center gap-2 flex-wrap p-2 rounded-lg bg-foreground text-background text-sm">
            <span className="font-mono text-xs px-2">{selected.size} selected</span>
            <select onChange={(e) => e.target.value && bulk({ stage: e.target.value })} defaultValue=""
              className="h-7 px-1.5 rounded bg-background text-foreground text-xs">
              <option value="" disabled>Set stage…</option>
              {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
            </select>
            <select onChange={(e) => bulk({ tier: e.target.value || null })} defaultValue=""
              className="h-7 px-1.5 rounded bg-background text-foreground text-xs">
              <option value="" disabled>Set tier…</option>
              {TIERS.map((t) => <option key={t} value={t}>Tier {t}</option>)}
            </select>
            <select onChange={(e) => e.target.value && bulk({ boardId: e.target.value })} defaultValue=""
              className="h-7 px-1.5 rounded bg-background text-foreground text-xs">
              <option value="" disabled>Move to board…</option>
              {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button onClick={() => { const t = prompt("Tag to add:")?.trim(); if (t) bulk({ addTags: [t] }) }}
              className="h-7 px-2.5 rounded bg-background/15 hover:bg-background/25 text-xs">+ Tag</button>
            <button onClick={() => exportCsv(entries.filter((e) => selected.has(e.id)))}
              className="h-7 px-2.5 rounded bg-background/15 hover:bg-background/25 text-xs">Export</button>
            <button onClick={bulkDelete} className="h-7 px-2.5 rounded bg-destructive/80 hover:bg-destructive text-xs">Delete</button>
            <button onClick={() => setSelected(new Set())} className="ml-auto h-7 px-2 text-xs opacity-70 hover:opacity-100">Clear</button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex">
        {view === "list" && (
          <>
            <div className="w-[420px] shrink-0 border-r border-foreground/10 overflow-y-auto">
              {visible.map((e) => {
                const d = daysAgo(e.lastContactedAt)
                return (
                  <button key={e.id} onClick={() => setDetailId(e.id)}
                    className={`w-full text-left px-4 py-3 border-b border-foreground/5 hover:bg-foreground/[0.03] ${detailId === e.id ? "bg-foreground/[0.05]" : ""}`}>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={selected.has(e.id)}
                        onClick={(ev) => ev.stopPropagation()}
                        onChange={() => setSelected((prev) => { const n = new Set(prev); n.has(e.id) ? n.delete(e.id) : n.add(e.id); return n })}
                        className="shrink-0" />
                      <span className="font-medium text-sm truncate flex-1">{e.displayName}</span>
                      {e.displayScore != null && <span className="font-mono text-[10px] text-muted-foreground">{e.displayScore}</span>}
                      {e.displayTier && <span className="font-mono text-[10px] px-1.5 rounded bg-foreground/5">{e.displayTier}</span>}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 pl-6">
                      <span className="text-xs text-muted-foreground truncate flex-1">
                        {[e.displayTitle, e.displayType].filter(Boolean).join(" · ") || "—"}
                      </span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${STAGE_COLOR[e.stage] ?? ""}`}>{STAGE_LABEL[e.stage] ?? e.stage}</span>
                      {isStale(e) && <span className="text-[10px] font-mono text-amber-700" title={`No touch in ${d ?? "∞"} days`}>stale</span>}
                    </div>
                  </button>
                )
              })}
              {!visible.length && <div className="p-8 text-center text-sm text-muted-foreground">No contacts match.</div>}
            </div>
            <div className="flex-1 min-w-0">
              {detailRow
                ? <ContactDetail row={detailRow} onPatch={patchEntry} onDelete={deleteEntry} />
                : <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Select a contact.</div>}
            </div>
          </>
        )}

        {view === "grid" && (
          <div className="flex-1 min-w-0 overflow-auto p-4">
            <CrmGrid
              rows={visible}
              boards={boardLites}
              selected={selected}
              onToggleSelect={(id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })}
              onToggleSelectAll={(ids: string[]) => setSelected((prev) => prev.size === ids.length ? new Set() : new Set(ids))}
              onEdit={patchEntry}
              onDelete={deleteEntry}
              onOpenStudio={(row: CrmRow) => setDetailId(row.id)}
              onBulkMove={(boardId: string) => bulk({ boardId })}
              onBulkDelete={bulkDelete}
            />
            {detailRow && <ContactDetail overlay row={detailRow} onPatch={patchEntry} onDelete={deleteEntry} onClose={() => setDetailId(null)} />}
          </div>
        )}

        {view === "kanban" && (
          <div className="flex-1 min-w-0 overflow-x-auto p-4">
            <div className="flex gap-3 min-h-full">
              {STAGES.map((s) => (
                <div key={s}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { if (draggingId) { patchEntry(draggingId, { stage: s }); setDraggingId(null) } }}
                  className="w-60 shrink-0 rounded-lg border border-foreground/10 bg-foreground/[0.02]">
                  <div className="px-3 py-2 border-b border-foreground/10 flex items-center justify-between">
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${STAGE_COLOR[s]}`}>{STAGE_LABEL[s]}</span>
                    <span className="font-mono text-xs">{visible.filter((e) => e.stage === s).length}</span>
                  </div>
                  <div className="p-2 space-y-2">
                    {visible.filter((e) => e.stage === s).map((e) => (
                      <div key={e.id} draggable
                        onDragStart={() => setDraggingId(e.id)}
                        onClick={() => setDetailId(e.id)}
                        className="p-2.5 rounded-md border border-foreground/10 bg-background hover:border-foreground/30 cursor-pointer">
                        <div className="text-sm font-medium truncate">{e.displayName}</div>
                        <div className="text-xs text-muted-foreground truncate">{e.displayTitle ?? e.displayType ?? "—"}</div>
                        <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                          <span>{e.displayTier ? `Tier ${e.displayTier}` : ""}</span>
                          <span>{e.displayScore ?? ""}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {detailRow && <ContactDetail overlay row={detailRow} onPatch={patchEntry} onDelete={deleteEntry} onClose={() => setDetailId(null)} />}
          </div>
        )}
      </div>

      <LinkedInImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onIngested={() => { window.location.reload() }}
      />
    </div>
  )
}

function Kpi({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="text-right">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-display text-2xl ${warn ? "text-amber-700" : ""}`}>{value}</div>
    </div>
  )
}

function BoardTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick}
      className={`h-7 px-3 rounded-full text-xs whitespace-nowrap ${active ? "bg-foreground text-background" : "border border-foreground/15 text-muted-foreground hover:bg-foreground/5"}`}>
      {label}
    </button>
  )
}

function localPatch(patch: Record<string, any>): Partial<CrmRow> {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (k === "tier") out.displayTier = v
    else if (k === "boardId") out.boardId = v
    else if (k === "addTags" || k === "removeTags") { /* handled via tags */ }
    else out[k] = v
  }
  return out
}
