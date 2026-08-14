"use client"

import { useEffect, useMemo, useState } from "react"
import { Plus, Loader2 } from "lucide-react"
import type { OptionGrant } from "@/lib/modules/carta-modules"

const fmt = (n: number) => n.toLocaleString()
const STATUS: Record<string, string> = { draft: "Draft", granted: "Granted", exercised: "Exercised", cancelled: "Cancelled" }
const BADGE: Record<string, string> = {
  granted: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  draft: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  exercised: "bg-[#2f45e0]/10 text-[#2f45e0]",
  cancelled: "bg-foreground/[0.06] text-muted-foreground",
}

export function SharePlansClient({ initial }: { initial: OptionGrant[] }) {
  const [grants, setGrants] = useState(initial)
  const [pool, setPool] = useState(0)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ granteeName: "", granteeEmail: "", options: "", strike: "", grantDate: "", vestMonths: "48", cliffMonths: "12" })

  useEffect(() => { try { const p = localStorage.getItem("anker:option-pool"); if (p) setPool(Number(p) || 0) } catch { /* ignore */ } }, [])
  function savePool(v: number) { setPool(v); try { localStorage.setItem("anker:option-pool", String(v)) } catch { /* ignore */ } }

  const granted = useMemo(() => grants.filter((g) => g.status !== "cancelled").reduce((s, g) => s + g.options, 0), [grants])
  const available = Math.max(0, pool - granted)

  async function create() {
    if (!f.granteeName.trim()) return
    setBusy(true)
    try {
      const res = await fetch("/api/share-plans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ granteeName: f.granteeName, granteeEmail: f.granteeEmail || null, options: Number(f.options) || 0, strike: f.strike ? Number(f.strike) : null, grantDate: f.grantDate || null, vestMonths: Number(f.vestMonths) || 48, cliffMonths: Number(f.cliffMonths) || 12 }) })
      const d = await res.json()
      if (d.grant) { setGrants((g) => [d.grant, ...g]); setF({ granteeName: "", granteeEmail: "", options: "", strike: "", grantDate: "", vestMonths: "48", cliffMonths: "12" }); setOpen(false) }
    } catch { /* ignore */ } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-[#e5380f] text-white hover:bg-[#c72f0c]"><Plus className="w-4 h-4" /> New grant</button>
      </div>

      {/* Pool summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-foreground/10 border border-foreground/10 rounded-lg overflow-hidden">
        <div className="bg-background p-3.5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Option pool</div>
          <div className="flex items-center rounded-md border border-foreground/12 overflow-hidden max-w-[140px]">
            <input value={pool || ""} onChange={(e) => savePool(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)} inputMode="numeric" placeholder="Set pool" className="flex-1 px-2 py-1 text-sm tabular-nums bg-transparent focus:outline-none" />
          </div>
        </div>
        <Tile label="Granted" value={fmt(granted)} />
        <Tile label="Available" value={fmt(available)} tone="emerald" />
        <Tile label="Grantees" value={fmt(new Set(grants.map((g) => g.grantee_name)).size)} />
      </div>

      {open && (
        <div className="mt-6 border border-foreground/10 rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Grant options</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Grantee *"><input value={f.granteeName} onChange={(e) => setF({ ...f, granteeName: e.target.value })} className="inp2" placeholder="Jane Doe" /></Field>
            <Field label="Email"><input value={f.granteeEmail} onChange={(e) => setF({ ...f, granteeEmail: e.target.value })} className="inp2" placeholder="jane@company.com" /></Field>
            <Field label="Options *"><input value={f.options} onChange={(e) => setF({ ...f, options: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" className="inp2 tabular-nums" placeholder="10000" /></Field>
            <Field label="Strike ($)"><input value={f.strike} onChange={(e) => setF({ ...f, strike: e.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal" className="inp2 tabular-nums" placeholder="0.10" /></Field>
            <Field label="Grant date"><input type="date" value={f.grantDate} onChange={(e) => setF({ ...f, grantDate: e.target.value })} className="inp2" /></Field>
            <Field label="Vest (mo) / Cliff (mo)">
              <div className="flex gap-2">
                <input value={f.vestMonths} onChange={(e) => setF({ ...f, vestMonths: e.target.value.replace(/[^0-9]/g, "") })} className="inp2 tabular-nums" />
                <input value={f.cliffMonths} onChange={(e) => setF({ ...f, cliffMonths: e.target.value.replace(/[^0-9]/g, "") })} className="inp2 tabular-nums" />
              </div>
            </Field>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={create} disabled={busy || !f.granteeName.trim()} className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-[#e5380f] text-white hover:bg-[#c72f0c] disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create grant</button>
            <button onClick={() => setOpen(false)} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        </div>
      )}

      <div className="mt-8 overflow-x-auto border border-foreground/10 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-foreground/10 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              <th className="text-left px-4 py-2.5">Grantee</th>
              <th className="text-right px-4 py-2.5">Options</th>
              <th className="text-right px-4 py-2.5">Strike</th>
              <th className="text-left px-4 py-2.5">Grant date</th>
              <th className="text-left px-4 py-2.5">Vesting</th>
              <th className="text-left px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {grants.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">No grants yet. Set your pool and issue the first grant.</td></tr>
            ) : grants.map((g) => (
              <tr key={g.id} className="border-b border-foreground/[0.06] last:border-0">
                <td className="px-4 py-2.5"><span className="font-medium">{g.grantee_name}</span>{g.grantee_email && <span className="block text-[11px] text-muted-foreground">{g.grantee_email}</span>}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmt(g.options)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{g.strike_price != null ? `$${g.strike_price}` : "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{g.grant_date ? new Date(g.grant_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{g.vest_months}mo · {g.cliff_months}mo cliff</td>
                <td className="px-4 py-2.5"><span className={`text-[11px] font-medium px-2 py-0.5 rounded ${BADGE[g.status]}`}>{STATUS[g.status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`.inp2{width:100%;height:2.25rem;padding:0 .75rem;border:1px solid rgb(128 128 128 / .18);border-radius:.5rem;background:var(--color-background);font-size:.875rem}.inp2:focus{outline:none;border-color:rgb(128 128 128 / .5)}`}</style>
    </div>
  )
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "emerald" }) {
  return <div className="bg-background p-3.5"><div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div><div className={`mt-1 text-lg font-semibold tabular-nums ${tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" : ""}`}>{value}</div></div>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1.5"><span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{label}</span>{children}</label>
}
