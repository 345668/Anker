"use client"

import { useState } from "react"
import Link from "next/link"
import { Plus, Loader2, ChevronRight, Users } from "lucide-react"
import type { LiLeadList } from "@/lib/linkedin/types"

export function LeadListsClient({ initial }: { initial: LiLeadList[] }) {
  const [lists, setLists] = useState<LiLeadList[]>(initial)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState("")

  async function create() {
    if (!name.trim()) return
    setBusy(true)
    try {
      const d = await (await fetch("/api/linkedin/lead-lists", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }),
      })).json()
      if (d.list) { setLists((l) => [{ ...d.list, memberCount: 0 }, ...l]); setName(""); setOpen(false) }
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{lists.length} {lists.length === 1 ? "list" : "lists"}</p>
        <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 rounded-md bg-[#0a66c2] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#08589f]">
          <Plus className="h-4 w-4" /> New list
        </button>
      </div>

      {open && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">List name</span>
            <input className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#0a66c2]/30"
              value={name} placeholder="Seed-stage fintech founders" onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="rounded-md border px-3 py-1.5 text-sm">Cancel</button>
            <button onClick={create} disabled={busy || !name.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-[#0a66c2] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create
            </button>
          </div>
        </div>
      )}

      {lists.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Users className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium">No lists yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create a list, then add people by pasting a CSV or importing from your captured connections.</p>
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {lists.map((l) => (
            <Link key={l.id} href={`/dashboard/linkedin/leads/${l.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-muted/40">
              <div className="min-w-0">
                <span className="font-medium truncate">{l.name}</span>
                <p className="mt-0.5 text-xs text-muted-foreground">{l.memberCount ?? 0} {l.memberCount === 1 ? "person" : "people"} · from {l.source}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
