"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

interface P { id: string; summary: string; diff: Array<{ label: string; before: string | null; after: string | null }>; risk_class: string; run_id: string | null; agent_id: string | null; source_trust: string
  status: string; created_at: string; decided_at: string | null; auto_committed: boolean; failure: string | null }
interface Data { proposals: P[]; autonomy: Record<string, boolean>; canDecide: boolean; canSetAutonomy: boolean }

const AGENT_NAMES: Record<string, string> = { pipeline_keeper: "Pipeline keeper", weekly_brief: "Weekly brief", reply_keeper: "Reply keeper" }
const STATUS: Record<string, string> = { applied: "Applied", rejected: "Rejected", undone: "Undone", expired: "Expired", failed: "Failed", pending: "Waiting" }

export function ActionsInbox() {
  const [tab, setTab] = useState<"pending" | "history">("pending")
  const [data, setData] = useState<Data | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const load = useCallback(async () => {
    const r = await fetch(`/api/actions?tab=${tab}`, { cache: "no-store" })
    setData(r.ok ? await r.json() : null)
  }, [tab])
  useEffect(() => { void load() }, [load])

  async function decide(id: string, decision: string) {
    setBusy(id); setNote(null)
    const r = await fetch(`/api/actions/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) })
    const j = await r.json().catch(() => ({}))
    setNote(j.message ?? j.error ?? null); setBusy(null); await load()
  }
  async function bulk(ids: string[], decision: string, key: string) {
    setBusy(key); setNote(null)
    const r = await fetch("/api/actions/bulk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids, decision }) })
    const j = await r.json().catch(() => ({}))
    const ok = (j.results ?? []).filter((x: any) => x.ok).length
    setNote(j.results ? `${ok} of ${ids.length} ${decision === "approve" ? "applied" : "rejected"}.` : j.error ?? null); setBusy(null); await load()
  }
  async function setAuto(on: boolean) {
    setBusy("auto")
    const r = await fetch("/api/actions/autonomy", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ riskClass: "R0", autoCommit: on }) })
    if (!r.ok) setNote((await r.json().catch(() => ({}))).error ?? "Could not change this.")
    setBusy(null); await load()
  }

  const groups = useMemo(() => {
    const m = new Map<string, P[]>()
    for (const p of data?.proposals ?? []) { const k = p.run_id ?? p.id; m.set(k, [...(m.get(k) ?? []), p]) }
    return [...m.entries()]
  }, [data])

  return (
    <div>
      <div className="mb-4 flex gap-2 text-sm" role="tablist">
        {(["pending", "history"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 ${tab === t ? "bg-foreground text-background" : "border border-foreground/15 text-muted-foreground hover:text-foreground"}`}>{t === "pending" ? "Waiting for you" : "History"}</button>
        ))}
      </div>
      {note && <p className="mb-4 rounded-md border border-foreground/10 bg-foreground/5 px-3 py-2 text-sm" role="status">{note}</p>}
      {!data ? <p className="text-sm text-muted-foreground">Loading…</p> : groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-foreground/15 p-8 text-center text-sm text-muted-foreground">{tab === "pending" ? "Nothing is waiting. Ask the assistant to move contacts or add follow-ups and the proposal will appear here." : "No decided actions yet."}</p>
      ) : groups.map(([key, items]) => (
        <section key={key} className="mb-5 rounded-lg border border-foreground/10">
          {tab === "pending" && items.length > 1 && data.canDecide && (
            <div className="flex items-center justify-between border-b border-foreground/10 px-4 py-2 text-sm">
              <span className="text-muted-foreground">{items.length} changes from one request</span>
              <span className="flex gap-2">
                <button disabled={busy === key} onClick={() => bulk(items.map((i) => i.id), "approve", key)} className="rounded-md bg-foreground px-3 py-1 text-background disabled:opacity-50">Approve all</button>
                <button disabled={busy === key} onClick={() => bulk(items.map((i) => i.id), "reject", key)} className="rounded-md border border-foreground/15 px-3 py-1 disabled:opacity-50">Reject all</button>
              </span>
            </div>
          )}
          <ul className="divide-y divide-foreground/10">
            {items.map((p) => (
              <li key={p.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{p.summary}</p>
                    {p.diff.map((d, i) => (
                      <p key={i} className="mt-1 text-xs text-muted-foreground">{d.label}: {d.before != null && <><s>{d.before}</s> → </>}<span className="text-foreground">{d.after}</span></p>
                    ))}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p.agent_id && `Proposed by ${AGENT_NAMES[p.agent_id] ?? p.agent_id} · `}{p.risk_class === "R0" ? "Low risk · reversible" : p.risk_class}
                      {p.source_trust === "untrusted" && " · made after reading outside content, so it always needs your approval"}
                      {tab === "history" && ` · ${STATUS[p.status] ?? p.status}${p.auto_committed ? " automatically" : ""}`}
                      {p.failure && ` · ${p.failure}`}
                    </p>
                  </div>
                  {data.canDecide && (
                    <div className="flex shrink-0 gap-2 text-sm">
                      {p.status === "pending" && <>
                        <button disabled={busy === p.id} onClick={() => decide(p.id, "approve")} className="rounded-md bg-foreground px-3 py-1 text-background disabled:opacity-50">Approve</button>
                        <button disabled={busy === p.id} onClick={() => decide(p.id, "reject")} className="rounded-md border border-foreground/15 px-3 py-1 disabled:opacity-50">Reject</button>
                      </>}
                      {p.status === "applied" && <button disabled={busy === p.id} onClick={() => decide(p.id, "undo")} className="rounded-md border border-foreground/15 px-3 py-1 disabled:opacity-50">Undo</button>}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {data?.canSetAutonomy && (
        <div className="mt-8 rounded-lg border border-foreground/10 p-4 text-sm">
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1" checked={!!data.autonomy.R0} disabled={busy === "auto"} onChange={(e) => setAuto(e.target.checked)} />
            <span><span className="font-medium">Apply low-risk changes without asking</span><br />
              <span className="text-muted-foreground">Stage moves and follow-up tasks are applied straight away and still appear in History, where you can undo them. Anything after the assistant has read a web page, an upload or an inbound reply still waits for you, and anything that contacts someone else always does.</span></span>
          </label>
        </div>
      )}
    </div>
  )
}
