"use client"
import { useEffect, useState } from "react"
import useSWR from "swr"
import { useReducedMotion } from "framer-motion"
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts"
import { swrFetcher } from "@/lib/http/client"
import { DEFAULT_CAP_TABLE, DEFAULT_RUNWAY, calculateCapTable, projectRunway, validatePlanning, type CapTableState, type RunwayState } from "@/lib/planning/models"

type State = RunwayState | CapTableState
type RecordState = { state: State; revision: number; updated_at: string } | null
const button = "rounded-lg border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
export function PlanningWorkspace({ tool, orgId }: { tool: "runway" | "cap-table"; orgId: string }) {
  const { data, error, mutate } = useSWR<{ record: RecordState; orgId: string; name: string; canWrite: boolean }>(`/api/planning/${tool}?orgId=${encodeURIComponent(orgId)}`, swrFetcher, { revalidateOnFocus: false })
  if (error) return <p role="alert" className="p-8">Could not load your saved scenario. <button className="underline" onClick={() => void mutate()}>Try again</button></p>
  if (!data) return <p role="status" className="p-8">Loading saved scenario…</p>
  return <Editor key={`${tool}:${orgId}`} tool={tool} scope={data} reload={async () => (await mutate())?.record || null} />
}
function Editor({ tool, scope, reload }: { tool: "runway" | "cap-table"; scope: { record: RecordState; orgId: string; name: string; canWrite: boolean }; reload: () => Promise<RecordState> }) {
  const defaults = tool === "runway" ? DEFAULT_RUNWAY : DEFAULT_CAP_TABLE
  const [state, setState] = useState<State>(scope.record?.state || defaults)
  const [revision, setRevision] = useState(scope.record?.revision ?? -1)
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("")
  let validation = ""
  try { validatePlanning(tool, state) } catch (e: any) { validation = e.issues?.[0]?.message || e.message || "Check your assumptions." }
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = "" }
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
  function change(next: State) { setState(next); setDirty(true); setNotice("") }
  async function save() {
    setBusy(true); setError("")
    try {
      const response = await fetch(`/api/planning/${tool}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId: scope.orgId, revision, state }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Save failed. Your edits are still here.")
      setState(result.record.state); setRevision(result.record.revision); setDirty(false); setNotice("Scenario saved to this workspace.")
    } catch (e) { setError(e instanceof Error ? e.message : "Save failed.") }
    finally { setBusy(false) }
  }
  return <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-8">
    <header><p className="text-xs uppercase tracking-widest text-muted-foreground">{scope.name} / Planning</p><h1 className="mt-3 font-serif text-4xl">{tool === "runway" ? "Know when you need to raise" : "Understand your ownership"}</h1>
      <p className="mt-3 text-muted-foreground">{tool === "runway" ? "Model monthly cash flow and a planned financing over 36 months." : "Model a priced equity round and its target option pool. SAFE and convertible-note conversion are outside this model."} All amounts are USD.</p></header>
    <div className="flex flex-wrap items-center gap-3"><span role="status" className="text-sm text-muted-foreground">{dirty ? "Unsaved changes" : revision < 0 ? "Illustrative sample — not saved company data" : `Saved scenario / Revision ${revision}`}</span>
      <button className={button} disabled={busy || !scope.canWrite || !!validation || (!dirty && revision >= 0)} onClick={() => void save()}>{busy ? "Saving…" : "Save scenario"}</button>
      <button className={button} disabled={busy} onClick={async () => { if (dirty && !window.confirm("Discard unsaved edits and reload the saved scenario?")) return; setBusy(true); setError(""); try { const r = await reload(); setState(r?.state || defaults); setRevision(r?.revision ?? -1); setDirty(false); setNotice("") } catch { setError("Could not reload. Your edits are still here.") } finally { setBusy(false) } }}>Reload saved version</button>
    </div>
    {(error || validation) && <p role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive">{error || validation}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    <fieldset disabled={busy || !scope.canWrite}>
      {tool === "runway" ? <RunwayEditor state={state as RunwayState} change={change} valid={!validation} /> : <CapTableEditor state={state as CapTableState} change={change} valid={!validation} />}
    </fieldset>
  </main>
}
function NumberField({ label, value, onChange, step = "any" }: { label: string; value: number; onChange: (v: number) => void; step?: string }) {
  return <label className="block text-sm">{label}<input type="number" step={step} value={Number.isFinite(value) ? value : ""} onChange={e => onChange(e.target.value === "" ? NaN : Number(e.target.value))} className="mt-1 w-full rounded-lg border bg-background p-3" /></label>
}
function RunwayEditor({ state, change, valid }: { state: RunwayState; change: (v: State) => void; valid: boolean }) {
  const reducedMotion = useReducedMotion()
  const set = (key: keyof RunwayState, value: number) => change({ ...state, [key]: value })
  const baseline = valid ? projectRunway(state) : null
  const variants = valid ? [
    { name: "Conservative", model: projectRunway({ ...state, burnGrowth: Math.min(1, state.burnGrowth + .02), revenueGrowth: Math.max(-.99, state.revenueGrowth - .05) }) },
    { name: "Baseline", model: baseline! },
    { name: "Optimistic", model: projectRunway({ ...state, burnGrowth: Math.max(-.99, state.burnGrowth - .01), revenueGrowth: Math.min(1, state.revenueGrowth + .05) }) },
  ] : []
  return <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
    <section className="space-y-4" aria-label="Runway assumptions">
      <NumberField label="Cash on hand (USD)" value={state.cashOnHand} onChange={v => set("cashOnHand", v)} />
      <NumberField label="Monthly operating costs (USD)" value={state.monthlyBurn} onChange={v => set("monthlyBurn", v)} />
      <NumberField label="Monthly revenue (USD)" value={state.monthlyRevenue} onChange={v => set("monthlyRevenue", v)} />
      <NumberField label="Monthly cost growth (%)" value={state.burnGrowth * 100} onChange={v => set("burnGrowth", v / 100)} />
      <NumberField label="Monthly revenue growth (%)" value={state.revenueGrowth * 100} onChange={v => set("revenueGrowth", v / 100)} />
      <NumberField label="Financing month (0 = none)" value={state.newRaiseMonth} onChange={v => set("newRaiseMonth", v)} step="1" />
      <NumberField label="Financing amount (USD)" value={state.newRaiseAmount} onChange={v => set("newRaiseAmount", v)} />
    </section>
    <section className="space-y-6" aria-label="Runway results">{baseline ? <>
      <div className="grid gap-3 sm:grid-cols-3">{variants.map(v => <div key={v.name} className="border p-4"><h2 className="text-sm text-muted-foreground">{v.name}</h2><p className="mt-2 text-xl">{v.model.zeroMonth === null ? "Beyond 36 months" : `${v.model.zeroMonth} months`}</p></div>)}</div>
      <p className="text-sm text-muted-foreground">Positive net operating cash flow increases cash. A financing adds cash at the start of its selected month. Earlier depletion remains a funding gap. Conservative assumes cost growth +2 percentage points and revenue growth −5; optimistic assumes costs −1 and revenue +5.</p>
      <div className="h-72" aria-label="Baseline cash projection"><ResponsiveContainer><AreaChart data={baseline.points}><CartesianGrid stroke="var(--border)" /><XAxis dataKey="month" stroke="var(--muted-foreground)" /><YAxis tickFormatter={v => `${Math.round(v / 1000)}k`} stroke="var(--muted-foreground)" /><Tooltip formatter={v => money(Number(v))} contentStyle={{ background: "var(--background)", color: "var(--foreground)", borderColor: "var(--border)" }} /><Area type="monotone" dataKey="cash" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.12} isAnimationActive={!reducedMotion} /></AreaChart></ResponsiveContainer></div>
      <details><summary className="cursor-pointer text-sm underline">View monthly figures</summary><div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{["Month", "Cash", "Costs", "Revenue", "Net burn"].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{baseline.points.map(p => <tr key={p.month}>{[p.month, money(p.cash), money(p.burn), money(p.revenue), money(p.netBurn)].map((v, i) => <td key={i} className="border-t p-2">{v}</td>)}</tr>)}</tbody></table></div></details>
    </> : <p className="text-sm text-muted-foreground">Correct the assumptions to calculate runway.</p>}</section>
  </div>
}
function CapTableEditor({ state, change, valid }: { state: CapTableState; change: (v: State) => void; valid: boolean }) {
  const stages = valid ? calculateCapTable(state) : []
  function holder(id: string, patch: Partial<CapTableState["holders"][number]>) { change({ ...state, holders: state.holders.map(h => h.id === id ? { ...h, ...patch } : h) }) }
  function round(id: string, patch: Partial<CapTableState["rounds"][number]>) { change({ ...state, rounds: state.rounds.map(r => r.id === id ? { ...r, ...patch } : r) }) }
  return <div className="grid gap-8 lg:grid-cols-2">
    <section className="space-y-6"><h2 className="font-serif text-2xl">Shareholders</h2>
      {state.holders.map(h => <div key={h.id} className="space-y-3 border p-4"><label className="block text-sm">Holder name<input value={h.name} maxLength={100} onChange={e => holder(h.id, { name: e.target.value })} className="mt-1 w-full rounded border bg-background p-2" /></label><NumberField label="Shares" value={h.shares} onChange={v => holder(h.id, { shares: v })} />
        <label className="block text-sm">Holder type<select value={h.type} onChange={e => holder(h.id, { type: e.target.value as typeof h.type })} className="ml-3 rounded border bg-background p-2">{["founder", "investor", "esop", "advisor"].map(t => <option key={t}>{t}</option>)}</select></label>
        <button className="text-sm underline" onClick={() => change({ ...state, holders: state.holders.filter(v => v.id !== h.id) })}>Remove {h.name || "holder"}</button></div>)}
      <button className={button} disabled={state.holders.length >= 100} onClick={() => change({ ...state, holders: [...state.holders, { id: crypto.randomUUID(), name: "New holder", shares: 0, type: "founder" }] })}>Add holder</button>
      <h2 className="font-serif text-2xl">Priced rounds</h2>{state.rounds.map(r => <div key={r.id} className="space-y-3 border p-4"><label className="block text-sm">Round name<input value={r.name} maxLength={100} onChange={e => round(r.id, { name: e.target.value })} className="mt-1 w-full rounded border bg-background p-2" /></label>
        <NumberField label="Pre-money valuation (USD)" value={r.preMoney} onChange={v => round(r.id, { preMoney: v })} /><NumberField label="New investment (USD)" value={r.raise} onChange={v => round(r.id, { raise: v })} /><NumberField label="Target post-round ESOP pool (%)" value={r.esopTarget * 100} onChange={v => round(r.id, { esopTarget: v / 100 })} />
        <button className="text-sm underline" onClick={() => change({ ...state, rounds: state.rounds.filter(v => v.id !== r.id) })}>Remove {r.name || "round"}</button></div>)}
      <button className={button} disabled={state.rounds.length >= 20} onClick={() => change({ ...state, rounds: [...state.rounds, { id: crypto.randomUUID(), name: "New round", preMoney: 10000000, raise: 2000000, esopTarget: .1 }] })}>Add round</button>
    </section>
    <section className="space-y-6"><h2 className="font-serif text-2xl">Ownership by stage</h2><p className="text-sm text-muted-foreground">The option pool tops up before investment to meet the post-round target. A lower target never cancels existing options. Fractional shares are model estimates.</p>
      {!valid && <p>Correct the assumptions to calculate ownership.</p>}
      {stages.map((s, i) => <div key={i} className="overflow-x-auto border p-4"><h3 className="mb-3 font-medium">{s.name}</h3><table className="w-full text-left text-sm"><thead><tr><th className="py-2">Holder</th><th>Shares</th><th>Ownership</th></tr></thead><tbody>{s.holders.map(h => <tr key={h.id}><td className="border-t py-2">{h.name}</td><td className="border-t">{h.shares.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td><td className="border-t">{(h.pct * 100).toFixed(2)}%</td></tr>)}</tbody></table></div>)}
    </section>
  </div>
}
