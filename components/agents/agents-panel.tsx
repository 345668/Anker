"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

interface Agent { id: string; title: string; summary: string; schedule: string; guarantees: string[]; enabled: boolean }
interface Exec { id: string; agent_id: string; trigger: string; mode: string; status: string; plan: Array<{ id: string; label: string }>; output: any; error: string | null; created_at: string }
interface Data { agents: Agent[]; executions: Exec[]; canRun: boolean; canManage: boolean }

const WHEN = (s: string) => (s.startsWith("weekly") ? `Every ${({ mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" } as any)[s.slice(7, 10)]}` : "Every day") + ` at ${s.slice(-2)}:00 UTC`
const STATUS: Record<string, string> = { queued: "Waiting to run", running: "Running", succeeded: "Done", failed: "Failed", killed: "Stopped", budget_stopped: "Stopped (budget)" }

export function AgentsPanel() {
  const [data, setData] = useState<Data | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const load = useCallback(async () => { const r = await fetch("/api/agents", { cache: "no-store" }); setData(r.ok ? await r.json() : null) }, [])
  useEffect(() => { void load() }, [load])

  async function toggle(a: Agent) {
    setBusy(a.id); setNote(null)
    const r = await fetch("/api/agents/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ agentId: a.id, enabled: !a.enabled }) })
    if (!r.ok) setNote((await r.json().catch(() => ({}))).error ?? "Could not change this.")
    setBusy(null); await load()
  }
  async function run(a: Agent, mode: "live" | "dry_run") {
    setBusy(a.id + mode); setNote(null)
    const r = await fetch("/api/agents/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agentId: a.id, mode }) })
    const j = await r.json().catch(() => ({}))
    setNote(r.ok ? (j.execution?.output?.summary ?? STATUS[j.execution?.status] ?? "Started.") + (j.execution?.error ? ` ${j.execution.error}` : "") : j.error ?? "Could not run.")
    setBusy(null); await load()
  }

  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>
  const name = (id: string) => data.agents.find((a) => a.id === id)?.title ?? id
  return (
    <div>
      {note && <p className="mb-4 rounded-md border border-foreground/10 bg-foreground/5 px-3 py-2 text-sm" role="status">{note}</p>}
      {data.agents.map((a) => (
        <section key={a.id} className="mb-4 rounded-lg border border-foreground/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 max-w-xl">
              <h2 className="text-base font-medium">{a.title} <span className="ml-2 text-xs font-normal text-muted-foreground">{WHEN(a.schedule)}</span></h2>
              <p className="mt-1 text-sm text-muted-foreground">{a.summary}</p>
              <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">{a.guarantees.map((g) => <li key={g}>{g}</li>)}</ul>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2 text-sm">
              {data.canManage && (
                <label className="flex items-center gap-2"><input type="checkbox" checked={a.enabled} disabled={busy === a.id} onChange={() => toggle(a)} />{a.enabled ? "On" : "Off"}</label>
              )}
              {data.canRun && (
                <span className="flex gap-2">
                  <button disabled={!!busy} onClick={() => run(a, "dry_run")} className="rounded-md border border-foreground/15 px-3 py-1 disabled:opacity-50">Dry run</button>
                  <button disabled={!!busy} onClick={() => run(a, "live")} className="rounded-md bg-foreground px-3 py-1 text-background disabled:opacity-50">Run now</button>
                </span>
              )}
            </div>
          </div>
        </section>
      ))}
      <h2 className="mt-8 mb-3 text-sm font-medium">Recent runs</h2>
      {data.executions.length === 0 ? <p className="text-sm text-muted-foreground">No runs yet. Try a dry run: it shows what an agent would do and changes nothing.</p> : (
        <ul className="divide-y divide-foreground/10 rounded-lg border border-foreground/10">
          {data.executions.map((e) => (
            <li key={e.id} className="px-4 py-3 text-sm">
              <p className="font-medium">{name(e.agent_id)} <span className="font-normal text-muted-foreground">· {STATUS[e.status] ?? e.status}{e.mode === "dry_run" ? " · dry run" : ""} · {e.trigger === "schedule" ? "scheduled" : "by hand"} · {new Date(e.created_at).toLocaleString()}</span></p>
              {e.output?.lines ? <ul className="mt-1 list-disc pl-5 text-muted-foreground">{e.output.lines.map((l: string) => <li key={l}>{l}</li>)}</ul>
                : e.output?.summary ? <p className="mt-1 text-muted-foreground">{e.output.summary}{e.mode === "live" && e.output.proposals?.length ? <> <Link href="/dashboard/actions" className="underline">Review in Actions</Link></> : null}</p> : null}
              {e.mode === "dry_run" && e.output?.proposals?.map((p: string) => <p key={p} className="mt-1 text-xs text-muted-foreground">Would propose: {p}</p>)}
              {e.error && <p className="mt-1 text-xs text-muted-foreground">{e.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
