"use client"

import { useState } from "react"
import Link from "next/link"
import { Plus, Loader2, ChevronRight, Zap } from "lucide-react"
import type { LiCampaign, CampaignStatus } from "@/lib/linkedin/types"

const STATUS_CLS: Record<CampaignStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  paused: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  archived: "bg-muted text-muted-foreground",
}

export function CampaignsClient({
  initial,
  senders,
}: {
  initial: LiCampaign[]
  senders: { id: string; displayName: string; status: string }[]
}) {
  const [campaigns, setCampaigns] = useState<LiCampaign[]>(initial)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState("")
  const [senderId, setSenderId] = useState(senders[0]?.id ?? "")

  async function create() {
    if (!name.trim()) return
    setBusy(true)
    try {
      const res = await fetch("/api/linkedin/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, senderId: senderId || null }),
      })
      const d = await res.json()
      if (d.campaign) {
        setCampaigns((c) => [d.campaign, ...c])
        setName("")
        setOpen(false)
      }
    } finally {
      setBusy(false)
    }
  }

  const senderName = (id: string | null) => senders.find((s) => s.id === id)?.displayName ?? "— no sender —"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{campaigns.length} {campaigns.length === 1 ? "campaign" : "campaigns"}</p>
        <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 rounded-md bg-[#0a66c2] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#08589f]">
          <Plus className="h-4 w-4" /> New campaign
        </button>
      </div>

      {open && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          {senders.length === 0 && (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              Add a <Link href="/dashboard/linkedin/senders" className="underline">sender</Link> first — a campaign sends as one of your LinkedIn accounts.
            </p>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Campaign name</span>
            <input className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#0a66c2]/30"
              value={name} placeholder="Q3 founders outreach" onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Sender</span>
            <select className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm" value={senderId} onChange={(e) => setSenderId(e.target.value)}>
              <option value="">— none yet —</option>
              {senders.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="rounded-md border px-3 py-1.5 text-sm">Cancel</button>
            <button onClick={create} disabled={busy || !name.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-[#0a66c2] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create
            </button>
          </div>
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm font-medium">No campaigns yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create one, define its sequence, enroll people, and activate.</p>
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {campaigns.map((c) => (
            <Link key={c.id} href={`/dashboard/linkedin/campaigns/${c.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-muted/40">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{c.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLS[c.status]}`}>{c.status}</span>
                  {c.fullAuto && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 px-2 py-0.5 text-[11px] font-medium text-purple-600 dark:text-purple-400">
                      <Zap className="h-3 w-3" /> full-auto
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">as {senderName(c.senderId)}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
