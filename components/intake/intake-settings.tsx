"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { CATEGORY_LABEL, STAGES, type Category, type EngineResult, type IntakeConfig, type Preset } from "@/lib/intake/model"

const box = "rounded-xl border border-border bg-card p-5"
const input = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
const label = "text-xs font-medium text-muted-foreground"
const BADGE: Record<Category, string> = { passed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", review: "bg-amber-500/15 text-amber-700 dark:text-amber-300", not_a_fit: "bg-foreground/10 text-muted-foreground" }
const csv = (a: string[]) => a.join(", ")
const fromCsv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean)
const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s.replace(/[^0-9.]/g, "")))
const slugKey = (s: string) => (s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[0-9_]+/, "") || "dim").slice(0, 30)

interface Loaded { config: IntakeConfig; version: number; exists: boolean; submissions: any[]; presets: Preset[]; link: string; embed: string }
const HARD: { key: IntakeConfig["gates"]["hard"][number]; label: string }[] = [
  { key: "stage", label: "Stage" }, { key: "sector", label: "Sector" }, { key: "excludedSector", label: "Excluded sector" },
  { key: "geography", label: "Geography" }, { key: "excludedGeography", label: "Excluded geography" }, { key: "raise", label: "Round size" }, { key: "cheque", label: "Cheque" },
]

export function IntakeSettings({ fundId }: { fundId: string }) {
  const [data, setData] = useState<Loaded | null>(null)
  const [cfg, setCfg] = useState<IntakeConfig | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [test, setTest] = useState({ companyName: "Example Co", stage: "Seed", sectors: "AI", location: "United States", raise: "1000000", problem: "", traction: "" })
  const [testResult, setTestResult] = useState<EngineResult | null>(null)
  const [testing, setTesting] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch(`/api/portfolio/funds/${fundId}/intake`, { cache: "no-store" })
    if (!r.ok) { setMsg({ ok: false, text: "Could not load the intake settings." }); return }
    const d: Loaded = await r.json()
    setData(d); setCfg(d.config)
  }, [fundId])
  useEffect(() => { load() }, [load])

  if (!data || !cfg) return <div className="text-sm text-muted-foreground">{msg?.text ?? "Loading…"}</div>
  const set = (patch: Partial<IntakeConfig>) => setCfg({ ...cfg, ...patch })
  const gates = cfg.gates
  const setGates = (patch: Partial<IntakeConfig["gates"]>) => set({ gates: { ...gates, ...patch } })
  const sum = cfg.rubric.reduce((s, d) => s + d.weight, 0)

  async function save() {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch(`/api/portfolio/funds/${fundId}/intake`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(cfg) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Could not save")
      setCfg(d.config); setMsg({ ok: true, text: `Saved as version ${d.version}.` }); await load()
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(false) }
  }

  async function runTest() {
    setTesting(true); setTestResult(null); setMsg(null)
    try {
      const r = await fetch(`/api/portfolio/funds/${fundId}/intake/test`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        config: cfg, submission: { companyName: test.companyName, stage: test.stage || null, sectors: fromCsv(test.sectors), location: test.location || null, raiseAmount: numOrNull(test.raise), answers: { problem: test.problem, traction: test.traction } } }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Test failed")
      setTestResult(d.result)
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setTesting(false) }
  }

  async function rerun(id: string) {
    await fetch(`/api/portfolio/funds/${fundId}/intake/rerun`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ submissionId: id }) })
    await load()
  }

  return (
    <div className="space-y-6">
      <section className={box}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={cfg.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Accept applications</label>
          <span className="text-xs text-muted-foreground">Config version {data.version || "(not saved yet)"}</span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><div className={label}>Your link</div><div className="mt-1 flex gap-2"><input readOnly value={data.link} className={input + " font-mono text-xs"} /><button type="button" className="mt-1 rounded-md border border-border px-3 text-xs" onClick={() => navigator.clipboard?.writeText(data.link)}>Copy</button></div></div>
          <div><div className={label}>Embed on your website</div><div className="mt-1 flex gap-2"><input readOnly value={data.embed} className={input + " font-mono text-xs"} /><button type="button" className="mt-1 rounded-md border border-border px-3 text-xs" onClick={() => navigator.clipboard?.writeText(data.embed)}>Copy</button></div></div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label><div className={label}>Headline on the form</div><input className={input} value={cfg.headline} maxLength={120} onChange={(e) => set({ headline: e.target.value })} placeholder="Pitch us" /></label>
          <label><div className={label}>Introduction</div><input className={input} value={cfg.intro} maxLength={1200} onChange={(e) => set({ intro: e.target.value })} placeholder="What we back and how we reply" /></label>
        </div>
      </section>

      <section className={box}>
        <h2 className="text-base font-semibold">How the engine judges</h2>
        <p className="mt-1 text-sm text-muted-foreground">Tell it what you invest in and how to weigh things, in your own words. This is the only place it takes instructions from. Applicants cannot change it.</p>
        <label className="mt-3 block"><div className={label}>Your thesis</div><textarea rows={4} className={input} maxLength={3000} value={cfg.thesis} onChange={(e) => set({ thesis: e.target.value })} placeholder="We back early-stage software commercialised from university research…" /></label>
        <label className="mt-3 block"><div className={label}>Instructions to the AI (optional)</div><textarea rows={4} className={input} maxLength={3000} value={cfg.instructions} onChange={(e) => set({ instructions: e.target.value })} placeholder="Weight founder-market fit over traction. Be sceptical of TAM claims. We never invest in crypto. A technical co-founder matters." /></label>
        <div className="mt-4"><div className={label}>Start from a preset (fills the weights and thresholds, you can still edit)</div>
          <div className="mt-2 flex flex-wrap gap-2">{data.presets.map((p) => (
            <button key={p.id} type="button" title={p.blurb} onClick={() => set({ rubric: p.rubric, thresholds: p.thresholds })} className="rounded-md border border-border px-3 py-1.5 text-xs hover:border-[var(--accent)]">{p.name}</button>))}</div></div>
      </section>

      <section className={box}>
        <h2 className="text-base font-semibold">Gates: what clearly fits</h2>
        <p className="mt-1 text-sm text-muted-foreground">Checked first, without AI. A blank answer from the applicant is never a miss; it becomes a question. Tick “rejects” for a gate that should send a clear miss to Not a fit; other misses go to Review.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><div className={label}>Stages you back</div><div className="mt-1 flex flex-wrap gap-2">{STAGES.map((s) => (
            <label key={s} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={gates.stages.includes(s)} onChange={(e) => setGates({ stages: e.target.checked ? [...gates.stages, s] : gates.stages.filter((x) => x !== s) })} />{s}</label>))}</div></div>
          <label><div className={label}>Sectors you back (comma separated)</div><input className={input} value={csv(gates.sectors)} onChange={(e) => setGates({ sectors: fromCsv(e.target.value) })} /></label>
          <label><div className={label}>Sectors you never back</div><input className={input} value={csv(gates.excludedSectors)} onChange={(e) => setGates({ excludedSectors: fromCsv(e.target.value) })} /></label>
          <label><div className={label}>Geographies you back</div><input className={input} value={csv(gates.geographies)} onChange={(e) => setGates({ geographies: fromCsv(e.target.value) })} /></label>
          <label><div className={label}>Geographies you never back</div><input className={input} value={csv(gates.excludedGeographies)} onChange={(e) => setGates({ excludedGeographies: fromCsv(e.target.value) })} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label><div className={label}>Round size min (USD)</div><input className={input} inputMode="numeric" value={gates.raiseMin ?? ""} onChange={(e) => setGates({ raiseMin: numOrNull(e.target.value) })} /></label>
            <label><div className={label}>Round size max</div><input className={input} inputMode="numeric" value={gates.raiseMax ?? ""} onChange={(e) => setGates({ raiseMax: numOrNull(e.target.value) })} /></label>
            <label><div className={label}>Your cheque min</div><input className={input} inputMode="numeric" value={gates.chequeMin ?? ""} onChange={(e) => setGates({ chequeMin: numOrNull(e.target.value) })} /></label>
            <label><div className={label}>Your cheque max</div><input className={input} inputMode="numeric" value={gates.chequeMax ?? ""} onChange={(e) => setGates({ chequeMax: numOrNull(e.target.value) })} /></label>
          </div>
        </div>
        <div className="mt-3"><div className={label}>A clear miss on these goes straight to Not a fit (“rejects”)</div>
          <div className="mt-1 flex flex-wrap gap-3">{HARD.map((h) => (
            <label key={h.key} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={gates.hard.includes(h.key)} onChange={(e) => setGates({ hard: e.target.checked ? [...gates.hard, h.key] : gates.hard.filter((x) => x !== h.key) })} />{h.label}</label>))}</div></div>
      </section>

      <section className={box}>
        <h2 className="flex items-center justify-between text-base font-semibold">Scoring rubric <span className={`text-xs font-normal ${Math.abs(sum - 1) > 0.011 ? "text-[var(--danger)]" : "text-muted-foreground"}`}>weights add to {(sum * 100).toFixed(0)}% (must be 100%)</span></h2>
        <div className="mt-3 space-y-2">{cfg.rubric.map((d, i) => (
          <div key={d.key} className="grid gap-2 sm:grid-cols-[160px_90px_1fr_auto]">
            <input className={input} value={d.label} maxLength={60} onChange={(e) => set({ rubric: cfg.rubric.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
            <input className={input} inputMode="numeric" value={Math.round(d.weight * 100)} onChange={(e) => set({ rubric: cfg.rubric.map((x, j) => (j === i ? { ...x, weight: Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100 } : x)) })} />
            <input className={input} value={d.guidance} maxLength={400} placeholder="What good looks like" onChange={(e) => set({ rubric: cfg.rubric.map((x, j) => (j === i ? { ...x, guidance: e.target.value } : x)) })} />
            <button type="button" className="mt-1 text-xs text-muted-foreground underline" disabled={cfg.rubric.length <= 1} onClick={() => set({ rubric: cfg.rubric.filter((_, j) => j !== i) })}>Remove</button>
          </div>))}</div>
        <button type="button" className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs" disabled={cfg.rubric.length >= 10} onClick={() => {
          let key = "criterion", n = 1; while (cfg.rubric.some((d) => d.key === key)) key = `criterion_${++n}`
          set({ rubric: [...cfg.rubric, { key: slugKey(key), label: "New criterion", weight: 0, guidance: "" }] })
        }}>Add a criterion</button>
        <div className="mt-4 grid max-w-md grid-cols-2 gap-3">
          <label><div className={label}>Passed at or above (0–100)</div><input className={input} inputMode="numeric" value={cfg.thresholds.pass} onChange={(e) => set({ thresholds: { ...cfg.thresholds, pass: Number(e.target.value) || 0 } })} /></label>
          <label><div className={label}>Review at or above</div><input className={input} inputMode="numeric" value={cfg.thresholds.review} onChange={(e) => set({ thresholds: { ...cfg.thresholds, review: Number(e.target.value) || 0 } })} /></label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Below the review line is Not a fit. If the AI fails for any reason the deal goes to Review, never to Not a fit.</p>
      </section>

      <section className={box}>
        <h2 className="text-base font-semibold">The form</h2>
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          {([["askRaise", "Ask about the round"], ["askTraction", "Ask about traction"], ["askTeam", "Ask about the team"], ["askLocation", "Ask for location"]] as const).map(([k, l]) => (
            <label key={k} className="flex items-center gap-1"><input type="checkbox" checked={cfg.form[k]} onChange={(e) => set({ form: { ...cfg.form, [k]: e.target.checked } })} />{l}</label>))}
        </div>
        <div className="mt-3 space-y-2">{cfg.form.questions.map((q, i) => (
          <div key={q.id} className="flex flex-wrap items-center gap-2">
            <input className={input + " flex-1"} value={q.label} maxLength={200} onChange={(e) => set({ form: { ...cfg.form, questions: cfg.form.questions.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) } })} />
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={q.required} onChange={(e) => set({ form: { ...cfg.form, questions: cfg.form.questions.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)) } })} />Required</label>
            <button type="button" className="text-xs text-muted-foreground underline" onClick={() => set({ form: { ...cfg.form, questions: cfg.form.questions.filter((_, j) => j !== i) } })}>Remove</button>
          </div>))}</div>
        <button type="button" className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs" disabled={cfg.form.questions.length >= 8} onClick={() => {
          let n = cfg.form.questions.length + 1; while (cfg.form.questions.some((q) => q.id === `q${n}`)) n++
          set({ form: { ...cfg.form, questions: [...cfg.form.questions, { id: `q${n}`, label: "Your question", required: false, long: true }] } })
        }}>Add your own question</button>
      </section>

      <div className="sticky bottom-3 flex items-center gap-3 rounded-xl border border-border bg-card/95 p-3 backdrop-blur">
        <button type="button" onClick={save} disabled={busy} className="h-9 rounded-md px-5 text-sm font-medium disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{busy ? "Saving…" : "Save settings"}</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-muted-foreground" : "text-[var(--danger)]"}`}>{msg.text}</span>}
      </div>

      <section className={box}>
        <h2 className="text-base font-semibold">Test it before you publish</h2>
        <p className="mt-1 text-sm text-muted-foreground">Runs the engine on a made-up submission with the settings above, saved or not. Nothing is stored and no deal is created.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label><div className={label}>Company</div><input className={input} value={test.companyName} onChange={(e) => setTest({ ...test, companyName: e.target.value })} /></label>
          <label><div className={label}>Stage</div><select className={input} value={test.stage} onChange={(e) => setTest({ ...test, stage: e.target.value })}><option value="">(blank)</option>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label><div className={label}>Sectors</div><input className={input} value={test.sectors} onChange={(e) => setTest({ ...test, sectors: e.target.value })} /></label>
          <label><div className={label}>Location</div><input className={input} value={test.location} onChange={(e) => setTest({ ...test, location: e.target.value })} /></label>
          <label><div className={label}>Raising (USD)</div><input className={input} value={test.raise} onChange={(e) => setTest({ ...test, raise: e.target.value })} /></label>
        </div>
        <label className="mt-3 block"><div className={label}>Problem</div><textarea rows={2} className={input} value={test.problem} onChange={(e) => setTest({ ...test, problem: e.target.value })} /></label>
        <label className="mt-3 block"><div className={label}>Traction</div><textarea rows={2} className={input} value={test.traction} onChange={(e) => setTest({ ...test, traction: e.target.value })} /></label>
        <button type="button" onClick={runTest} disabled={testing} className="mt-3 rounded-md border border-border px-4 py-2 text-sm disabled:opacity-50">{testing ? "Running…" : "Run the engine"}</button>
        {testResult && (
          <div className="mt-4 rounded-lg border border-border p-4 text-sm">
            <div className="flex items-center gap-2"><span className={`rounded px-2 py-0.5 text-xs font-medium ${BADGE[testResult.category]}`}>{CATEGORY_LABEL[testResult.category]}</span><span className="tabular-nums">{testResult.score ?? "no score"}</span></div>
            <p className="mt-2 text-muted-foreground">{testResult.reason}</p>
            {testResult.summary && <p className="mt-2">{testResult.summary}</p>}
            {testResult.gates.length > 0 && <ul className="mt-2 text-xs text-muted-foreground">{testResult.gates.map((g) => <li key={g.gate}>{g.result === "pass" ? "✓" : g.result === "fail" ? "✗" : "?"} {g.label}: {g.detail}</li>)}</ul>}
            {testResult.dimensions.length > 0 && <ul className="mt-2 text-xs">{testResult.dimensions.map((d) => <li key={d.key}><span className="tabular-nums">{d.score}/5</span> {d.key}: {d.note}</li>)}</ul>}
            {testResult.questions.length > 0 && <div className="mt-2 text-xs"><div className="font-medium">Ask on the first call</div><ul className="list-disc pl-5">{testResult.questions.map((q, i) => <li key={i}>{q}</li>)}</ul></div>}
          </div>)}
      </section>

      <section className={box}>
        <h2 className="text-base font-semibold">Applications</h2>
        {data.submissions.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">None yet.</p> : (
          <div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><tbody>{data.submissions.map((s) => (
            <tr key={s.id} className="border-b border-border/60 last:border-0">
              <td className="py-2 pr-3"><div className="font-medium">{s.company_name}</div><div className="text-xs text-muted-foreground">{s.contact_name} · {s.public_ref} · {new Date(s.created_at).toLocaleDateString("en-GB")}</div></td>
              <td className="py-2 pr-3">{s.category ? <span className={`rounded px-2 py-0.5 text-xs font-medium ${BADGE[s.category as Category]}`}>{CATEGORY_LABEL[s.category as Category]}</span> : <span className="text-xs text-muted-foreground">{s.status}</span>}</td>
              <td className="py-2 pr-3 tabular-nums">{s.score ?? "—"}</td>
              <td className="py-2 text-right text-xs">{s.deal_id && <Link className="underline" href={`/dashboard/portfolio/fund/deals/${s.deal_id}`}>Open deal</Link>} {["assessed", "failed"].includes(s.status) && <button className="ml-2 underline" onClick={() => rerun(s.id)}>Re-run</button>}</td>
            </tr>))}</tbody></table></div>)}
      </section>
    </div>
  )
}
