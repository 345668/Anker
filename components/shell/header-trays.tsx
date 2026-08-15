"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { CheckSquare, Download, Circle, ArrowRight, FileText } from "lucide-react"

type Task = { id: string; title: string; entity_label: string | null; stage: string; due_date: string | null }
type Doc = { id: string; title: string | null; type: string | null; created_at: string | null }

const fmtDue = (s: string | null, done: boolean) => {
  if (!s) return { label: "", overdue: false }
  const d = new Date(s + "T00:00:00"); const t = new Date(); t.setHours(0, 0, 0, 0)
  return { label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), overdue: !done && d < t }
}
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "")

/** Carta-style global header trays: Tasks + Downloads, each a badge + dropdown. */
export function HeaderTrays() {
  return (
    <div className="flex items-center gap-1">
      <TasksTray />
      <DownloadsTray />
    </div>
  )
}

function useDismiss(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [onClose])
  return ref
}

function TasksTray() {
  const [open, setOpen] = useState(false)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loaded, setLoaded] = useState(false)
  const ref = useDismiss(() => setOpen(false))

  useEffect(() => {
    fetch("/api/tasks").then((r) => r.json()).then((d) => setTasks(d.tasks ?? [])).catch(() => {}).finally(() => setLoaded(true))
  }, [])

  const openTasks = tasks.filter((t) => t.stage !== "done")
  const count = openTasks.length

  async function complete(id: string) {
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, stage: "done" } : t)))
    try { await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ stage: "done" }) }) } catch { /* ignore */ }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
        aria-haspopup="menu" aria-expanded={open}
      >
        <CheckSquare className="w-4 h-4" />
        <span className="hidden md:inline">Tasks</span>
        {count > 0 && (
          <span className="ml-0.5 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-[#e5380f] text-white text-[10px] font-medium tabular-nums">{count}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-80 z-50 rounded-lg border border-foreground/15 bg-popover shadow-xl overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-foreground/10 flex items-center justify-between">
            <span className="text-sm font-medium">Tasks</span>
            <span className="text-[11px] text-muted-foreground">{count} open</span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {!loaded ? (
              <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">Loading…</p>
            ) : openTasks.length === 0 ? (
              <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">You're all caught up.</p>
            ) : openTasks.slice(0, 8).map((t) => {
              const due = fmtDue(t.due_date, false)
              return (
                <div key={t.id} className="px-3.5 py-2.5 border-b border-foreground/[0.06] last:border-0 flex items-start gap-2.5 hover:bg-foreground/[0.03]">
                  <button onClick={() => complete(t.id)} title="Complete" className="mt-0.5 text-muted-foreground hover:text-emerald-600 shrink-0">
                    <Circle className="w-3.5 h-3.5" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{t.title}</div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      {t.entity_label && <span className="truncate">{t.entity_label}</span>}
                      {t.entity_label && due.label && <span>·</span>}
                      {due.label && <span className={due.overdue ? "text-rose-600 font-medium" : ""}>{due.overdue ? `${due.label} · overdue` : due.label}</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <Link href="/dashboard" onClick={() => setOpen(false)} className="flex items-center justify-between px-3.5 py-2.5 text-sm text-muted-foreground hover:text-foreground border-t border-foreground/10 bg-foreground/[0.02]">
            View all tasks <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}
    </div>
  )
}

function DownloadsTray() {
  const [open, setOpen] = useState(false)
  const [docs, setDocs] = useState<Doc[]>([])
  const [loaded, setLoaded] = useState(false)
  const ref = useDismiss(() => setOpen(false))

  useEffect(() => {
    fetch("/api/downloads").then((r) => r.json()).then((d) => setDocs(d.downloads ?? [])).catch(() => {}).finally(() => setLoaded(true))
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
        aria-haspopup="menu" aria-expanded={open}
      >
        <Download className="w-4 h-4" />
        <span className="hidden md:inline">Downloads</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-80 z-50 rounded-lg border border-foreground/15 bg-popover shadow-xl overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-foreground/10 flex items-center justify-between">
            <span className="text-sm font-medium">Recent documents</span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {!loaded ? (
              <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">Loading…</p>
            ) : docs.length === 0 ? (
              <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">No recent documents.</p>
            ) : docs.slice(0, 10).map((d) => (
              <Link key={d.id} href="/dashboard/documents" onClick={() => setOpen(false)}
                className="px-3.5 py-2.5 border-b border-foreground/[0.06] last:border-0 flex items-center gap-2.5 hover:bg-foreground/[0.03]">
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{d.title || "Untitled"}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {d.type ? <span className="capitalize">{d.type.replace(/[-_]/g, " ")}</span> : "Document"}
                    {d.created_at && <span> · {fmtDate(d.created_at)}</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <Link href="/dashboard/documents" onClick={() => setOpen(false)} className="flex items-center justify-between px-3.5 py-2.5 text-sm text-muted-foreground hover:text-foreground border-t border-foreground/10 bg-foreground/[0.02]">
            Open documents <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}
    </div>
  )
}
