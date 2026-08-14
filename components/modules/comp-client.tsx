"use client"

import { useMemo, useState } from "react"
import { Plus, Loader2 } from "lucide-react"
import type { CompBand } from "@/lib/modules/carta-modules"

const money = (v: number | null) => (v == null ? "—" : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${Math.round(v).toLocaleString()}`)
const range = (a: number | null, b: number | null, fmt: (n: number | null) => string) => (a == null && b == null ? "—" : `${fmt(a)} – ${fmt(b)}`)
const pct = (v: number | null) => (v == null ? "—" : `${v}%`)

export function CompClient({ initial }: { initial: CompBand[] }) {
  const [bands, setBands] = useState(initial)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ role: "", level: "", geography: "", baseMin: "", baseMax: "", equityMin: "", equityMax: "" })

  const roles = useMemo(() => new Set(bands.map((b) => b.role)).size, [bands])
  const geos = useMemo(() => new Set(bands.map((b) => b.geography).filter(Boolean)).size, [bands])

  async function create() {
    if (!f.role.trim()) return
    setBusy(true)
    try {
      const res = await fetch("/api/comp-bands", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: f.role, level: f.level || null, geography: f.geography || null, baseMin: f.baseMin ? Number(f.baseMin) : null, baseMax: f.baseMax ? Number(f.baseMax) : null, equityMin: f.equityMin ? Number(f.equityMin) : null, equityMax: f.equityMax ? Number(f.equityMax) : null }) })
      const d = await res.json()
      if (d.band) { setBands((b) => [d.band, ...b]); setF({ role: "", level: "", geography: "", baseMin: "", baseMax: "", equityMin: "", equityMax: "" }); setOpen(false) }
    } catch { /* ignore */ } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-[#e5380f] text-white hover:bg-[#c72f0c]"><Plus className="w-4 h-4" /> Add band</button>
      </div>
      <div className="grid grid-cols-3 gap-px bg-foreground/10 border border-foreground/10 rounded-lg overflow-hidden">
        <Tile label="Bands" value={String(bands.length)} />
        <Tile label="Roles" value={String(roles)} />
        <Tile label="Regions" value={String(geos)} />
      </div>

      {open && (
        <div className="mt-6 border border-foreground/10 rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Define a compensation band</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Role *"><input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className="inpP" placeholder="Software Engineer" /></Field>
            <Field label="Level"><input value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })} className="inpP" placeholder="L4 / Senior" /></Field>
            <Field label="Region"><input value={f.geography} onChange={(e) => setF({ ...f, geography: e.target.value })} className="inpP" placeholder="EU / Remote" /></Field>
            <div />
            <Field label="Base min ($)"><input value={f.baseMin} onChange={(e) => setF({ ...f, baseMin: e.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal" className="inpP tabular-nums" placeholder="80000" /></Field>
            <Field label="Base max ($)"><input value={f.baseMax} onChange={(e) => setF({ ...f, baseMax: e.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal" className="inpP tabular-nums" placeholder="120000" /></Field>
            <Field label="Equity min (%)"><input value={f.equityMin} onChange={(e) => setF({ ...f, equityMin: e.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal" className="inpP tabular-nums" placeholder="0.05" /></Field>
            <Field label="Equity max (%)"><input value={f.equityMax} onChange={(e) => setF({ ...f, equityMax: e.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal" className="inpP tabular-nums" placeholder="0.25" /></Field>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={create} disabled={busy || !f.role.trim()} className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-[#e5380f] text-white hover:bg-[#c72f0c] disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Save band</button>
            <button onClick={() => setOpen(false)} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        </div>
      )}

      <div className="mt-8 overflow-x-auto border border-foreground/10 rounded-lg">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-foreground/10 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            <th className="text-left px-4 py-2.5">Role</th><th className="text-left px-4 py-2.5">Level</th><th className="text-left px-4 py-2.5">Region</th><th className="text-left px-4 py-2.5">Base range</th><th className="text-left px-4 py-2.5">Equity range</th>
          </tr></thead>
          <tbody>
            {bands.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">No bands yet. Define your first compensation band above.</td></tr>
            : bands.map((b) => (
              <tr key={b.id} className="border-b border-foreground/[0.06] last:border-0">
                <td className="px-4 py-2.5 font-medium">{b.role}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{b.level ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{b.geography ?? "—"}</td>
                <td className="px-4 py-2.5 tabular-nums">{range(b.base_min, b.base_max, money)}</td>
                <td className="px-4 py-2.5 tabular-nums">{range(b.equity_min, b.equity_max, pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <style>{`.inpP{width:100%;height:2.25rem;padding:0 .75rem;border:1px solid rgb(128 128 128 / .18);border-radius:.5rem;background:var(--color-background);font-size:.875rem}.inpP:focus{outline:none;border-color:rgb(128 128 128 / .5)}`}</style>
    </div>
  )
}
function Tile({ label, value }: { label: string; value: string }) {
  return <div className="bg-background p-3.5"><div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 text-lg font-semibold tabular-nums">{value}</div></div>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1.5"><span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{label}</span>{children}</label>
}
