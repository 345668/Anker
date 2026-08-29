"use client"

import { useState } from "react"
import { Loader2, Plus, Trash2, ShieldOff } from "lucide-react"
import type { Suppression } from "@/lib/linkedin/suppressions"

export function SuppressionClient({ initial }: { initial: Suppression[] }) {
  const [rows, setRows] = useState<Suppression[]>(initial)
  const [blob, setBlob] = useState("")
  const [busy, setBusy] = useState(false)

  async function add() {
    if (!blob.trim()) return
    setBusy(true)
    try {
      const d = await (await fetch("/api/linkedin/suppressions", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ blob }),
      })).json()
      if (d.ok) {
        setBlob("")
        const g = await (await fetch("/api/linkedin/suppressions")).json()
        if (g.suppressions) setRows(g.suppressions)
      }
    } finally { setBusy(false) }
  }

  async function remove(id: string) {
    if ((await (await fetch(`/api/linkedin/suppressions?id=${id}`, { method: "DELETE" })).json()).ok)
      setRows((r) => r.filter((x) => x.id !== id))
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Add profile URLs — one per line.</span>
          <textarea className="w-full rounded-md border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-[#0a66c2]/30"
            rows={3} value={blob} onChange={(e) => setBlob(e.target.value)} placeholder={"https://www.linkedin.com/in/jane\nhttps://www.linkedin.com/in/john"} />
        </label>
        <div className="mt-2 flex justify-end">
          <button onClick={add} disabled={busy || !blob.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-[#0a66c2] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Suppress
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <ShieldOff className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium">No one suppressed</p>
          <p className="mt-1 text-sm text-muted-foreground">Add people you never want contacted; opt-out replies land here automatically.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2 font-medium">Profile</th><th className="px-3 py-2 font-medium">Reason</th><th className="px-3 py-2"></th></tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-3 py-2 max-w-[360px] truncate">
                    {s.targetUrl ? <a href={s.targetUrl} target="_blank" rel="noreferrer" className="hover:underline">{s.slug}</a> : s.slug}
                  </td>
                  <td className="px-3 py-2"><span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{s.reason || "manual"}</span></td>
                  <td className="px-3 py-2 text-right"><button onClick={() => remove(s.id)} className="rounded p-1 text-red-600 hover:bg-muted"><Trash2 className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
