"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Building2, Loader2, RefreshCw } from "lucide-react"

export function CompaniesHouseSync({ configured }: { configured: boolean }) {
  const router = useRouter()
  const [num, setNum] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function sync() {
    setErr(null); setMsg(null); setBusy(true)
    try {
      const res = await fetch("/api/equity-filings/sync", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyNumber: num.trim() }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d?.error ?? "Sync failed."); return }
      const bits = [`${d.company ?? "Company"}${d.companyNumber ? ` (${d.companyNumber})` : ""}`]
      bits.push(`${d.created} filing${d.created === 1 ? "" : "s"} added`)
      if (d.skipped) bits.push(`${d.skipped} already tracked`)
      if (d.note) bits.push(d.note)
      setMsg(bits.join(" · "))
      if (d.created > 0) router.refresh()
    } catch (e: any) {
      setErr(e?.message ?? "Network error.")
    } finally { setBusy(false) }
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.02] px-4 py-3">
      <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-[200px]">
        <div className="text-sm font-medium">Sync from Companies House</div>
        <div className="text-[12px] text-muted-foreground">
          {configured
            ? "Pull your confirmation-statement and accounts due dates straight from the UK registrar."
            : "Not configured — set COMPANIES_HOUSE_API_KEY to pull statutory deadlines automatically."}
        </div>
      </div>
      {configured && (
        <>
          <input
            value={num} onChange={(e) => setNum(e.target.value.toUpperCase())}
            placeholder="Company no. (e.g. 12345678)"
            className="h-9 w-48 rounded-md border border-foreground/15 bg-background px-3 text-sm tabular-nums focus:outline-none focus:border-foreground/40"
          />
          <button onClick={sync} disabled={busy || num.trim().length < 6}
            className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md border border-foreground/15 hover:border-foreground/40 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Sync
          </button>
        </>
      )}
      {msg && <div className="w-full text-[12px] text-emerald-600 dark:text-emerald-400">{msg}</div>}
      {err && <div className="w-full text-[12px] text-red-600 dark:text-red-400">{err}</div>}
    </div>
  )
}
