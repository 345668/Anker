"use client"

/**
 * CrmGrid — the Excel-style spreadsheet view of the CRM.
 *
 *   - sticky bordered header, zebra rows  → spreadsheet feel
 *   - click a header to sort (toggle asc/desc)
 *   - click a cell to edit it inline (text/number); stage + board are
 *     always dropdowns
 *   - per-row "Outreach" opens the studio; trash deletes
 *   - row checkboxes + a bulk bar (move to board / delete)
 *
 * State lives in the parent CrmWorkspace; this component is presentational
 * and calls back on every change.
 */

import { useMemo, useState } from "react"
import {
  ArrowUp, ArrowDown, Sparkles, Trash2, ExternalLink, Linkedin, ChevronsUpDown,
} from "lucide-react"

export interface CrmRow {
  id: string
  source: string
  sourceSessionId: string | null
  boardId: string | null
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
  researchSummary: string | null
  researchUrl: string | null
  addedAt: string | null
  lastContactedAt: string | null
  tags?: string[]
}

interface BoardLite { id: string; name: string }

export const GRID_STAGES = [
  "queued", "contacted", "responded", "meeting", "in_diligence", "committed", "passed",
] as const

const STAGE_COLOR: Record<string, string> = {
  queued: "bg-slate-100 text-slate-700",
  contacted: "bg-blue-100 text-blue-700",
  responded: "bg-amber-100 text-amber-700",
  meeting: "bg-cyan-100 text-cyan-700",
  in_diligence: "bg-violet-100 text-violet-700",
  committed: "bg-emerald-100 text-emerald-700",
  passed: "bg-rose-100 text-rose-700",
}

type SortKey = "displayName" | "displayType" | "displayLocation" | "displayScore" | "stage" | "addedAt"

interface Props {
  rows: CrmRow[]
  boards: BoardLite[]
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onToggleSelectAll: (ids: string[]) => void
  onEdit: (id: string, patch: Record<string, any>) => void
  onDelete: (id: string) => void
  onOpenStudio: (row: CrmRow) => void
  onBulkMove: (boardId: string) => void
  onBulkDelete: () => void
}

const COLUMNS: { key: SortKey | null; label: string; sortable: boolean; w?: string }[] = [
  { key: "displayName", label: "Name", sortable: true, w: "min-w-[160px]" },
  { key: "displayTitle" as any, label: "Title", sortable: false, w: "min-w-[150px]" },
  { key: "displayType", label: "Type", sortable: true, w: "min-w-[110px]" },
  { key: "displayLocation", label: "Location", sortable: true, w: "min-w-[120px]" },
  { key: null, label: "Email", sortable: false, w: "min-w-[180px]" },
  { key: null, label: "LinkedIn", sortable: false, w: "min-w-[90px]" },
  { key: "displayScore", label: "Score", sortable: true, w: "w-[70px]" },
  { key: null, label: "Tier", sortable: false, w: "w-[70px]" },
  { key: "stage", label: "Stage", sortable: true, w: "min-w-[130px]" },
  { key: null, label: "Board", sortable: false, w: "min-w-[130px]" },
  { key: null, label: "Why match", sortable: false, w: "min-w-[200px]" },
  { key: null, label: "Notes", sortable: false, w: "min-w-[180px]" },
  { key: null, label: "", sortable: false, w: "w-[90px]" },
]

export function CrmGrid(props: Props) {
  const { rows, boards, selected, onToggleSelect, onToggleSelectAll, onEdit, onDelete, onOpenStudio } = props
  const [sortKey, setSortKey] = useState<SortKey>("displayScore")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [editing, setEditing] = useState<{ id: string; field: string } | null>(null)
  const [draft, setDraft] = useState("")

  const sorted = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      let av: any = (a as any)[sortKey]
      let bv: any = (b as any)[sortKey]
      if (sortKey === "displayScore") { av = av ?? -1; bv = bv ?? -1 }
      else { av = (av ?? "").toString().toLowerCase(); bv = (bv ?? "").toString().toLowerCase() }
      if (av < bv) return sortDir === "asc" ? -1 : 1
      if (av > bv) return sortDir === "asc" ? 1 : -1
      return 0
    })
    return copy
  }, [rows, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(key); setSortDir(key === "displayScore" ? "desc" : "asc") }
  }

  function startEdit(id: string, field: string, current: any) {
    setEditing({ id, field })
    setDraft(current == null ? "" : String(current))
  }
  function commitEdit() {
    if (!editing) return
    const { id, field } = editing
    let value: any = draft
    if (field === "displayScore") {
      value = draft.trim() === "" ? null : Number(draft)
      if (value != null && Number.isNaN(value)) value = null
    }
    onEdit(id, { [field]: value })
    setEditing(null)
    setDraft("")
  }

  const allIds = sorted.map((r) => r.id)
  const allChecked = allIds.length > 0 && allIds.every((id) => selected.has(id))

  function EditableCell({ row, field, value, mono }: { row: CrmRow; field: string; value: any; mono?: boolean }) {
    const isEditing = editing?.id === row.id && editing.field === field
    if (isEditing) {
      return (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commitEdit() }
            if (e.key === "Escape") { setEditing(null); setDraft("") }
          }}
          className="w-full px-1 py-0.5 text-xs border border-blue-400 rounded bg-background focus:outline-none"
        />
      )
    }
    return (
      <div
        onClick={() => startEdit(row.id, field, value)}
        className={`px-1 py-0.5 min-h-[20px] cursor-text truncate ${mono ? "font-mono" : ""} ${value == null || value === "" ? "text-muted-foreground/40" : ""}`}
        title={value == null ? "" : String(value)}
      >
        {value == null || value === "" ? "—" : String(value)}
      </div>
    )
  }

  return (
    <div className="overflow-auto border border-foreground/15 rounded-md">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10">
          <tr className="bg-foreground/[0.04] border-b border-foreground/15">
            <th className="w-8 px-2 py-2 border-r border-foreground/10">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={() => onToggleSelectAll(allIds)}
                aria-label="select all"
              />
            </th>
            {COLUMNS.map((c, i) => (
              <th
                key={i}
                className={`text-left font-mono uppercase tracking-wider text-[10px] text-muted-foreground px-2 py-2 border-r border-foreground/10 ${c.w ?? ""} ${c.sortable ? "cursor-pointer select-none hover:text-foreground" : ""}`}
                onClick={() => c.sortable && c.key && toggleSort(c.key as SortKey)}
              >
                <span className="inline-flex items-center gap-1">
                  {c.label}
                  {c.sortable && c.key === sortKey && (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                  {c.sortable && c.key !== sortKey && <ChevronsUpDown className="w-3 h-3 opacity-30" />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS.length + 1} className="text-center text-muted-foreground py-12">
                No investors in this CRM yet.
              </td>
            </tr>
          ) : sorted.map((row, idx) => (
            <tr
              key={row.id}
              className={`border-b border-foreground/[0.06] hover:bg-foreground/[0.03] ${idx % 2 ? "bg-foreground/[0.015]" : ""} ${selected.has(row.id) ? "bg-blue-50/60 dark:bg-blue-950/20" : ""}`}
            >
              <td className="px-2 py-1 border-r border-foreground/[0.06] align-top">
                <input type="checkbox" checked={selected.has(row.id)} onChange={() => onToggleSelect(row.id)} />
              </td>
              <td className="px-1 py-1 border-r border-foreground/[0.06] align-top font-medium"><EditableCell row={row} field="displayName" value={row.displayName} /></td>
              <td className="px-1 py-1 border-r border-foreground/[0.06] align-top"><EditableCell row={row} field="displayTitle" value={row.displayTitle} /></td>
              <td className="px-1 py-1 border-r border-foreground/[0.06] align-top"><EditableCell row={row} field="displayType" value={row.displayType} /></td>
              <td className="px-1 py-1 border-r border-foreground/[0.06] align-top"><EditableCell row={row} field="displayLocation" value={row.displayLocation} /></td>
              <td className="px-1 py-1 border-r border-foreground/[0.06] align-top"><EditableCell row={row} field="displayEmail" value={row.displayEmail} mono /></td>
              <td className="px-1 py-1 border-r border-foreground/[0.06] align-top text-center">
                {row.displayLinkedin ? (
                  <a href={row.displayLinkedin} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-blue-600 hover:text-blue-800">
                    <Linkedin className="w-3.5 h-3.5" /><ExternalLink className="w-2.5 h-2.5" />
                  </a>
                ) : <span className="text-muted-foreground/40">—</span>}
              </td>
              <td className="px-1 py-1 border-r border-foreground/[0.06] align-top font-mono text-center"><EditableCell row={row} field="displayScore" value={row.displayScore} mono /></td>
              <td className="px-1 py-1 border-r border-foreground/[0.06] align-top font-mono text-center"><EditableCell row={row} field="displayTier" value={row.displayTier} mono /></td>
              <td className="px-1 py-1 border-r border-foreground/[0.06] align-top">
                <select
                  value={row.stage}
                  onChange={(e) => onEdit(row.id, { stage: e.target.value })}
                  className={`w-full text-[11px] rounded px-1 py-0.5 border-0 font-mono ${STAGE_COLOR[row.stage] ?? "bg-foreground/5"}`}
                >
                  {GRID_STAGES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                </select>
              </td>
              <td className="px-1 py-1 border-r border-foreground/[0.06] align-top">
                <select
                  value={row.boardId ?? ""}
                  onChange={(e) => onEdit(row.id, { boardId: e.target.value })}
                  className="w-full text-[11px] rounded px-1 py-0.5 border border-foreground/10 bg-background"
                >
                  {!row.boardId && <option value="">—</option>}
                  {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </td>
              <td className="px-1 py-1 border-r border-foreground/[0.06] align-top max-w-[260px]"><EditableCell row={row} field="whyMatch" value={row.whyMatch} /></td>
              <td className="px-1 py-1 border-r border-foreground/[0.06] align-top max-w-[220px]"><EditableCell row={row} field="notes" value={row.notes} /></td>
              <td className="px-1 py-1 align-top">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onOpenStudio(row)}
                    title="Open outreach studio"
                    className="inline-flex items-center gap-1 px-1.5 py-1 rounded border border-foreground/15 hover:bg-foreground/5 text-[10px]"
                  >
                    <Sparkles className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => onDelete(row.id)}
                    title="Remove from CRM"
                    className="inline-flex items-center px-1.5 py-1 rounded text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
