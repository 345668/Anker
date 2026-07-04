"use client"

/**
 * Management company + studio — two engines on one screen:
 *
 *   left   fee income (received / receivable, from Phase-4 accruals),
 *          budget vs. actuals editor with per-category variance bars,
 *          spend log with quick-add.
 *   right  studio project board (idea → validation → build → spun_out)
 *          with a spinout panel on build-stage projects that books the
 *          NewCo into the fund of record (company + check + common).
 */

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Loader2, AlertTriangle, Plus, Trash2, Save, Rocket, ArrowRight,
} from "lucide-react"
import type { FundFull } from "@/lib/portfolio/funds"
import { MC_CATEGORIES, type StudioStage } from "@/lib/portfolio/mc-constants"
import type { McOverview, McActual, StudioProjectFull } from "@/lib/portfolio/management-company"

interface Props {
  fund: FundFull
  year: number
  initialOverview: McOverview | null
  initialActuals: McActual[]
  initialProjects: StudioProjectFull[]
  tablesReady: boolean
}

const usd = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

const STUDIO_FLOW: { v: StudioStage; l: string }[] = [
  { v: "idea", l: "Idea" }, { v: "validation", l: "Validation" },
  { v: "build", l: "Build" }, { v: "spun_out", l: "Spun out" },
]

export function ManagementClient({
  fund, year, initialOverview, initialActuals, initialProjects, tablesReady,
}: Props) {
  const router = useRouter()
  const [overview, setOverview] = useState(initialOverview)
  const [actuals, setActuals] = useState(initialActuals)
  const [projects, setProjects] = useState(initialProjects)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  // Budget draft: category → planned string
  const [budgetDraft, setBudgetDraft] = useState<Record<string, string>>(
    Object.fromEntries((initialOverview?.rows ?? []).map((r) => [r.category, r.planned ? String(r.planned) : ""])),
  )
  const [editingBudget, setEditingBudget] = useState(false)

  // Actual quick-add
  const today = new Date().toISOString().slice(0, 10)
  const [aDate, setADate] = useState(today)
  const [aCat, setACat] = useState<string>(MC_CATEGORIES[0])
  const [aAmount, setAAmount] = useState("")
  const [aMemo, setAMemo] = useState("")

  // New project
  const [showProject, setShowProject] = useState(false)
  const [pjName, setPjName] = useState("")
  const [pjLiner, setPjLiner] = useState("")
  const [pjEir, setPjEir] = useState("")
  const [pjBudget, setPjBudget] = useState("")

  // Spinout panel
  const [spinoutId, setSpinoutId] = useState<string | null>(null)
  const [soCheck, setSoCheck] = useState("")
  const [soCommon, setSoCommon] = useState("30")

  const api = `/api/portfolio/funds/${fund.id}/management`

  async function call(path: string, init: RequestInit, tag: string): Promise<any> {
    setBusy(tag); setError(null)
    try {
      const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `${tag} failed (${res.status})`)
      return data
    } catch (e: any) { setError(e?.message ?? `${tag} failed`); return null }
    finally { setBusy(null) }
  }

  async function refresh() {
    const data = await call(`${api}?year=${year}`, { method: "GET" }, "refresh")
    if (data) { setOverview(data.overview); setActuals(data.actuals); setProjects(data.projects) }
  }

  async function saveBudget() {
    const lines = Object.entries(budgetDraft)
      .filter(([, v]) => v !== "")
      .map(([category, v]) => ({ category, plannedAmount: Number(v) || 0 }))
    const data = await call(`${api}/budget`, {
      method: "PUT", body: JSON.stringify({ year, lines }),
    }, "budget")
    if (data) { setEditingBudget(false); await refresh() }
  }

  async function addSpend() {
    const data = await call(`${api}/actuals`, {
      method: "POST",
      body: JSON.stringify({ occurredOn: aDate, category: aCat, amount: Number(aAmount) || 0, memo: aMemo || null }),
    }, "actual")
    if (data) { setAAmount(""); setAMemo(""); await refresh() }
  }

  async function removeSpend(id: string) {
    const data = await call(`${api}/actuals?actualId=${encodeURIComponent(id)}`, { method: "DELETE" }, id)
    if (data) await refresh()
  }

  async function createProject() {
    const data = await call(`${api}/studio`, {
      method: "POST",
      body: JSON.stringify({
        name: pjName, oneLiner: pjLiner || null, leadEir: pjEir || null,
        budgetAmount: pjBudget ? Number(pjBudget) : null, startedAt: today,
      }),
    }, "project")
    if (data) {
      setProjects([data, ...projects])
      setPjName(""); setPjLiner(""); setPjEir(""); setPjBudget(""); setShowProject(false)
    }
  }

  async function advanceProject(p: StudioProjectFull, stage: StudioStage) {
    const data = await call(`${api}/studio/${p.id}`, {
      method: "PATCH", body: JSON.stringify({ stage }),
    }, `${p.id}-${stage}`)
    if (data) setProjects(projects.map((x) => (x.id === p.id ? data : x)))
  }

  async function doSpinout(p: StudioProjectFull) {
    const data = await call(`${api}/studio/${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        spinout: { checkAmount: Number(soCheck) || 0, studioCommonPct: (Number(soCommon) || 0) / 100 },
      }),
    }, `spinout-${p.id}`)
    if (data) {
      setProjects(projects.map((x) => (x.id === p.id ? data : x)))
      setSpinoutId(null); setSoCheck("")
      router.refresh()
    }
  }

  const o = overview

  return (
    <div className="min-h-screen">
      <div className="border-b border-foreground/10">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-10">
          <Link href="/dashboard/portfolio/fund"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
            <ArrowLeft className="w-4 h-4" />
            {fund.name}
          </Link>
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-3">
            <span className="w-8 h-px bg-foreground/30" />
            Management company · budget vs actuals · studio
          </span>
          <h1 className="text-4xl lg:text-5xl font-display tracking-tight leading-[0.95]">
            Operations {year}.
          </h1>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-8 space-y-6">
        {!tablesReady && (
          <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              Management tables missing. Run{" "}
              <code className="font-mono text-xs bg-foreground/10 px-1.5 py-0.5 rounded">
                NEON_DATABASE_URL=… node scripts/oneshot/run-management-company-tables.mjs
              </code>{" "}
              and reload.
            </span>
          </div>
        )}
        {error && (
          <div className="p-3 rounded-md border border-destructive/30 bg-destructive/5 text-sm text-destructive">{error}</div>
        )}

        {/* Fee income + operating result */}
        {o && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Kpi label="Fee income received" v={usd(o.feeIncome.received)} sub={`${year} paid accruals`} />
            <Kpi label="Fees receivable" v={usd(o.feeIncome.receivable)} sub="accrued, unpaid" />
            <Kpi label="Budget (plan)" v={usd(o.totalPlanned)} sub={`${year} total`} />
            <Kpi label="Spend (actual)" v={usd(o.totalActual)} sub={o.totalVariance >= 0 ? `${usd(o.totalVariance)} under` : `${usd(-o.totalVariance)} over`} />
            <Kpi label="Operating result" v={usd(o.operatingResult)} sub="fees received − spend"
              tone={o.operatingResult >= 0 ? "good" : "bad"} />
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          {/* ── Budget vs actuals ────────────────────────────────── */}
          <div className="space-y-6">
            <div className="border border-foreground/10 rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-lg">Budget vs actuals</h3>
                {!editingBudget ? (
                  <button onClick={() => setEditingBudget(true)}
                    className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground">
                    edit budget
                  </button>
                ) : (
                  <button onClick={saveBudget} disabled={busy === "budget"}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-foreground text-background text-xs disabled:opacity-50">
                    {busy === "budget" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Save
                  </button>
                )}
              </div>
              <table className="w-full text-xs">
                <thead className="bg-foreground/5">
                  <tr>
                    {["Category", "Plan", "Actual", "Used"].map((h) => (
                      <th key={h} className="p-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(o?.rows ?? MC_CATEGORIES.map((c) => ({ category: c, planned: 0, actual: 0, variance: 0, pctUsed: null }))).map((r) => (
                    <tr key={r.category} className="border-t border-foreground/5">
                      <td className="p-2">{r.category}</td>
                      <td className="p-2 font-mono">
                        {editingBudget ? (
                          <input type="number" value={budgetDraft[r.category] ?? ""}
                            onChange={(e) => setBudgetDraft({ ...budgetDraft, [r.category]: e.target.value })}
                            className="h-7 w-28 px-2 rounded border border-input bg-background text-xs font-mono" />
                        ) : usd(r.planned)}
                      </td>
                      <td className="p-2 font-mono">{usd(r.actual)}</td>
                      <td className="p-2">
                        {r.pctUsed != null ? (
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded bg-foreground/10 overflow-hidden">
                              <div className={`h-full ${r.pctUsed > 1 ? "bg-destructive" : r.pctUsed > 0.85 ? "bg-amber-500" : "bg-emerald-500"}`}
                                style={{ width: `${Math.min(100, r.pctUsed * 100)}%` }} />
                            </div>
                            <span className="font-mono text-[10px] text-muted-foreground">{(r.pctUsed * 100).toFixed(0)}%</span>
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Spend log */}
            <div className="border border-foreground/10 rounded-lg p-5">
              <h3 className="font-display text-lg mb-3">Spend log</h3>
              <div className="flex flex-wrap items-end gap-2 mb-4">
                <input type="date" value={aDate} onChange={(e) => setADate(e.target.value)}
                  className="h-9 px-2 rounded-md border border-input bg-background text-xs font-mono" />
                <select value={aCat} onChange={(e) => setACat(e.target.value)}
                  className="h-9 px-2 rounded-md border border-input bg-background text-xs">
                  {MC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="number" value={aAmount} onChange={(e) => setAAmount(e.target.value)} placeholder="Amount"
                  className="h-9 w-28 px-2 rounded-md border border-input bg-background text-xs font-mono" />
                <input value={aMemo} onChange={(e) => setAMemo(e.target.value)} placeholder="Memo"
                  className="h-9 flex-1 min-w-[100px] px-2 rounded-md border border-input bg-background text-xs" />
                <button onClick={addSpend} disabled={busy === "actual" || !aAmount}
                  className="h-9 px-4 rounded-full bg-foreground text-background text-xs disabled:opacity-50">
                  {busy === "actual" ? "…" : "Add"}
                </button>
              </div>
              {actuals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No spend recorded for {year}.</p>
              ) : (
                <table className="w-full text-xs">
                  <tbody>
                    {actuals.map((a) => (
                      <tr key={a.id} className="border-t border-foreground/5">
                        <td className="p-2 font-mono">{a.occurred_on}</td>
                        <td className="p-2">{a.category}</td>
                        <td className="p-2 font-mono">{usd(a.amount)}</td>
                        <td className="p-2 text-muted-foreground truncate max-w-[140px]">{a.memo ?? ""}</td>
                        <td className="p-2 text-right">
                          <button onClick={() => removeSpend(a.id)} disabled={busy === a.id}
                            className="p-1 text-muted-foreground hover:text-destructive">
                            {busy === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ── Studio ───────────────────────────────────────────── */}
          <div className="space-y-6">
            <div className="border border-foreground/10 rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-lg">Studio projects</h3>
                <button onClick={() => setShowProject((v) => !v)}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-foreground/15 hover:bg-foreground/5 text-xs">
                  <Plus className="w-3 h-3" />
                  New project
                </button>
              </div>

              {showProject && (
                <div className="mb-4 p-3 rounded-md border border-foreground/10 grid grid-cols-2 gap-2">
                  <input value={pjName} onChange={(e) => setPjName(e.target.value)} placeholder="Name *"
                    className="h-9 px-2 rounded-md border border-input bg-background text-xs" />
                  <input value={pjLiner} onChange={(e) => setPjLiner(e.target.value)} placeholder="One-liner"
                    className="h-9 px-2 rounded-md border border-input bg-background text-xs" />
                  <input value={pjEir} onChange={(e) => setPjEir(e.target.value)} placeholder="Lead EIR"
                    className="h-9 px-2 rounded-md border border-input bg-background text-xs" />
                  <input type="number" value={pjBudget} onChange={(e) => setPjBudget(e.target.value)} placeholder="Budget (USD)"
                    className="h-9 px-2 rounded-md border border-input bg-background text-xs font-mono" />
                  <button onClick={createProject} disabled={busy === "project" || !pjName.trim()}
                    className="col-span-2 h-9 rounded-full bg-foreground text-background text-xs disabled:opacity-50">
                    {busy === "project" ? "Creating…" : "Create project"}
                  </button>
                </div>
              )}

              {projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No studio projects yet. The pipeline runs idea → validation → build → spun out;
                  spinning out books the NewCo straight into the position book.
                </p>
              ) : (
                <div className="space-y-3">
                  {projects.map((p) => {
                    const flowIdx = STUDIO_FLOW.findIndex((s) => s.v === p.stage)
                    const next = p.stage === "idea" ? "validation" : p.stage === "validation" ? "build" : null
                    return (
                      <div key={p.id} className={`p-3 rounded-md border ${p.stage === "spun_out" ? "border-emerald-500/30 bg-emerald-500/5" : "border-foreground/10"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium text-sm">{p.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {[p.one_liner, p.lead_eir ? `EIR: ${p.lead_eir}` : null,
                                p.budget_amount ? `budget ${usd(p.budget_amount)}` : null]
                                .filter(Boolean).join(" · ")}
                            </div>
                          </div>
                          <span className={`font-mono text-[10px] uppercase px-1.5 py-0.5 rounded border shrink-0 ${
                            p.stage === "spun_out" ? "text-emerald-700 border-emerald-500/30"
                            : p.stage === "archived" ? "text-muted-foreground border-foreground/10"
                            : "text-foreground/70 border-foreground/15"
                          }`}>{STUDIO_FLOW[flowIdx]?.l ?? p.stage}</span>
                        </div>

                        {p.stage !== "spun_out" && p.stage !== "archived" && (
                          <div className="mt-2 flex items-center gap-3 flex-wrap">
                            {next && (
                              <button onClick={() => advanceProject(p, next as StudioStage)}
                                disabled={busy === `${p.id}-${next}`}
                                className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-muted-foreground hover:text-foreground hover:underline">
                                <ArrowRight className="w-3 h-3" /> {next}
                              </button>
                            )}
                            {p.stage === "build" && (
                              <button onClick={() => { setSpinoutId(spinoutId === p.id ? null : p.id); setSoCheck(String(p.budget_amount ?? "")) }}
                                className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-emerald-700 hover:underline">
                                <Rocket className="w-3 h-3" /> spin out
                              </button>
                            )}
                            <button onClick={() => advanceProject(p, "archived")}
                              className="font-mono text-[10px] uppercase text-muted-foreground hover:text-destructive hover:underline">
                              archive
                            </button>
                          </div>
                        )}

                        {p.stage === "spun_out" && (
                          <Link href="/dashboard/portfolio/fund/investments"
                            className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald-700 hover:underline">
                            <Rocket className="w-3 h-3" />
                            In the position book (check + studio common)
                          </Link>
                        )}

                        {spinoutId === p.id && (
                          <div className="mt-3 p-3 rounded-md bg-background border border-emerald-500/30 flex flex-wrap items-end gap-2">
                            <div>
                              <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Fund check (USD)</label>
                              <input type="number" value={soCheck} onChange={(e) => setSoCheck(e.target.value)}
                                className="h-9 w-36 px-2 rounded-md border border-input bg-background text-xs font-mono" />
                            </div>
                            <div>
                              <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Studio common %</label>
                              <input type="number" value={soCommon} onChange={(e) => setSoCommon(e.target.value)}
                                className="h-9 w-24 px-2 rounded-md border border-input bg-background text-xs font-mono" />
                            </div>
                            <button onClick={() => doSpinout(p)} disabled={busy === `spinout-${p.id}` || !soCheck}
                              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-emerald-600 text-white text-xs disabled:opacity-50">
                              {busy === `spinout-${p.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Rocket className="w-3 h-3" />}
                              Spin out → book position
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, v, sub, tone }: { label: string; v: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className={`p-4 rounded-lg border ${
      tone === "good" ? "border-emerald-500/30 bg-emerald-500/5"
      : tone === "bad" ? "border-destructive/30 bg-destructive/5"
      : "border-foreground/10"
    }`}>
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="font-display text-xl">{v}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  )
}
