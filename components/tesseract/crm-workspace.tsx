"use client"

/**
 * CrmWorkspace — the CRM page shell.
 *
 *   - Board tab bar ("CRM sessions"): All | board1 | board2 | + New.
 *     The active board can be renamed inline (double-click / pencil) and
 *     deleted (its rows move to the default board, never deleted).
 *   - View toggle: Grid (Excel-style, default) | Kanban.
 *   - Founder context card (the "profile set" the studio reads).
 *   - Outreach studio launches from a grid row or a kanban card.
 *
 * One entries[] state feeds both views, so edits stay consistent.
 */

import { useMemo, useState, useTransition } from "react"
import {
  LayoutGrid, Table2, Plus, Pencil, Check, X, Trash2, Search, Loader2,
  Inbox, Send, MessageCircle, Calendar, Search as SearchIcon, CheckCircle2, XCircle, Sparkles,
} from "lucide-react"
import { CrmGrid, type CrmRow } from "./crm-grid"
import { OutreachStudio, type StudioEntry } from "./outreach-studio"
import { FounderContextCard, useFounderContext } from "./founder-context-card"

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

const KANBAN_STAGES = [
  { key: "queued", label: "Queued", icon: Inbox, color: "text-slate-600 bg-slate-50 border-slate-200" },
  { key: "contacted", label: "Contacted", icon: Send, color: "text-blue-700 bg-blue-50 border-blue-200" },
  { key: "responded", label: "Responded", icon: MessageCircle, color: "text-amber-700 bg-amber-50 border-amber-200" },
  { key: "meeting", label: "Meeting", icon: Calendar, color: "text-cyan-700 bg-cyan-50 border-cyan-200" },
  { key: "in_diligence", label: "In diligence", icon: SearchIcon, color: "text-violet-700 bg-violet-50 border-violet-200" },
  { key: "committed", label: "Committed", icon: CheckCircle2, color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  { key: "passed", label: "Passed", icon: XCircle, color: "text-rose-700 bg-rose-50 border-rose-200" },
] as const

export function CrmWorkspace({ initialBoards, initialEntries, unassigned = 0 }: Props) {
  const [boards, setBoards] = useState<Board[]>(initialBoards)
  const [entries, setEntries] = useState<CrmRow[]>(initialEntries)
  const [activeBoard, setActiveBoard] = useState<string>("all") // "all" | "__none__" | boardId
  const [view, setView] = useState<"grid" | "kanban">("grid")
  const [filter, setFilter] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [studioRow, setStudioRow] = useState<CrmRow | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState("")
  const [bulkBoard, setBulkBoard] = useState("")
  const [sendDialogOpen, setSendDialogOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [founder, setFounder] = useFounderContext()
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const boardLites = useMemo(() => boards.map((b) => ({ id: b.id, name: b.name })), [boards])

  // Rows for the active board + search.
  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return entries.filter((e) => {
      if (activeBoard === "__none__" && e.boardId) return false
      if (activeBoard !== "all" && activeBoard !== "__none__" && e.boardId !== activeBoard) return false
      if (!f) return true
      return (
        e.displayName.toLowerCase().includes(f) ||
        (e.displayTitle ?? "").toLowerCase().includes(f) ||
        (e.displayType ?? "").toLowerCase().includes(f) ||
        (e.displayEmail ?? "").toLowerCase().includes(f) ||
        (e.displayLocation ?? "").toLowerCase().includes(f) ||
        (e.whyMatch ?? "").toLowerCase().includes(f)
      )
    })
  }, [entries, activeBoard, filter])

  // Live counts per board from current entries.
  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    let none = 0
    for (const e of entries) {
      if (!e.boardId) none++
      else m[e.boardId] = (m[e.boardId] ?? 0) + 1
    }
    return { m, none }
  }, [entries])

  // ─── entry mutations ───────────────────────────────────────────────
  function updateEntry(id: string, patch: Record<string, any>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...mapPatch(patch) } : e)))
    startTransition(async () => {
      try {
        await fetch(`/api/crm/entries/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        })
      } catch (e) { console.error("[crm] update failed", e) }
    })
  }

  function deleteEntry(id: string) {
    if (!confirm("Remove this investor from your CRM?")) return
    setEntries((prev) => prev.filter((e) => e.id !== id))
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n })
    if (studioRow?.id === id) setStudioRow(null)
    startTransition(async () => {
      try { await fetch(`/api/crm/entries/${id}`, { method: "DELETE" }) }
      catch (e) { console.error("[crm] delete failed", e) }
    })
  }

  // ─── board mutations ───────────────────────────────────────────────
  async function createBoard() {
    const name = prompt("Name this CRM (e.g. 'Climate LPs', 'Seed angels')")?.trim()
    if (!name) return
    try {
      const res = await fetch("/api/crm/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (res.ok && data.board) {
        setBoards((prev) => [...prev, { ...data.board, count: 0 }])
        setActiveBoard(data.board.id)
      }
    } catch (e) { console.error("[crm] create board failed", e) }
  }

  function startRename(b: Board) { setRenaming(b.id); setRenameVal(b.name) }
  async function commitRename(id: string) {
    const name = renameVal.trim()
    setRenaming(null)
    if (!name) return
    setBoards((prev) => prev.map((b) => (b.id === id ? { ...b, name } : b)))
    try {
      await fetch(`/api/crm/boards/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
    } catch (e) { console.error("[crm] rename failed", e) }
  }

  async function deleteBoard(b: Board) {
    if (b.isDefault) { alert("This is your default board — rename it instead of deleting."); return }
    if (!confirm(`Delete board "${b.name}"? Its investors move to your default board (they are not deleted).`)) return
    try {
      const res = await fetch(`/api/crm/boards/${b.id}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { alert(data?.error ?? "Delete failed"); return }
      const fallbackId: string | null = data?.movedTo ?? null
      setEntries((prev) => prev.map((e) => (e.boardId === b.id ? { ...e, boardId: fallbackId } : e)))
      setBoards((prev) => prev.filter((x) => x.id !== b.id))
      if (activeBoard === b.id) setActiveBoard("all")
    } catch (e) { console.error("[crm] delete board failed", e) }
  }

  // ─── selection / bulk ──────────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleSelectAll(ids: string[]) {
    setSelected((prev) => {
      const allOn = ids.every((id) => prev.has(id))
      const n = new Set(prev)
      ids.forEach((id) => (allOn ? n.delete(id) : n.add(id)))
      return n
    })
  }
  function bulkMove(boardId: string) {
    if (!boardId) return
    const ids = [...selected]
    setEntries((prev) => prev.map((e) => (selected.has(e.id) ? { ...e, boardId } : e)))
    setSelected(new Set())
    startTransition(async () => {
      await Promise.all(ids.map((id) => fetch(`/api/crm/entries/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ boardId }),
      }).catch(() => {})))
    })
  }
  function bulkDelete() {
    const ids = [...selected]
    if (!ids.length || !confirm(`Remove ${ids.length} investor(s) from your CRM?`)) return
    setEntries((prev) => prev.filter((e) => !selected.has(e.id)))
    setSelected(new Set())
    startTransition(async () => {
      await Promise.all(ids.map((id) => fetch(`/api/crm/entries/${id}`, { method: "DELETE" }).catch(() => {})))
    })
  }

  const total = entries.length

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-foreground/10">
        <div className="px-8 py-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="font-display text-2xl">CRM</h1>
              <p className="text-sm text-muted-foreground">
                Your matched investors as a working spreadsheet. {total} total
                {pending && <Loader2 className="w-3 h-3 inline-block ml-2 animate-spin" />}
              </p>
            </div>
            <div className="flex items-center gap-1 border border-foreground/15 rounded-md p-0.5">
              <button
                onClick={() => setView("grid")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs ${view === "grid" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Table2 className="w-3.5 h-3.5" /> Grid
              </button>
              <button
                onClick={() => setView("kanban")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs ${view === "kanban" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
              >
                <LayoutGrid className="w-3.5 h-3.5" /> Kanban
              </button>
            </div>
          </div>

          {/* Board tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <BoardTab
              active={activeBoard === "all"}
              label="All"
              count={total}
              onClick={() => setActiveBoard("all")}
            />
            {boards.map((b) => (
              <div key={b.id} className="shrink-0">
                {renaming === b.id ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-blue-400 bg-background">
                    <input
                      autoFocus
                      value={renameVal}
                      onChange={(e) => setRenameVal(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") commitRename(b.id); if (e.key === "Escape") setRenaming(null) }}
                      className="text-xs w-28 focus:outline-none bg-background"
                    />
                    <button onClick={() => commitRename(b.id)} className="text-emerald-600"><Check className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setRenaming(null)} className="text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
                  </span>
                ) : (
                  <span
                    className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs cursor-pointer border ${activeBoard === b.id ? "bg-foreground text-background border-foreground" : "border-foreground/15 text-muted-foreground hover:border-foreground/30"}`}
                    onClick={() => setActiveBoard(b.id)}
                    onDoubleClick={() => startRename(b)}
                    title="Double-click to rename"
                  >
                    {b.name}{b.isDefault ? " ★" : ""}
                    <span className={`font-mono ${activeBoard === b.id ? "text-background/70" : "text-muted-foreground/60"}`}>{counts.m[b.id] ?? 0}</span>
                    {activeBoard === b.id && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); startRename(b) }} className="opacity-70 hover:opacity-100"><Pencil className="w-3 h-3" /></button>
                        {!b.isDefault && (
                          <button onClick={(e) => { e.stopPropagation(); deleteBoard(b) }} className="opacity-70 hover:opacity-100"><Trash2 className="w-3 h-3" /></button>
                        )}
                      </>
                    )}
                  </span>
                )}
              </div>
            ))}
            {counts.none > 0 && (
              <BoardTab active={activeBoard === "__none__"} label="Unassigned" count={counts.none} onClick={() => setActiveBoard("__none__")} />
            )}
            <button
              onClick={createBoard}
              className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs border border-dashed border-foreground/25 text-muted-foreground hover:border-foreground/50 hover:text-foreground"
            >
              <Plus className="w-3.5 h-3.5" /> New CRM
            </button>
          </div>

          {/* Founder context (profile set) */}
          <FounderContextCard ctx={founder} onChange={setFounder} defaultCollapsed className="mt-4" />

          {/* Search + bulk bar */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[260px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search name, title, type, email, location, why-match…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-foreground/15 rounded-md bg-background focus:outline-none focus:border-foreground/40"
              />
            </div>
            {selected.size > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">{selected.size} selected</span>
                <select
                  value={bulkBoard}
                  onChange={(e) => { setBulkBoard(e.target.value); bulkMove(e.target.value); setBulkBoard("") }}
                  className="h-8 px-2 border border-foreground/15 rounded-md bg-background"
                >
                  <option value="">Move to…</option>
                  {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <button
                  onClick={() => setSendDialogOpen(true)}
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  title="Queue selected investors into an outreach campaign"
                >
                  <Send className="w-3.5 h-3.5" /> Send to outreach
                </button>
                <button onClick={bulkDelete} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-8 py-6">
        {view === "grid" ? (
          <CrmGrid
            rows={visible}
            boards={boardLites}
            selected={selected}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            onEdit={updateEntry}
            onDelete={deleteEntry}
            onOpenStudio={(r) => setStudioRow(r)}
            onBulkMove={bulkMove}
            onBulkDelete={bulkDelete}
          />
        ) : (
          <Kanban
            rows={visible}
            draggingId={draggingId}
            setDraggingId={setDraggingId}
            onMove={(id, stage) => updateEntry(id, { stage })}
            onOpenStudio={(r) => setStudioRow(r)}
          />
        )}
      </div>

      <SendToOutreachDialog
        open={sendDialogOpen}
        onClose={() => setSendDialogOpen(false)}
        selectedIds={[...selected]}
        onDone={() => { setSendDialogOpen(false); setSelected(new Set()) }}
      />

      {studioRow && (
        <OutreachStudio
          entry={toStudioEntry(studioRow)}
          founder={founder}
          onClose={() => setStudioRow(null)}
          onAfterChange={() => {}}
        />
      )}
    </div>
  )
}

function BoardTab({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border ${active ? "bg-foreground text-background border-foreground" : "border-foreground/15 text-muted-foreground hover:border-foreground/30"}`}
    >
      {label}
      <span className={`font-mono ${active ? "text-background/70" : "text-muted-foreground/60"}`}>{count}</span>
    </button>
  )
}

function Kanban({ rows, draggingId, setDraggingId, onMove, onOpenStudio }: {
  rows: CrmRow[]
  draggingId: string | null
  setDraggingId: (id: string | null) => void
  onMove: (id: string, stage: string) => void
  onOpenStudio: (r: CrmRow) => void
}) {
  const grouped = useMemo(() => {
    const g: Record<string, CrmRow[]> = Object.fromEntries(KANBAN_STAGES.map((s) => [s.key, []]))
    for (const e of rows) (g[e.stage] ?? (g[e.stage] = [])).push(e)
    return g
  }, [rows])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
      {KANBAN_STAGES.map((s) => {
        const Icon = s.icon
        const items = grouped[s.key] ?? []
        return (
          <div
            key={s.key}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (draggingId) { onMove(draggingId, s.key); setDraggingId(null) } }}
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
              ) : items.map((e) => (
                <div
                  key={e.id}
                  draggable
                  onDragStart={() => setDraggingId(e.id)}
                  onDragEnd={() => setDraggingId(null)}
                  className="bg-background border border-foreground/10 rounded-md p-3 cursor-grab active:cursor-grabbing hover:border-foreground/30 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="font-medium text-sm leading-tight line-clamp-2">{e.displayName}</div>
                    {e.displayScore != null && (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-foreground/5 shrink-0">{e.displayScore}</span>
                    )}
                  </div>
                  {e.displayTitle && <div className="text-[11px] text-muted-foreground truncate">{e.displayTitle}</div>}
                  {e.displayLocation && <div className="text-[10px] font-mono text-muted-foreground/80 mt-1 truncate">{e.displayLocation}</div>}
                  <button
                    type="button"
                    onClick={(ev) => { ev.stopPropagation(); onOpenStudio(e) }}
                    className="mt-2 w-full inline-flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-mono rounded border border-foreground/15 hover:bg-foreground/5"
                  >
                    <Sparkles className="w-3 h-3" /> Outreach
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function mapPatch(patch: Record<string, any>): Partial<CrmRow> {
  // The API uses the same camelCase keys we store on CrmRow, so the patch
  // can be applied directly.
  return patch as Partial<CrmRow>
}

function toStudioEntry(r: CrmRow): StudioEntry {
  return {
    id: r.id,
    displayName: r.displayName,
    displayTitle: r.displayTitle,
    displayType: r.displayType,
    displayLocation: r.displayLocation,
    displayLinkedin: r.displayLinkedin,
    displayEmail: r.displayEmail,
    whyMatch: r.whyMatch,
    researchSummary: r.researchSummary,
    researchUrl: r.researchUrl,
    stage: r.stage,
  }
}

// ─── Send-to-outreach dialog ─────────────────────────────────────────────
function SendToOutreachDialog({ open, onClose, selectedIds, onDone }: {
  open: boolean
  onClose: () => void
  selectedIds: string[]
  onDone: () => void
}) {
  const [campaigns, setCampaigns] = useState<{ id: string; name: string; status: string; counts?: any }[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pickedId, setPickedId] = useState<string>("")
  const [newName, setNewName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ added: number; alreadyPresent: number } | null>(null)

  // Load campaigns when the dialog opens.
  useMemo(() => {
    if (!open) return
    setLoading(true); setError(null); setResult(null); setNewName("")
    fetch("/api/outreach/campaigns").then((r) => r.json()).then((d) => {
      setCampaigns(d?.campaigns ?? [])
      setPickedId(d?.campaigns?.[0]?.id ?? "")
    }).catch(() => setCampaigns([])).finally(() => setLoading(false))
  }, [open])

  if (!open) return null

  async function send() {
    setBusy(true); setError(null)
    try {
      let campaignId = pickedId
      // Create-on-the-fly if the user typed a new name.
      if (newName.trim()) {
        const r = await fetch("/api/outreach/campaigns", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName.trim() }),
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d?.error ?? "Create failed")
        campaignId = d.campaign.id
      }
      if (!campaignId) { setError("Pick a campaign or name a new one."); setBusy(false); return }
      const r2 = await fetch(`/api/outreach/campaigns/${campaignId}/members`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crmEntryIds: selectedIds }),
      })
      const d2 = await r2.json().catch(() => ({}))
      if (!r2.ok) throw new Error(d2?.error ?? "Send failed")
      setResult({ added: d2.added ?? 0, alreadyPresent: d2.alreadyPresent ?? 0 })
      setTimeout(onDone, 1200)
    } catch (e: any) { setError(e?.message ?? "Send failed") }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40" />
      <div
        className="relative w-[460px] max-w-full bg-background border border-foreground/10 rounded-lg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-foreground/10 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
              <Send className="w-3 h-3" /> Send to outreach
            </div>
            <h2 className="font-display text-lg">Queue {selectedIds.length} investor{selectedIds.length === 1 ? "" : "s"}</h2>
            <p className="text-xs text-muted-foreground mt-1">
              They land in the Outreach page as "planned", ready to draft with a template.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3 text-xs">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading campaigns…</div>
          ) : (
            <>
              {campaigns.length > 0 && (
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Existing campaign</label>
                  <select
                    value={pickedId}
                    onChange={(e) => setPickedId(e.target.value)}
                    className="w-full h-9 px-2 border border-foreground/15 rounded-md bg-background"
                  >
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="text-center text-[10px] font-mono text-muted-foreground">or</div>
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Create new campaign</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Q4 climate LPs"
                  className="w-full h-9 px-2 border border-foreground/15 rounded-md bg-background"
                />
              </div>
              {error && <div className="flex items-start gap-2 text-rose-600"><X className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}</div>}
              {result && <div className="text-emerald-700">Added {result.added}{result.alreadyPresent ? ` (${result.alreadyPresent} already in campaign)` : ""}.</div>}
            </>
          )}
        </div>
        <div className="p-4 border-t border-foreground/10 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-md hover:bg-foreground/5">Cancel</button>
          <button
            onClick={send}
            disabled={busy || (!pickedId && !newName.trim()) || selectedIds.length === 0}
            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Send to outreach
          </button>
        </div>
      </div>
    </div>
  )
}
