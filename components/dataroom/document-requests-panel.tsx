"use client"

import { useState } from "react"
import { Inbox, Check, X } from "lucide-react"
import type { DocumentRequest } from "@/lib/portfolio/data-room"

const timeAgo = (s: string) => {
  const m = Math.floor((Date.now() - new Date(s).getTime()) / 60000)
  if (m < 60) return `${Math.max(1, m)}m ago`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}

export function DocumentRequestsPanel({ initial }: { initial: DocumentRequest[] }) {
  const [reqs, setReqs] = useState(initial)
  const open = reqs.filter((r) => r.status === "open")
  if (initial.length === 0) return null

  async function resolve(id: string, status: "fulfilled" | "dismissed") {
    setReqs((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)))
    try { await fetch("/api/dataroom/founder/requests", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }) }) } catch { /* ignore */ }
  }

  return (
    <div className="border border-foreground/10 rounded-xl overflow-hidden mb-6">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-foreground/10">
        <span className="grid place-items-center w-8 h-8 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400"><Inbox className="w-4 h-4" /></span>
        <div className="text-sm font-medium">Document requests</div>
        <span className="text-xs text-muted-foreground">{open.length} open</span>
      </div>
      {open.length === 0 ? (
        <div className="px-5 py-4 text-sm text-muted-foreground">All requests handled.</div>
      ) : (
        <ul className="divide-y divide-foreground/[0.06]">
          {open.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{r.item_label}</div>
                <div className="text-[11px] font-mono text-muted-foreground truncate">{r.requester_email ?? "Investor"} · {timeAgo(r.created_at)}</div>
              </div>
              <button onClick={() => resolve(r.id, "fulfilled")} title="Mark provided" className="inline-flex items-center gap-1 rounded-md border border-foreground/15 px-2.5 py-1 text-xs hover:bg-foreground/[0.04]"><Check className="w-3.5 h-3.5" /> Provided</button>
              <button onClick={() => resolve(r.id, "dismissed")} title="Dismiss" className="p-1.5 text-muted-foreground hover:text-rose-600 rounded-md hover:bg-foreground/[0.04]"><X className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
