"use client"

import { requestJson, errorMessage } from "@/lib/http/client"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { CheckSquare, Download, Circle, ArrowRight, FileText, Bell, Check } from "lucide-react"

type Task = { id: string; title: string; entity_label: string | null; stage: string; due_date: string | null }
type Doc = { id: string; title: string | null; type: string | null; created_at: string | null }
type Notif = { id: string; kind: string; severity: "info" | "warning" | "urgent"; title: string; body: string | null; href: string | null; read_at: string | null; created_at: string }

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
      <NotificationsTray />
      <TasksTray />
      <DownloadsTray />
    </div>
  )
}

function relTime(s: string): string {
  const d = new Date(s).getTime()
  if (Number.isNaN(d)) return ""
  const mins = Math.floor((Date.now() - d) / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return days < 30 ? `${days}d ago` : new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

const SEV_DOT: Record<string, string> = {
  urgent: "bg-[#e5380f]",
  warning: "bg-amber-500",
  info: "bg-sky-500",
}

function NotificationsTray() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notif[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [unread, setUnread] = useState(0)
  const ref = useDismiss(() => setOpen(false))

  async function load() {
    try {
      const d = await requestJson("/api/notifications?limit=20")
      setItems(d.notifications ?? [])
      setUnread(d.unread ?? 0)
    } catch (e) { setError(errorMessage(e)) } finally { setLoaded(true) }
  }

  useEffect(() => { load() }, [])

  async function markOne(n: Notif) {
    if (n.read_at || pending) return
    setPending(true); setError(null)
    try {
      await requestJson("/api/notifications/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: n.id }) })
      await load()
    } catch (e) { setError(errorMessage(e)) } finally { setPending(false) }
  }

  async function markAll() {
    if (pending) return
    setPending(true); setError(null)
    try {
      await requestJson("/api/notifications/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ all: true }) })
      await load()
    } catch (e) { setError(errorMessage(e)) } finally { setPending(false) }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
        aria-expanded={open} aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="ml-0.5 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-[#e5380f] text-white text-xs font-medium tabular-nums">{unread > 99 ? "99+" : unread}</span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-4 top-32 w-auto md:absolute md:inset-x-auto md:right-0 md:top-full md:mt-1.5 md:w-96 z-50 rounded-lg border border-foreground/15 bg-popover shadow-xl overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-foreground/10 flex items-center justify-between">
            <span className="text-sm font-medium">Notifications</span>
            {unread > 0 && (
              <button disabled={pending} onClick={markAll} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <Check className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {error && <p role="alert" className="p-3 text-sm text-destructive">{error} <button onClick={load} className="underline">Retry loading</button></p>}
            {!loaded ? (
              <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">Loading…</p>
            ) : error && items.length === 0 ? null : items.length === 0 ? (
              <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">You're all caught up.</p>
            ) : items.map((n) => {
              const Inner = (
                <div className={`px-3.5 py-2.5 border-b border-foreground/[0.06] last:border-0 flex items-start gap-2.5 hover:bg-foreground/[0.03] ${n.read_at ? "opacity-60" : ""}`}>
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.read_at ? "bg-foreground/20" : SEV_DOT[n.severity] ?? "bg-sky-500"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{n.title}</div>
                    {n.body && <div className="text-[12px] text-muted-foreground line-clamp-2">{n.body}</div>}
                    <div className="text-xs text-muted-foreground mt-0.5">{relTime(n.created_at)}</div>
                  </div>
                </div>
              )
              return n.href ? (
                <Link key={n.id} href={n.href} onClick={() => { markOne(n); setOpen(false) }} className="block">{Inner}</Link>
              ) : (
                <button key={n.id} onClick={() => markOne(n)} className="block w-full text-left">{Inner}</button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function useDismiss(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && ref.current?.contains(document.activeElement)) { onClose(); ref.current.querySelector<HTMLButtonElement>("button")?.focus() }
    }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey) }
  }, [onClose])
  return ref
}

function TasksTray() {
  const [open, setOpen] = useState(false)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const ref = useDismiss(() => setOpen(false))

  async function load() {
    setError(null)
    try { const d = await requestJson("/api/tasks"); setTasks(d.tasks ?? []) }
    catch (e) { setError(errorMessage(e)) } finally { setLoaded(true) }
  }
  useEffect(() => { load(); window.addEventListener("anker:tasks-changed", load); return () => window.removeEventListener("anker:tasks-changed", load) }, [])
  const openTasks = tasks.filter((t) => t.stage !== "done")
  const count = openTasks.length
  async function complete(id: string) {
    if (pending) return
    setPending(true); setError(null)
    try {
      await requestJson(`/api/tasks/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ stage: "done" }) })
      setTasks((ts) => ts.map((t) => t.id === id ? { ...t, stage: "done" } : t))
      window.dispatchEvent(new Event("anker:tasks-changed"))
    } catch (e) { setError(errorMessage(e)) } finally { setPending(false) }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
        aria-expanded={open} aria-label="Tasks"
      >
        <CheckSquare className="w-4 h-4" />
        <span className="hidden md:inline">Tasks</span>
        {count > 0 && (
          <span className="ml-0.5 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-[#e5380f] text-white text-xs font-medium tabular-nums">{count}</span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-4 top-32 w-auto md:absolute md:inset-x-auto md:right-0 md:top-full md:mt-1.5 md:w-80 z-50 rounded-lg border border-foreground/15 bg-popover shadow-xl overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-foreground/10 flex items-center justify-between">
            <span className="text-sm font-medium">Tasks</span>
            <span className="text-xs text-muted-foreground">{count} open</span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {error && <p role="alert" className="p-3 text-sm text-destructive">{error} <button onClick={load} className="underline">Retry loading</button></p>}
            {!loaded ? (
              <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">Loading…</p>
            ) : error && openTasks.length === 0 ? null : openTasks.length === 0 ? (
              <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">You're all caught up.</p>
            ) : openTasks.slice(0, 8).map((t) => {
              const due = fmtDue(t.due_date, false)
              return (
                <div key={t.id} className="px-3.5 py-2.5 border-b border-foreground/[0.06] last:border-0 flex items-start gap-2.5 hover:bg-foreground/[0.03]">
                  <button disabled={pending} aria-label={`Complete ${t.title}`} onClick={() => complete(t.id)} title="Complete" className="mt-0.5 text-muted-foreground hover:text-emerald-600 shrink-0">
                    <Circle className="w-3.5 h-3.5" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{t.title}</div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
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
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const ref = useDismiss(() => setOpen(false))

  async function load() {
    setError(null)
    try { const d = await requestJson("/api/downloads"); setDocs(d.downloads ?? []) }
    catch (e) { setError(errorMessage(e)) } finally { setLoaded(true) }
  }
  useEffect(() => { load() }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
        aria-expanded={open} aria-label="Downloads"
      >
        <Download className="w-4 h-4" />
        <span className="hidden md:inline">Downloads</span>
      </button>

      {open && (
        <div className="fixed inset-x-4 top-32 w-auto md:absolute md:inset-x-auto md:right-0 md:top-full md:mt-1.5 md:w-80 z-50 rounded-lg border border-foreground/15 bg-popover shadow-xl overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-foreground/10 flex items-center justify-between">
            <span className="text-sm font-medium">Recent documents</span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {error && <p role="alert" className="p-3 text-sm text-destructive">{error} <button onClick={load} className="underline">Retry loading</button></p>}
            {!loaded ? (
              <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">Loading…</p>
            ) : error && docs.length === 0 ? null : docs.length === 0 ? (
              <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">No recent documents.</p>
            ) : docs.slice(0, 10).map((d) => (
              <Link key={d.id} href="/dashboard/documents" onClick={() => setOpen(false)}
                className="px-3.5 py-2.5 border-b border-foreground/[0.06] last:border-0 flex items-center gap-2.5 hover:bg-foreground/[0.03]">
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{d.title || "Untitled"}</div>
                  <div className="text-xs text-muted-foreground">
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
