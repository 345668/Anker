"use client"

import { useState } from "react"
import { Plus, Loader2, Pause, Play, Trash2, Clock, UserRound } from "lucide-react"
import type { LinkedInSender, SenderStatus } from "@/lib/linkedin/types"

const STATUS_META: Record<SenderStatus, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  paused: { label: "Paused", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  restricted: { label: "Restricted", cls: "bg-red-500/15 text-red-600 dark:text-red-400" },
  warming: { label: "Warming", cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
}

const EMPTY = { displayName: "", linkedinUrl: "", dailyConnectCap: 20, dailyMessageCap: 40, workingHoursStart: 8, workingHoursEnd: 18, timezone: "UTC", warmup: true }

const WARMUP_DAYS = 14
/** Warmup progress from a sender's warmupStartedAt (null when not warming). */
function warmupInfo(startedAt: string | null): { day: number; pct: number } | null {
  if (!startedAt) return null
  const day = Math.floor((Date.now() - new Date(startedAt).getTime()) / 86_400_000)
  if (day >= WARMUP_DAYS || day < 0) return null
  const pct = Math.round((0.2 + 0.8 * (day / WARMUP_DAYS)) * 100) // mirrors sending-window ramp
  return { day, pct }
}

export function SendersClient({ initial }: { initial: LinkedInSender[] }) {
  const [senders, setSenders] = useState<LinkedInSender[]>(initial)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ ...EMPTY })

  async function create() {
    if (!form.displayName.trim()) return
    setBusy(true)
    try {
      const res = await fetch("/api/linkedin/senders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (d.sender) {
        setSenders((s) => [...s, d.sender])
        setForm({ ...EMPTY })
        setOpen(false)
      }
    } finally {
      setBusy(false)
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/linkedin/senders/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    const d = await res.json()
    if (d.sender) setSenders((s) => s.map((x) => (x.id === id ? d.sender : x)))
  }

  async function remove(id: string) {
    if (!confirm("Remove this sender? Queued actions for it will lose their sender link.")) return
    const res = await fetch(`/api/linkedin/senders/${id}`, { method: "DELETE" })
    if ((await res.json()).ok) setSenders((s) => s.filter((x) => x.id !== id))
  }

  const toggleStatus = (s: LinkedInSender) =>
    patch(s.id, { status: s.status === "paused" ? "active" : "paused" })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {senders.length} {senders.length === 1 ? "sender" : "senders"}
        </p>
        <button
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#0a66c2] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#08589f]"
        >
          <Plus className="h-4 w-4" /> Add sender
        </button>
      </div>

      {open && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Display name">
              <input className={inputCls} value={form.displayName} placeholder="Jane Doe"
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} />
            </Field>
            <Field label="LinkedIn URL (optional)">
              <input className={inputCls} value={form.linkedinUrl} placeholder="https://linkedin.com/in/…"
                onChange={(e) => setForm((f) => ({ ...f, linkedinUrl: e.target.value }))} />
            </Field>
            <Field label="Daily connect cap">
              <input type="number" min={0} max={100} className={inputCls} value={form.dailyConnectCap}
                onChange={(e) => setForm((f) => ({ ...f, dailyConnectCap: Number(e.target.value) }))} />
            </Field>
            <Field label="Daily message cap">
              <input type="number" min={0} max={200} className={inputCls} value={form.dailyMessageCap}
                onChange={(e) => setForm((f) => ({ ...f, dailyMessageCap: Number(e.target.value) }))} />
            </Field>
            <Field label="Working hours (start)">
              <input type="number" min={0} max={23} className={inputCls} value={form.workingHoursStart}
                onChange={(e) => setForm((f) => ({ ...f, workingHoursStart: Number(e.target.value) }))} />
            </Field>
            <Field label="Working hours (end)">
              <input type="number" min={1} max={24} className={inputCls} value={form.workingHoursEnd}
                onChange={(e) => setForm((f) => ({ ...f, workingHoursEnd: Number(e.target.value) }))} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.warmup} onChange={(e) => setForm((f) => ({ ...f, warmup: e.target.checked }))} />
            <span>Warm up this account <span className="text-muted-foreground">— ramp caps over {WARMUP_DAYS} days (recommended for new accounts)</span></span>
          </label>
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="rounded-md border px-3 py-1.5 text-sm">Cancel</button>
            <button onClick={create} disabled={busy || !form.displayName.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#0a66c2] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create
            </button>
          </div>
        </div>
      )}

      {senders.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <UserRound className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium">No senders yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add the LinkedIn account you want to send outreach as. Install the Anker extension and stay signed in to that account for the engine to execute approved actions.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {senders.map((s) => {
            const meta = STATUS_META[s.status]
            const u = s.usage ?? { connectsToday: 0, messagesToday: 0 }
            return (
              <div key={s.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{s.displayName}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>{meta.label}</span>
                    </div>
                    {s.linkedinUrl && (
                      <a href={s.linkedinUrl} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:underline truncate block">
                        {s.linkedinUrl.replace(/^https?:\/\/(www\.)?/, "")}
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button title={s.status === "paused" ? "Resume" : "Pause"} onClick={() => toggleStatus(s)}
                      className="rounded p-1.5 hover:bg-muted">
                      {s.status === "paused" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                    </button>
                    <button title="Remove" onClick={() => remove(s.id)} className="rounded p-1.5 hover:bg-muted text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <Cap label="Connects" used={u.connectsToday} cap={s.dailyConnectCap} />
                  <Cap label="Messages" used={u.messagesToday} cap={s.dailyMessageCap} />
                </div>

                <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {String(s.workingHoursStart).padStart(2, "0")}:00–{String(s.workingHoursEnd).padStart(2, "0")}:00 · {s.timezone}
                </div>
                {s.status === "warming" && warmupInfo(s.warmupStartedAt) && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-[11px] text-sky-600 dark:text-sky-400">
                      <span>Warming · day {warmupInfo(s.warmupStartedAt)!.day + 1}/{WARMUP_DAYS}</span>
                      <span>~{warmupInfo(s.warmupStartedAt)!.pct}% caps</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-sky-500" style={{ width: `${warmupInfo(s.warmupStartedAt)!.pct}%` }} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const inputCls = "w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#0a66c2]/30"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function Cap({ label, used, cap }: { label: string; used: number; cap: number }) {
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0
  const over = cap > 0 && used >= cap
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label} today</span>
        <span className={over ? "font-medium text-amber-600" : ""}>{used}/{cap}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${over ? "bg-amber-500" : "bg-[#0a66c2]"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
