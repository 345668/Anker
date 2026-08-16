"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, Check, Download, ShieldCheck } from "lucide-react"
import type { Valuation409aFull } from "@/lib/modules/valuation-409a"
import { compute409a, type OpmInputs } from "@/lib/modules/opm-409a"

const ACCENT = "#e5380f"
const money = (v: number) => {
  const s = v < 0 ? "-" : ""; const a = Math.abs(v)
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`
  return `${s}$${Math.round(a).toLocaleString()}`
}
const usd4 = (v: number) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
const fmtD = (s: string | null) => (s ? new Date(s + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—")
const num = (s: string, d = 0) => { const n = Number(String(s).replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : d }

const STATUS: Record<string, { label: string; cls: string }> = {
  requested: { label: "Requested", cls: "bg-foreground/[0.06] text-muted-foreground" },
  in_progress: { label: "In progress", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  completed: { label: "Completed", cls: "bg-[#e5380f]/10 text-[#e5380f]" },
  board_approved: { label: "Board approved", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  expired: { label: "Expired", cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
}

export function Valuation409aDetailClient({ initial }: { initial: Valuation409aFull }) {
  const [rec, setRec] = useState(initial)
  const [busy, setBusy] = useState<null | "save" | "approve">(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [f, setF] = useState({
    commonShares: String(initial.common_shares ?? 8_000_000),
    preferredShares: String(initial.preferred_shares ?? 2_000_000),
    liquidationPref: String(initial.liquidation_pref ?? 2_000_000),
    recentPrice: String(initial.recent_price ?? 1),
    volatility: String(initial.volatility ?? 0.6),
    riskFreeRate: String(initial.risk_free_rate ?? 0.04),
    yearsToLiquidity: String(initial.years_to_liquidity ?? 4),
    dlom: String(initial.dlom ?? 0.25),
  })

  const inputs: OpmInputs = useMemo(() => ({
    commonShares: num(f.commonShares), preferredShares: num(f.preferredShares),
    liquidationPref: num(f.liquidationPref), recentPrice: num(f.recentPrice),
    volatility: num(f.volatility, 0.6), riskFreeRate: num(f.riskFreeRate, 0.04),
    yearsToLiquidity: num(f.yearsToLiquidity, 4), dlom: num(f.dlom, 0.25),
  }), [f])

  const valid = inputs.commonShares > 0 && inputs.preferredShares > 0 && inputs.recentPrice > 0
  const result = useMemo(() => (valid ? compute409a(inputs) : null), [inputs, valid])

  async function save() {
    if (!result) return
    setBusy("save"); setSaved(null)
    try {
      const res = await fetch(`/api/valuations-409a/${rec.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ inputs }) })
      const d = await res.json()
      if (d.valuation) { setRec(d.valuation); setSaved("Saved — status set to Completed.") }
    } finally { setBusy(null) }
  }
  async function approve() {
    setBusy("approve")
    try {
      const res = await fetch(`/api/valuations-409a/${rec.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "board_approved" }) })
      const d = await res.json()
      if (d.valuation) setRec(d.valuation)
    } finally { setBusy(null) }
  }

  function downloadReport() {
    if (!result) return
    const blob = new Blob([buildReport(inputs, result, rec)], { type: "text/markdown;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = `409a-valuation-${rec.id.slice(0, 8)}.md`; a.click()
    URL.revokeObjectURL(url)
  }

  const st = STATUS[rec.status]
  const input = "w-full h-9 px-3 text-sm border border-foreground/15 rounded-md bg-background outline-none focus:border-foreground/40 tabular-nums"

  return (
    <div className="px-6 lg:px-8 py-8 lg:py-10 max-w-5xl">
      <Link href="/dashboard/valuations-409a" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-5">
        <ArrowLeft className="w-4 h-4" /> Valuations (409A)
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            <span className="w-2.5 h-2.5" style={{ background: ACCENT }} /> Equity Suite · 409A · Option Pricing Method
          </div>
          <h1 className="text-3xl font-display tracking-tight">Common stock 409A valuation</h1>
          <p className="mt-1 text-sm text-muted-foreground">Backsolve total equity value from the last preferred price, then allocate to common with a DLOM.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${st.cls}`}>{st.label}</span>
          {rec.valued_at && <span className="text-xs text-muted-foreground">as of {fmtD(rec.valued_at)}</span>}
        </div>
      </div>

      {/* Headline result */}
      {result && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-px bg-foreground/10 border border-foreground/10 rounded-md overflow-hidden mb-8">
          <div className="bg-background px-5 py-5">
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">409A common FMV</div>
            <div className="mt-1 text-3xl font-display tabular-nums" style={{ color: ACCENT }}>{usd4(result.commonFmv)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{Math.round((result.commonFmv / inputs.recentPrice) * 100)}% of last preferred</div>
          </div>
          <Tile label="Common (marketable)" value={usd4(result.commonPerShareMarketable)} sub="before DLOM" />
          <Tile label="Equity value (backsolved)" value={money(result.equityValue)} sub={`vs ${money(result.impliedPostMoney)} naive post`} />
          <Tile label="Common allocation" value={money(result.commonValue)} sub={`preferred ${money(result.preferredValue)}`} />
        </section>
      )}

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Inputs */}
        <section className="space-y-5">
          <div className="border border-foreground/10 rounded-xl p-5">
            <h2 className="font-display text-lg tracking-tight mb-4">Cap table</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Common shares (incl. options)"><input value={f.commonShares} onChange={(e) => setF({ ...f, commonShares: e.target.value })} className={input} /></Field>
              <Field label="Preferred shares"><input value={f.preferredShares} onChange={(e) => setF({ ...f, preferredShares: e.target.value })} className={input} /></Field>
              <Field label="Liquidation preference ($)"><input value={f.liquidationPref} onChange={(e) => setF({ ...f, liquidationPref: e.target.value })} className={input} /></Field>
              <Field label="Last preferred price ($/sh)"><input value={f.recentPrice} onChange={(e) => setF({ ...f, recentPrice: e.target.value })} className={input} /></Field>
            </div>
          </div>
          <div className="border border-foreground/10 rounded-xl p-5">
            <h2 className="font-display text-lg tracking-tight mb-4">OPM assumptions</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Volatility (e.g. 0.60)"><input value={f.volatility} onChange={(e) => setF({ ...f, volatility: e.target.value })} className={input} /></Field>
              <Field label="Risk-free rate (e.g. 0.04)"><input value={f.riskFreeRate} onChange={(e) => setF({ ...f, riskFreeRate: e.target.value })} className={input} /></Field>
              <Field label="Years to liquidity"><input value={f.yearsToLiquidity} onChange={(e) => setF({ ...f, yearsToLiquidity: e.target.value })} className={input} /></Field>
              <Field label="DLOM (e.g. 0.25)"><input value={f.dlom} onChange={(e) => setF({ ...f, dlom: e.target.value })} className={input} /></Field>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={save} disabled={!result || busy === "save"} className="inline-flex items-center gap-2 h-10 px-4 text-sm rounded-md text-white disabled:opacity-50" style={{ background: ACCENT }}>
              {busy === "save" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save valuation
            </button>
            <button onClick={approve} disabled={rec.status !== "completed" || busy === "approve"} className="inline-flex items-center gap-2 h-10 px-4 text-sm rounded-md border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/5 disabled:opacity-40" title="Records board approval + a 12-month safe-harbor expiry">
              {busy === "approve" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Board approve
            </button>
            <button onClick={downloadReport} disabled={!result} className="inline-flex items-center gap-2 h-10 px-4 text-sm rounded-md border border-foreground/15 hover:border-foreground/40 disabled:opacity-40">
              <Download className="w-4 h-4" /> Report
            </button>
            {saved && <span className="text-sm text-emerald-600 dark:text-emerald-400">{saved}</span>}
          </div>
        </section>

        {/* Allocation + methodology */}
        <section className="space-y-5">
          {result && (
            <div className="border border-foreground/10 rounded-xl p-5">
              <h2 className="font-display text-lg tracking-tight mb-1">Breakpoint allocation</h2>
              <p className="text-xs text-muted-foreground mb-3">Equity modelled as call options at each economic breakpoint.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-foreground/10 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                      <th className="text-left py-2">Tranche</th><th className="text-right py-2">Range</th>
                      <th className="text-right py-2">Common</th><th className="text-right py-2">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.tranches.map((t) => (
                      <tr key={t.label} className="border-b border-foreground/[0.06] last:border-0">
                        <td className="py-2">{t.label}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">{money(t.from)}–{t.to == null ? "∞" : money(t.to)}</td>
                        <td className="py-2 text-right tabular-nums">{t.toCommon}%</td>
                        <td className="py-2 text-right tabular-nums font-medium">{money(t.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">Conversion breakpoint (preferred converts): <span className="text-foreground tabular-nums">{money(result.breakpoints.conversion)}</span></div>
            </div>
          )}
          <div className="border border-foreground/10 rounded-xl p-5">
            <h2 className="font-display text-lg tracking-tight mb-3">Methodology</h2>
            <div className="text-sm text-muted-foreground leading-relaxed space-y-2">
              <p>The fair market value of common stock is estimated with the <strong>Option Pricing Method (OPM)</strong> under a backsolve calibration to the most recent preferred financing.</p>
              <p>Total equity value is treated as a series of European call options on the company&apos;s equity, struck at the breakpoints where each share class&apos;s economics change. The Black-Scholes model prices each tranche using the assumed volatility, risk-free rate, and expected time to a liquidity event.</p>
              <p>The equity value is solved so that the OPM value of the preferred equals its purchase price ({usd4(inputs.recentPrice)} × {inputs.preferredShares.toLocaleString()} shares). The residual common value is divided by common shares and discounted for lack of marketability (DLOM) to reach the 409A value.</p>
              <p className="text-[11px]">This is a model-based estimate for planning; a safe-harbor 409A requires an independent appraisal.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-background px-5 py-5">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-display tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1.5"><span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{label}</span>{children}</label>
}

function buildReport(i: OpmInputs, r: ReturnType<typeof compute409a>, rec: Valuation409aFull): string {
  const d = new Date().toISOString().slice(0, 10)
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`
  return [
    `# 409A Common Stock Valuation — Option Pricing Method`,
    ``,
    `Generated ${d} · status: ${rec.status}${rec.valued_at ? ` · valued as of ${rec.valued_at}` : ""}`,
    ``,
    `## Result`,
    ``,
    `- **409A common FMV: $${r.commonFmv.toFixed(4)}** per share (${Math.round((r.commonFmv / i.recentPrice) * 100)}% of last preferred price)`,
    `- Common per share (marketable, pre-DLOM): $${r.commonPerShareMarketable.toFixed(4)}`,
    `- Backsolved total equity value: $${r.equityValue.toLocaleString()}`,
    `- Common value: $${r.commonValue.toLocaleString()} · Preferred value: $${r.preferredValue.toLocaleString()}`,
    ``,
    `## Inputs`,
    ``,
    `| Input | Value |`,
    `|---|---|`,
    `| Common shares (incl. options) | ${i.commonShares.toLocaleString()} |`,
    `| Preferred shares | ${i.preferredShares.toLocaleString()} |`,
    `| Liquidation preference | $${i.liquidationPref.toLocaleString()} |`,
    `| Last preferred price | $${i.recentPrice.toFixed(4)} |`,
    `| Volatility | ${pct(i.volatility)} |`,
    `| Risk-free rate | ${pct(i.riskFreeRate)} |`,
    `| Years to liquidity | ${i.yearsToLiquidity} |`,
    `| DLOM | ${pct(i.dlom)} |`,
    ``,
    `## Breakpoint allocation`,
    ``,
    `| Tranche | Range | Common % | Value |`,
    `|---|---|---|---|`,
    ...r.tranches.map((t) => `| ${t.label} | $${t.from.toLocaleString()}–${t.to == null ? "∞" : "$" + t.to.toLocaleString()} | ${t.toCommon}% | $${t.value.toLocaleString()} |`),
    ``,
    `Preferred conversion breakpoint: $${r.breakpoints.conversion.toLocaleString()}`,
    ``,
    `## Methodology`,
    ``,
    `Total equity value is modelled as call options on the company's equity struck at the breakpoints where share-class economics change (liquidation preference, then as-converted participation). Each tranche is priced with Black-Scholes using the assumptions above. Equity value is solved so the OPM value of preferred equals its purchase price; the residual common value is divided by common shares and discounted for lack of marketability.`,
    ``,
    `_Model-based estimate for planning. A safe-harbor 409A requires an independent appraisal._`,
  ].join("\n")
}
