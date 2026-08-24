"use client"

import { useMemo, useState } from "react"
import { Check, X, Loader2, UserPlus, MessageSquare, Pencil, Inbox } from "lucide-react"
import type { LiAction, ActionType } from "@/lib/linkedin/types"

const ACTION_META: Record<string, { label: string; icon: typeof UserPlus }> = {
  connect_request: { label: "Connect", icon: UserPlus },
  message: { label: "Message", icon: MessageSquare },
  follow_up: { label: "Follow-up", icon: MessageSquare },
  view_profile: { label: "View", icon: UserPlus },
  withdraw: { label: "Withdraw", icon: X },
}

const STATUS_CLS: Record<string, string> = {
  queued: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  claimed: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  done: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400",
  rejected: "bg-muted text-muted-foreground",
  skipped: "bg-muted text-muted-foreground",
}

const msgOf = (a: LiAction) => (typeof a.payload?.message === "string" ? (a.payload.message as string) : "")

export function ReviewQueueClient({
  initialPending,
  initialRecent,
  counts,
  senders,
}: {
  initialPending: LiAction[]
  initialRecent: LiAction[]
  counts: Record<string, number>
  senders: { id: string; displayName: string }[]
}) {
  const [pending, setPending] = useState<LiAction[]>(initialPending)
  const [recent, setRecent] = useState<LiAction[]>(initialRecent)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const senderName = useMemo(() => {
    const m = new Map(senders.map((s) => [s.id, s.displayName]))
    return (id: string | null) => (id ? m.get(id) ?? "—" : "—")
  }, [senders])

  const allSelected = pending.length > 0 && selected.size === pending.length
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(pending.map((a) => a.id)))

  async function decide(ids: string[], decision: "approve" | "reject", editedMessage?: string) {
    if (!ids.length) return
    setBusy(true)
    try {
      // Per-action edited message only applies to single-action approvals.
      const body: Record<string, unknown> = { ids, decision }
      if (editedMessage !== undefined && ids.length === 1) body.editedMessage = editedMessage
      const res = await fetch("/api/linkedin/actions/decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (d.ok) {
        const moved = pending.filter((a) => ids.includes(a.id))
        setPending((p) => p.filter((a) => !ids.includes(a.id)))
        setSelected(new Set())
        setEditing(null)
        // Optimistically reflect the transition at the top of Recent.
        const newStatus = decision === "approve" ? "queued" : "rejected"
        setRecent((r) => [
          ...moved.map((a) => ({
            ...a,
            status: newStatus as LiAction["status"],
            payload: editedMessage !== undefined && ids.length === 1 ? { ...a.payload, message: editedMessage } : a.payload,
          })),
          ...r,
        ])
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Pending approvals */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Pending approval <span className="ml-1 text-muted-foreground">({pending.length})</span>
          </h2>
          {pending.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} /> Select all
              </label>
              <button
                disabled={busy || selected.size === 0}
                onClick={() => decide([...selected], "reject")}
                className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs disabled:opacity-40"
              >
                <X className="h-3.5 w-3.5" /> Reject
              </button>
              <button
                disabled={busy || selected.size === 0}
                onClick={() => decide([...selected], "approve")}
                className="inline-flex items-center gap-1 rounded-md bg-[#0a66c2] px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Approve {selected.size > 0 ? `(${selected.size})` : ""}
              </button>
            </div>
          )}
        </div>

        {pending.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <Inbox className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-medium">Nothing waiting for approval</p>
            <p className="mt-1 text-sm text-muted-foreground">Actions queued by a campaign will appear here for your sign-off before they send.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pending.map((a) => {
              const meta = ACTION_META[a.actionType] ?? ACTION_META.connect_request
              const Icon = meta.icon
              const message = editing === a.id ? (edits[a.id] ?? msgOf(a)) : msgOf(a)
              return (
                <div key={a.id} className="rounded-lg border bg-card p-3">
                  <div className="flex items-start gap-3">
                    <input type="checkbox" className="mt-1.5" checked={selected.has(a.id)} onChange={() => toggle(a.id)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded bg-[#0a66c2]/10 px-1.5 py-0.5 text-[11px] font-medium text-[#0a66c2]">
                          <Icon className="h-3 w-3" /> {meta.label}
                        </span>
                        <a href={a.targetUrl} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline">
                          {a.targetName || a.targetUrl.replace(/^https?:\/\/(www\.)?/, "")}
                        </a>
                        <span className="text-xs text-muted-foreground">· as {senderName(a.senderId)}</span>
                      </div>

                      {(msgOf(a) || editing === a.id) && (
                        <div className="mt-2">
                          {editing === a.id ? (
                            <textarea
                              className="w-full rounded-md border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-[#0a66c2]/30"
                              rows={3}
                              value={message}
                              onChange={(e) => setEdits((m) => ({ ...m, [a.id]: e.target.value }))}
                            />
                          ) : (
                            <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-sm text-foreground/80">{message}</p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {msgOf(a) !== "" && (
                        <button
                          title={editing === a.id ? "Done editing" : "Edit message"}
                          onClick={() => setEditing((e) => (e === a.id ? null : a.id))}
                          className="rounded p-1.5 hover:bg-muted"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      <button title="Reject" onClick={() => decide([a.id], "reject")} disabled={busy}
                        className="rounded p-1.5 text-red-600 hover:bg-muted disabled:opacity-40">
                        <X className="h-4 w-4" />
                      </button>
                      <button title="Approve" onClick={() => decide([a.id], "approve", editing === a.id ? message : undefined)} disabled={busy}
                        className="rounded p-1.5 text-emerald-600 hover:bg-muted disabled:opacity-40">
                        <Check className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Recent activity */}
      <section>
        <h2 className="mb-3 text-sm font-semibold">Recent</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No actions yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Target</th>
                  <th className="px-3 py-2 font-medium">Sender</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((a) => {
                  const meta = ACTION_META[a.actionType] ?? ACTION_META.connect_request
                  return (
                    <tr key={a.id} className="border-t">
                      <td className="px-3 py-2">{meta.label}</td>
                      <td className="px-3 py-2 max-w-[240px] truncate">
                        <a href={a.targetUrl} target="_blank" rel="noreferrer" className="hover:underline">
                          {a.targetName || a.targetUrl.replace(/^https?:\/\/(www\.)?/, "")}
                        </a>
                        {a.status === "failed" && a.failedReason && (
                          <span className="ml-1 text-xs text-red-600">· {a.failedReason}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{senderName(a.senderId)}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLS[a.status] ?? "bg-muted text-muted-foreground"}`}>
                          {a.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
