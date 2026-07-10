"use client"

/**
 * ContactDetail — the right-hand pane of the CRM powerhouse.
 *
 * Everything about ONE relationship in one place: identity + inline stage/
 * tier/score editors, tags, why-match, research, editable notes, tasks
 * (add / complete / delete), and the activity timeline (outreach messages +
 * tasks merged server-side). Outreach itself lives on /dashboard/outreach —
 * the pane deep-links into it with the contact preselected.
 */

import { useEffect, useState } from "react"
import useSWR from "swr"
import {
  X, ExternalLink, Mail, Linkedin, Plus, Check, Trash2, Loader2,
  Send, Clock, CalendarClock, StickyNote,
} from "lucide-react"
import type { CrmRow } from "@/components/tesseract/crm-grid"

const STAGES = ["queued", "contacted", "responded", "meeting", "in_diligence", "committed", "passed"]
const TIERS = ["A", "B", "C"]

const fetcher = (u: string) => fetch(u).then((r) => r.json())

interface Task {
  id: string
  crm_entry_id: string | null
  title: string
  due_at: string | null
  done_at: string | null
  notes: string | null
}

interface TimelineItem {
  kind: "outreach" | "task"
  at: string
  title: string
  detail: string | null
  meta: Record<string, unknown>
}

interface Props {
  row: CrmRow
  onPatch: (id: string, patch: Record<string, unknown>) => void
  onDelete: (id: string) => void
  onClose?: () => void
  /** Render as overlay drawer (grid/kanban modes) instead of static pane. */
  overlay?: boolean
}

const ago = (iso: string | null): string => {
  if (!iso) return "never"
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d}d ago`
}

export function ContactDetail({ row, onPatch, onDelete, onClose, overlay }: Props) {
  const [notes, setNotes] = useState(row.notes ?? "")
  const [notesDirty, setNotesDirty] = useState(false)
  const [tagInput, setTagInput] = useState("")
  const [taskTitle, setTaskTitle] = useState("")
  const [taskDue, setTaskDue] = useState("")
  const [savingTask, setSavingTask] = useState(false)

  useEffect(() => { setNotes(row.notes ?? ""); setNotesDirty(false) }, [row.id, row.notes])

  const { data: taskData, mutate: mutateTasks } = useSWR<{ tasks: Task[] }>(
    `/api/crm/tasks?entryId=${encodeURIComponent(row.id)}`, fetcher)
  const { data: timeline, mutate: mutateTimeline } = useSWR<{ items: TimelineItem[] }>(
    `/api/crm/entries/${encodeURIComponent(row.id)}/timeline`, fetcher)

  const tasks = taskData?.tasks ?? []
  const openTasks = tasks.filter((t) => !t.done_at)
  const tags: string[] = Array.isArray((row as any).tags) ? (row as any).tags : []

  async function addTask() {
    const title = taskTitle.trim()
    if (!title) return
    setSavingTask(true)
    try {
      await fetch("/api/crm/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: row.id, title, dueAt: taskDue || null }),
      })
      setTaskTitle(""); setTaskDue("")
      mutateTasks(); mutateTimeline()
    } finally { setSavingTask(false) }
  }

  async function toggleTask(t: Task) {
    await fetch(`/api/crm/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !t.done_at }),
    })
    mutateTasks(); mutateTimeline()
  }

  async function removeTask(t: Task) {
    await fetch(`/api/crm/tasks/${t.id}`, { method: "DELETE" })
    mutateTasks(); mutateTimeline()
  }

  function addTag() {
    const t = tagInput.trim()
    if (!t || tags.includes(t)) { setTagInput(""); return }
    setTagInput("")
    bulkTags([...tags, t])
  }

  function removeTag(t: string) { bulkTags(tags.filter((x) => x !== t)) }

  async function bulkTags(next: string[]) {
    onPatch(row.id, { tags: next } as any) // optimistic local
    await fetch("/api/crm/entries/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [row.id], set: { addTags: next, removeTags: tags.filter((t) => !next.includes(t)) } }),
    })
  }

  const lbl = "font-mono text-[9px] uppercase tracking-wider text-muted-foreground"
  const sel = "h-8 px-2 rounded-md border border-input bg-background text-xs"

  return (
    <div className={
      overlay
        ? "fixed inset-y-0 right-0 w-[420px] max-w-[92vw] z-40 bg-background border-l border-foreground/10 shadow-2xl overflow-y-auto"
        : "h-full overflow-y-auto"
    }>
      {/* Identity */}
      <div className="p-5 border-b border-foreground/10 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-display text-xl leading-tight truncate">{row.displayName}</h2>
            <p className="text-sm text-muted-foreground truncate">
              {[row.displayTitle, row.displayType, row.displayLocation].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-foreground/5 text-muted-foreground shrink-0" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <select value={row.stage} onChange={(e) => onPatch(row.id, { stage: e.target.value })} className={sel}>
            {STAGES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
          <select value={row.displayTier ?? ""} onChange={(e) => onPatch(row.id, { displayTier: e.target.value || null })} className={sel}>
            <option value="">tier —</option>
            {TIERS.map((t) => <option key={t} value={t}>tier {t}</option>)}
          </select>
          {row.displayScore != null && (
            <span className="font-mono text-xs px-2 py-1 rounded-full border border-foreground/15">{row.displayScore}</span>
          )}
          <span className="font-mono text-[10px] text-muted-foreground ml-auto">
            last contact {ago(row.lastContactedAt)}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <a href={`/dashboard/outreach/studio?entry=${encodeURIComponent(row.id)}`}
            className="inline-flex items-center gap-2 rounded-full h-9 px-4 bg-foreground text-background hover:bg-foreground/90 text-sm">
            <Send className="w-3.5 h-3.5" />
            Draft outreach
          </a>
          {row.displayEmail && (
            <a href={`mailto:${row.displayEmail}`} className="p-2 rounded-full border border-foreground/15 hover:bg-foreground/5" title={row.displayEmail}>
              <Mail className="w-4 h-4" />
            </a>
          )}
          {row.displayLinkedin && (
            <a href={row.displayLinkedin.startsWith("http") ? row.displayLinkedin : `https://${row.displayLinkedin}`}
              target="_blank" rel="noreferrer" className="p-2 rounded-full border border-foreground/15 hover:bg-foreground/5" title="LinkedIn">
              <Linkedin className="w-4 h-4" />
            </a>
          )}
          <button onClick={() => onDelete(row.id)}
            className="ml-auto p-2 rounded-full border border-foreground/15 hover:border-destructive/40 hover:text-destructive text-muted-foreground" title="Remove from CRM">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-5 space-y-6">
        {/* Tags */}
        <section>
          <h3 className={lbl}>Tags</h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5 items-center">
            {tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-foreground/5">
                {t}
                <button onClick={() => removeTag(t)} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
              </span>
            ))}
            <input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTag()}
              placeholder="+ tag" className="h-6 w-20 px-1.5 text-[11px] font-mono bg-transparent border-b border-foreground/15 focus:border-foreground/40 outline-none" />
          </div>
        </section>

        {/* Why match + research */}
        {row.whyMatch && (
          <section>
            <h3 className={lbl}>Why matched</h3>
            <p className="mt-1.5 text-sm leading-relaxed">{row.whyMatch}</p>
          </section>
        )}
        {row.researchSummary && (
          <section>
            <h3 className={lbl}>Research</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground whitespace-pre-line">{row.researchSummary}</p>
            {row.researchUrl && (
              <a href={row.researchUrl} target="_blank" rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground">
                <ExternalLink className="w-3 h-3" /> source
              </a>
            )}
          </section>
        )}

        {/* Notes */}
        <section>
          <h3 className={`${lbl} flex items-center gap-1.5`}><StickyNote className="w-3 h-3" /> Notes</h3>
          <textarea value={notes} rows={4}
            onChange={(e) => { setNotes(e.target.value); setNotesDirty(true) }}
            className="mt-1.5 w-full p-2.5 rounded-md border border-input bg-background text-sm"
            placeholder="Private notes on this relationship…" />
          {notesDirty && (
            <button onClick={() => { onPatch(row.id, { notes }); setNotesDirty(false) }}
              className="mt-1 inline-flex items-center gap-1.5 rounded-full h-7 px-3 bg-foreground text-background text-xs">
              <Check className="w-3 h-3" /> Save notes
            </button>
          )}
        </section>

        {/* Tasks */}
        <section>
          <h3 className={`${lbl} flex items-center gap-1.5`}><CalendarClock className="w-3 h-3" /> Follow-ups</h3>
          <div className="mt-2 space-y-1.5">
            {openTasks.map((t) => {
              const overdue = t.due_at && new Date(t.due_at).getTime() < Date.now()
              return (
                <div key={t.id} className="flex items-center gap-2 text-sm group">
                  <button onClick={() => toggleTask(t)}
                    className="w-4 h-4 rounded border border-foreground/30 hover:border-foreground flex items-center justify-center shrink-0"
                    aria-label="Complete task" />
                  <span className="flex-1 truncate">{t.title}</span>
                  {t.due_at && (
                    <span className={`font-mono text-[10px] ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
                      {new Date(t.due_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  )}
                  <button onClick={() => removeTask(t)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
            {!openTasks.length && <p className="text-xs text-muted-foreground">No open follow-ups.</p>}
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTask()}
              placeholder="Follow up on…" className="flex-1 h-8 px-2.5 rounded-md border border-input bg-background text-xs" />
            <input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)}
              className="h-8 px-2 rounded-md border border-input bg-background text-xs w-[120px]" />
            <button onClick={addTask} disabled={savingTask || !taskTitle.trim()}
              className="h-8 w-8 rounded-full bg-foreground text-background flex items-center justify-center disabled:opacity-40">
              {savingTask ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            </button>
          </div>
        </section>

        {/* Timeline */}
        <section>
          <h3 className={`${lbl} flex items-center gap-1.5`}><Clock className="w-3 h-3" /> Activity</h3>
          <div className="mt-2 space-y-0">
            {(timeline?.items ?? []).map((it, i) => (
              <div key={i} className="relative pl-5 pb-4 border-l border-foreground/10 last:border-transparent last:pb-0 ml-1.5">
                <span className={`absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full border-2 border-background ${
                  it.kind === "outreach" ? "bg-foreground" : "bg-emerald-600"}`} />
                <div className="text-sm leading-tight">{it.title}</div>
                {it.detail && <div className="text-xs text-muted-foreground truncate">{it.detail}</div>}
                <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                  {new Date(it.at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                  {it.kind === "outreach" && typeof it.meta.opens === "number" && it.meta.opens > 0 ? ` · ${it.meta.opens} opens` : ""}
                </div>
              </div>
            ))}
            {timeline && !timeline.items?.length && (
              <p className="text-xs text-muted-foreground">No activity yet — added {ago(row.addedAt)}.</p>
            )}
            {!timeline && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
        </section>
      </div>
    </div>
  )
}
