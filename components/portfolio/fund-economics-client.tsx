"use client"

/**
 * Fees & carry — two engines on one screen:
 *
 *   left   fee schedule (LPA terms) + quarterly accrual generation,
 *          each accrual flippable accrued → paid / waived; the ledger
 *          rebuild books them automatically.
 *   right  waterfall runner: gross amount + hurdle/carry/catch-up →
 *          tier totals + per-LP breakdown; save freezes the run and
 *          "Create distribution draft" pre-fills the real distribution.
 */

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Loader2, AlertTriangle, Percent, Layers, Save, Play, FileText,
} from "lucide-react"
import type { FundFull, FundLpRollup } from "@/lib/portfolio/funds"
import type { FeeSchedule, FeeAccrual, FeeBase, AccrualStatus } from "@/lib/portfolio/fund-fees"
import type { WaterfallResult, WaterfallRunFull } from "@/lib/portfolio/waterfall"

interface Props {
  fund: FundFull
  initialSchedule: FeeSchedule | null
  initialAccruals: FeeAccrual[]
  initialRuns: WaterfallRunFull[]
  rollup: FundLpRollup
  tablesReady: boolean
}

const usd = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
const pctStr = (n: number) => `${(n * 100).toFixed(2)}%`

export function FundEconomicsClient({
  fund, initialSchedule, initialAccruals, initialRuns, rollup, tablesReady,
}: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  // Fee schedule form
  const [feePct, setFeePct] = useState(initialSchedule ? String(initialSchedule.annual_fee_pct * 100) : "2.0")
  const [feeBase, setFeeBase] = useState<FeeBase>(initialSchedule?.fee_base ?? "committed")
  const [startDate, setStartDate] = useState(initialSchedule?.start_date ?? "")
  const [termYears, setTermYears] = useState(String(initialSchedule?.term_years ?? 10))
  const [stepAfter, setStepAfter] = useState(String(initialSchedule?.stepdown_after_years ?? 0))
  const [stepPct, setStepPct] = useState(
    initialSchedule?.stepdown_fee_pct != null ? String(initialSchedule.stepdown_fee_pct * 100) : "",
  )
  const [accruals, setAccruals] = useState(initialAccruals)

  // Waterfall form
  const [gross, setGross] = useState("")
  const [hurdle, setHurdle] = useState("8")
  const [carry, setCarry] = useState(fund.carry_pct != null ? String(fund.carry_pct * 100) : "20")
  const [catchUp, setCatchUp] = useState("100")
  const [wf, setWf] = useState<WaterfallResult | null>(null)
  const [runs, setRuns] = useState(initialRuns)
  const [lastRunId, setLastRunId] = useState<string | null>(null)

  const api = `/api/portfolio/funds/${fund.id}`

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

  async function saveSchedule() {
    const data = await call(`${api}/fees`, {
      method: "PUT",
      body: JSON.stringify({
        annualFeePct: (Number(feePct) || 0) / 100,
        feeBase,
        startDate,
        termYears: Number(termYears) || 10,
        stepdownAfterYears: Number(stepAfter) || 0,
        stepdownFeePct: stepPct ? (Number(stepPct) || 0) / 100 : null,
      }),
    }, "schedule")
    if (data) router.refresh()
  }

  async function generate() {
    const data = await call(`${api}/fees/accruals`, { method: "POST" }, "generate")
    if (data) { setAccruals(data.accruals); router.refresh() }
  }

  async function flipAccrual(a: FeeAccrual, status: AccrualStatus) {
    const data = await call(`${api}/fees/accruals`, {
      method: "PATCH", body: JSON.stringify({ accrualId: a.id, status }),
    }, a.id)
    if (data) setAccruals(accruals.map((x) => (x.id === a.id ? data : x)))
  }

  async function runWaterfall(save: boolean) {
    const data = await call(`${api}/waterfall`, {
      method: "POST",
      body: JSON.stringify({
        grossAmount: Number(gross) || 0,
        hurdlePct: (Number(hurdle) || 0) / 100,
        carryPct: (Number(carry) || 0) / 100,
        catchUpPct: (Number(catchUp) || 0) / 100,
        save,
      }),
    }, save ? "wf-save" : "wf-run")
    if (data) {
      setWf(data.result)
      if (data.run) {
        setRuns([data.run, ...runs])
        setLastRunId(data.run.id)
      }
    }
  }

  async function prefill(runId: string) {
    const data = await call(`${api}/waterfall`, {
      method: "PATCH", body: JSON.stringify({ runId }),
    }, `prefill-${runId}`)
    if (data) {
      setRuns(runs.map((r) => (r.id === runId ? data.run : r)))
      router.push(`/dashboard/portfolio/fund/distributions/${data.distributionId}`)
    }
  }

  const accruedTotal = accruals.filter((a) => a.status !== "waived").reduce((s, a) => s + a.fee_amount, 0)

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
            Fees &amp; carry · schedule → accruals → waterfall
          </span>
          <h1 className="text-4xl lg:text-5xl font-display tracking-tight leading-[0.95]">
            Fund economics.
          </h1>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-8 space-y-6">
        {!tablesReady && (
          <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              Fee/waterfall tables missing. Run{" "}
              <code className="font-mono text-xs bg-foreground/10 px-1.5 py-0.5 rounded">
                NEON_DATABASE_URL=… node scripts/oneshot/run-fees-waterfall-tables.mjs
              </code>{" "}
              and reload.
            </span>
          </div>
        )}
        {error && (
          <div className="p-3 rounded-md border border-destructive/30 bg-destructive/5 text-sm text-destructive">{error}</div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          {/* ── Fees ─────────────────────────────────────────────── */}
          <div className="space-y-6">
            <div className="border border-foreground/10 rounded-lg p-5">
              <h3 className="font-display text-lg mb-3 flex items-center gap-2">
                <Percent className="w-4 h-4" /> Management fee schedule
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <F label="Annual fee %">
                  <input type="number" step="0.05" value={feePct} onChange={(e) => setFeePct(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm font-mono" />
                </F>
                <F label="Fee base">
                  <select value={feeBase} onChange={(e) => setFeeBase(e.target.value as FeeBase)}
                    className="w-full h-10 px-2 rounded-md border border-input bg-background text-sm font-mono">
                    <option value="committed">Committed capital</option>
                    <option value="called">Called capital</option>
                    <option value="invested">Invested capital</option>
                  </select>
                </F>
                <F label="Start date (first close)">
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm font-mono" />
                </F>
                <F label="Term (years)">
                  <input type="number" value={termYears} onChange={(e) => setTermYears(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm font-mono" />
                </F>
                <F label="Step-down after (years, 0 = none)">
                  <input type="number" value={stepAfter} onChange={(e) => setStepAfter(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm font-mono" />
                </F>
                <F label="Step-down fee %">
                  <input type="number" step="0.05" value={stepPct} onChange={(e) => setStepPct(e.target.value)}
                    placeholder="e.g. 1.5"
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm font-mono" />
                </F>
              </div>
              <button onClick={saveSchedule} disabled={busy === "schedule" || !startDate || !tablesReady}
                className="mt-4 inline-flex items-center gap-2 rounded-full h-10 px-5 bg-foreground text-background hover:bg-foreground/90 text-sm disabled:opacity-50">
                {busy === "schedule" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save schedule
              </button>
              <p className="mt-2 text-xs text-muted-foreground">
                Committed on record: {usd(rollup.total_committed)} → {usd((rollup.total_committed * (Number(feePct) || 0)) / 100 / 4)} / quarter at {feePct || "0"}%.
              </p>
            </div>

            <div className="border border-foreground/10 rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-lg">Quarterly accruals</h3>
                <button onClick={generate} disabled={busy === "generate" || !initialSchedule}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-full border border-foreground/15 hover:bg-foreground/5 text-sm disabled:opacity-50">
                  {busy === "generate" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Generate for completed quarters
                </button>
              </div>
              {accruals.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No accruals yet. Save a schedule, then generate — one accrual per completed
                  quarter, idempotent. The ledger rebuild books them automatically.
                </p>
              ) : (
                <>
                  <table className="w-full text-xs">
                    <thead className="bg-foreground/5">
                      <tr>
                        {["Quarter end", "Base", "Fee", "Status", ""].map((h) => (
                          <th key={h} className="p-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {accruals.map((a) => (
                        <tr key={a.id} className="border-t border-foreground/5">
                          <td className="p-2 font-mono">{a.period_end}</td>
                          <td className="p-2 font-mono">{usd(a.base_amount)} · {pctStr(a.fee_pct)}</td>
                          <td className="p-2 font-mono">{usd(a.fee_amount)}</td>
                          <td className="p-2">
                            <span className={`font-mono text-[10px] uppercase px-1.5 py-0.5 rounded border ${
                              a.status === "paid" ? "text-emerald-700 border-emerald-500/30 bg-emerald-500/5"
                              : a.status === "waived" ? "text-muted-foreground border-foreground/10"
                              : "text-amber-700 border-amber-500/30 bg-amber-500/5"
                            }`}>{a.status}</span>
                          </td>
                          <td className="p-2 text-right space-x-2 whitespace-nowrap">
                            {a.status === "accrued" && (
                              <>
                                <button onClick={() => flipAccrual(a, "paid")} disabled={busy === a.id}
                                  className="font-mono text-[10px] uppercase text-emerald-700 hover:underline">paid</button>
                                <button onClick={() => flipAccrual(a, "waived")} disabled={busy === a.id}
                                  className="font-mono text-[10px] uppercase text-muted-foreground hover:underline">waive</button>
                              </>
                            )}
                            {a.status !== "accrued" && (
                              <button onClick={() => flipAccrual(a, "accrued")} disabled={busy === a.id}
                                className="font-mono text-[10px] uppercase text-muted-foreground hover:underline">reset</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Total accrued (excl. waived): {usd(accruedTotal)}. Rebuild the{" "}
                    <Link href="/dashboard/portfolio/fund/ledger" className="underline">ledger</Link>{" "}
                    to book these.
                  </p>
                </>
              )}
            </div>
          </div>

          {/* ── Waterfall ────────────────────────────────────────── */}
          <div className="space-y-6">
            <div className="border border-foreground/10 rounded-lg p-5">
              <h3 className="font-display text-lg mb-3 flex items-center gap-2">
                <Layers className="w-4 h-4" /> Distribution waterfall (European)
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <F label="Gross distributable (USD)">
                  <input type="number" value={gross} onChange={(e) => setGross(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm font-mono" />
                </F>
                <F label="Hurdle % (simple)">
                  <input type="number" step="0.5" value={hurdle} onChange={(e) => setHurdle(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm font-mono" />
                </F>
                <F label="Carry %">
                  <input type="number" step="1" value={carry} onChange={(e) => setCarry(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm font-mono" />
                </F>
                <F label="GP catch-up %">
                  <input type="number" step="5" value={catchUp} onChange={(e) => setCatchUp(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm font-mono" />
                </F>
              </div>
              <div className="mt-4 flex gap-3">
                <button onClick={() => runWaterfall(false)} disabled={busy === "wf-run" || !gross}
                  className="inline-flex items-center gap-2 rounded-full h-10 px-5 border border-foreground/15 hover:bg-foreground/5 text-sm disabled:opacity-50">
                  {busy === "wf-run" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Compute
                </button>
                <button onClick={() => runWaterfall(true)} disabled={busy === "wf-save" || !gross || !tablesReady}
                  className="inline-flex items-center gap-2 rounded-full h-10 px-5 bg-foreground text-background hover:bg-foreground/90 text-sm disabled:opacity-50">
                  {busy === "wf-save" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Compute &amp; save run
                </button>
              </div>

              {wf && (
                <div className="mt-5 space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                    <Tier label="Return of capital" v={usd(wf.totals.returnOfCapital)} />
                    <Tier label="Preferred return" v={usd(wf.totals.preferredReturn)} />
                    <Tier label="GP catch-up + carry" v={usd(wf.totals.totalToGp)} />
                    <Tier label="Net to LPs" v={usd(wf.totals.totalToLps)} strong />
                  </div>
                  <div className="overflow-x-auto border border-foreground/10 rounded-md">
                    <table className="w-full text-xs">
                      <thead className="bg-foreground/5">
                        <tr>
                          {["LP", "Called", "RoC", "Pref", "Split", "Net"].map((h) => (
                            <th key={h} className="p-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {wf.lps.map((l) => (
                          <tr key={l.fundLpId} className="border-t border-foreground/5">
                            <td className="p-2 truncate max-w-[160px]">{l.lpName}</td>
                            <td className="p-2 font-mono">{usd(l.calledCapital)}</td>
                            <td className="p-2 font-mono">{usd(l.returnOfCapital)}</td>
                            <td className="p-2 font-mono">{usd(l.preferredReturn)}</td>
                            <td className="p-2 font-mono">{usd(l.residualSplit)}</td>
                            <td className="p-2 font-mono font-medium">{usd(l.totalNet)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {wf.notes.map((n, i) => (
                    <p key={i} className="text-xs text-amber-700">{n}</p>
                  ))}
                  {lastRunId && (
                    <button onClick={() => prefill(lastRunId)} disabled={busy === `prefill-${lastRunId}`}
                      className="inline-flex items-center gap-2 rounded-full h-10 px-5 bg-emerald-600 text-white hover:bg-emerald-700 text-sm disabled:opacity-50">
                      {busy === `prefill-${lastRunId}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                      Create distribution draft from this run
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Run history */}
            {runs.length > 0 && (
              <div className="border border-foreground/10 rounded-lg p-5">
                <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Saved runs</h3>
                <table className="w-full text-xs">
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r.id} className="border-t border-foreground/5">
                        <td className="p-2 font-mono">#{r.run_number}</td>
                        <td className="p-2 font-mono">{usd(r.outputs.totals.gross)} gross</td>
                        <td className="p-2 font-mono">{usd(r.outputs.totals.totalToGp)} GP</td>
                        <td className="p-2 font-mono text-muted-foreground">{r.created_at.slice(0, 10)}</td>
                        <td className="p-2 text-right">
                          {r.distribution_id ? (
                            <Link href={`/dashboard/portfolio/fund/distributions/${r.distribution_id}`}
                              className="font-mono text-[10px] uppercase text-emerald-700 hover:underline">
                              distribution →
                            </Link>
                          ) : (
                            <button onClick={() => prefill(r.id)} disabled={busy === `prefill-${r.id}`}
                              className="font-mono text-[10px] uppercase text-muted-foreground hover:text-foreground hover:underline">
                              pre-fill draft
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  )
}

function Tier({ label, v, strong }: { label: string; v: string; strong?: boolean }) {
  return (
    <div className={`p-3 rounded-md border ${strong ? "border-emerald-500/30 bg-emerald-500/5" : "border-foreground/10"}`}>
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className={`font-display ${strong ? "text-lg" : "text-base"}`}>{v}</div>
    </div>
  )
}
