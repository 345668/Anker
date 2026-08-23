"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LineChart, Loader2, Plus } from "lucide-react"

type Range = { role: string; level: string | null; geography: string | null; baseMin: number | null; baseMax: number | null; equityMin: number | null; equityMax: number | null; source: string | null; asOf: string | null }

const money = (v: number | null) => (v == null ? "—" : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${Math.round(v).toLocaleString()}`)
const pct = (v: number | null) => (v == null ? "—" : `${v}%`)

export function CompBenchmark({ configured }: { configured: boolean }) {
  const router = useRouter()
  const [f, setF] = useState({ role: "", level: "", geography: "" })
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [range, setRange] = useState<Range | null>(null)

  async function fetchBenchmark() {
    setErr(null); setRange(null); setBusy(true)
    try {
      const res = await fetch("/api/comp-bands/benchmark", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: f.role.trim(), level: f.level.trim() || undefined, geography: f.geography.trim() || undefined }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d?.error ?? "Benchmark fetch failed."); return }
      setRange(d.benchmark)
    } catch (e: any) { setErr(e?.message ?? "Network error.") } finally { setBusy(false) }
  }

  async function addAsBand() {
    if (!range) return
    setAdding(true)
    try {
      const res = await fetch("/api/comp-bands", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: range.role, level: range.level, geography: range.geography, baseMin: range.baseMin, baseMax: range.baseMax, equityMin: range.equityMin, equityMax: range.equityMax }),
      })
      if (res.ok) { setRange(null); setF({ role: "", level: "", geography: "" }); router.refresh() }
      else { const d = await res.json().catch(() => ({})); setErr(d?.error ?? "Could not add band.") }
    } catch (e: any) { setErr(e?.message ?? "Network error.") } finally { setAdding(false) }
  }

  return (
    <div className="mb-6 rounded-xl border border-foreground/10 bg-foreground/[0.02] px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <LineChart className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">Benchmark from market data</span>
      </div>
      {!configured ? (
        <div className="text-[12px] text-muted-foreground">Not configured — set <span className="font-mono">COMP_BENCHMARK_API_URL</span> (Radford / Payscale / Pave / an internal service) to pull market salary &amp; equity ranges.</div>
      ) : (
        <>
          <div className="text-[12px] text-muted-foreground mb-3">Pull market salary &amp; equity ranges for a role, then add them as a band.</div>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Role *"><input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className="benchInp w-44" placeholder="Software Engineer" /></Field>
            <Field label="Level"><input value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })} className="benchInp w-28" placeholder="L4 / Senior" /></Field>
            <Field label="Region"><input value={f.geography} onChange={(e) => setF({ ...f, geography: e.target.value })} className="benchInp w-28" placeholder="EU / Remote" /></Field>
            <button onClick={fetchBenchmark} disabled={busy || !f.role.trim()} className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md border border-foreground/15 hover:border-foreground/40 disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LineChart className="w-4 h-4" />} Fetch
            </button>
          </div>

          {range && (
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-foreground/10 bg-background px-4 py-2.5">
              <div><div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Base</div><div className="text-sm font-semibold tabular-nums">{money(range.baseMin)} – {money(range.baseMax)}</div></div>
              <div><div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Equity</div><div className="text-sm font-semibold tabular-nums">{pct(range.equityMin)} – {pct(range.equityMax)}</div></div>
              {range.source && <div className="text-[11px] text-muted-foreground">{range.source}{range.asOf ? ` · ${range.asOf}` : ""}</div>}
              <button onClick={addAsBand} disabled={adding} className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 text-sm rounded-md bg-[#e5380f] text-white hover:bg-[#c72f0c] disabled:opacity-50">
                {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add as band
              </button>
            </div>
          )}
          <style>{`.benchInp{height:2.25rem;padding:0 .75rem;border:1px solid rgb(128 128 128 / .18);border-radius:.5rem;background:var(--color-background);font-size:.875rem}.benchInp:focus{outline:none;border-color:rgb(128 128 128 / .5)}`}</style>
        </>
      )}
      {err && <div className="mt-2 text-[12px] text-red-600 dark:text-red-400">{err}</div>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1"><span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</span>{children}</label>
}
