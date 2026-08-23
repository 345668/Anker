"use client"

import { useMemo, useState } from "react"
import { runMonteCarlo } from "@/lib/portfolio/monte-carlo"

export type ForecastBase = {
  size: number; invested: number; called: number; distributed: number; navFV: number; grossMoic: number | null
}

const money = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${Math.round(v).toLocaleString()}`)
const mult = (v: number) => `${v.toFixed(2)}×`
const pctLabel = (v: number) => `${Math.round(v * 100)}%`

/**
 * Interactive fund-forecasting scenario modeler. Projects value, TVPI, DPI, and
 * MOIC forward from the live book under downside / base / upside assumptions,
 * with adjustable deployment pace, reserve ratio, and per-scenario exit multiple.
 */
export function ForecastingClient({ base }: { base: ForecastBase }) {
  const baseMoic = base.grossMoic ?? 2.0
  const [deployPct, setDeployPct] = useState(100)   // % of dry powder deployed
  const [reservePct, setReservePct] = useState(30)  // % held as follow-on reserve
  const [multiples, setMultiples] = useState({ downside: Math.max(1, baseMoic * 0.6), base: baseMoic, upside: baseMoic * 1.6 })
  const [uncertainty, setUncertainty] = useState(60) // lognormal σ×100

  const dryPowder = Math.max(0, base.size - base.invested)
  const deployable = dryPowder * (deployPct / 100)

  // Monte-Carlo: treat the base-case exit multiple as the lognormal median and the
  // uncertainty slider as σ. Runs client-side (pure, seeded, fast).
  const mc = useMemo(() => runMonteCarlo({
    navFV: base.navFV, called: base.called, distributed: base.distributed, invested: base.invested,
    deployable, reservePct, medianMultiple: multiples.base, sigma: uncertainty / 100, trials: 10_000, seed: 1,
  }), [base, deployable, reservePct, multiples.base, uncertainty])

  const scenarios = useMemo(() => (["downside", "base", "upside"] as const).map((k) => {
    const m = multiples[k]
    // New capital returns at the scenario multiple; reserves compound onto the current book at the same multiple.
    const newCapValue = deployable * m
    const reserveBoost = base.navFV * (reservePct / 100) * (m - 1) * 0.5
    const projValue = base.navFV + newCapValue + reserveBoost
    const tvpi = base.called > 0 ? (projValue + base.distributed) / base.called : 0
    const moic = base.invested + deployable > 0 ? (projValue + base.distributed) / (base.invested + deployable) : 0
    return { key: k, multiple: m, projValue, tvpi, moic }
  }), [multiples, deployable, reservePct, base])

  const dpi = base.called > 0 ? base.distributed / base.called : 0
  const maxVal = Math.max(1, ...scenarios.map((s) => s.projValue))
  const COLOR: Record<string, string> = { downside: "#e5380f", base: "#2f45e0", upside: "#10b981" }
  const LABEL: Record<string, string> = { downside: "Downside", base: "Base", upside: "Upside" }

  return (
    <div className="space-y-6">
      {/* Assumptions */}
      <div className="border border-foreground/10 rounded-xl p-5 lg:p-6">
        <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-4">Assumptions</div>
        <div className="grid sm:grid-cols-2 gap-6 mb-5">
          <Slider label="Deploy remaining commitments" value={deployPct} setValue={setDeployPct} suffix="%" hint={`${money(deployable)} of ${money(dryPowder)} dry powder`} />
          <Slider label="Follow-on reserve" value={reservePct} setValue={setReservePct} suffix="%" hint="held for existing winners" />
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          {(["downside", "base", "upside"] as const).map((k) => (
            <label key={k} className="flex flex-col gap-1.5">
              <span className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: COLOR[k] }} /> {LABEL[k]} exit multiple
              </span>
              <div className="flex items-center rounded-lg border border-foreground/15 overflow-hidden max-w-[140px]">
                <input value={multiples[k].toFixed(2)} onChange={(e) => setMultiples((m) => ({ ...m, [k]: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 }))} inputMode="decimal" className="flex-1 px-3 py-2 text-sm tabular-nums bg-transparent focus:outline-none" />
                <span className="px-2 py-2 bg-foreground/[0.04] text-muted-foreground text-sm">×</span>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Projection */}
      <div className="grid lg:grid-cols-3 gap-4">
        {scenarios.map((s) => (
          <div key={s.key} className="border border-foreground/10 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLOR[s.key] }} />
              <span className="text-sm font-semibold">{LABEL[s.key]}</span>
              <span className="text-xs text-muted-foreground ml-auto">{mult(s.multiple)} on new capital</span>
            </div>
            <div className="space-y-3">
              <Row label="Projected value" value={money(s.projValue)} big />
              <Row label="Projected TVPI" value={mult(s.tvpi)} />
              <Row label="Projected MOIC" value={mult(s.moic)} />
              <Row label="DPI (today)" value={mult(dpi)} muted />
            </div>
            <div className="mt-4 h-1.5 rounded-full bg-foreground/10 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${(s.projValue / maxVal) * 100}%`, backgroundColor: COLOR[s.key] }} />
            </div>
          </div>
        ))}
      </div>

      {/* Monte-Carlo */}
      <div className="border border-foreground/10 rounded-xl p-5 lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Monte-Carlo · {mc.trials.toLocaleString()} trials</div>
            <div className="text-sm text-muted-foreground mt-0.5">Base multiple {mult(multiples.base)} as the median; outcomes drawn from a lognormal.</div>
          </div>
          <div className="w-full sm:w-64">
            <Slider label="Uncertainty (σ)" value={uncertainty} setValue={setUncertainty} suffix="%" hint="spread of the return distribution" />
          </div>
        </div>

        {/* Probabilities */}
        <div className="grid grid-cols-3 gap-px bg-foreground/10 border border-foreground/10 rounded-lg overflow-hidden mb-5">
          <McTile label="P(return capital ≥ 1×)" value={pctLabel(mc.probReturnCapital)} tone="emerald" />
          <McTile label="P(home run ≥ 3×)" value={pctLabel(mc.probHomeRun)} tone="blue" />
          <McTile label="P(loss < 1×)" value={pctLabel(mc.probLoss)} tone={mc.probLoss > 0.2 ? "rose" : undefined} />
        </div>

        {/* TVPI percentile fan */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          <Row label="TVPI · P10 (downside)" value={mult(mc.tvpi.p10)} />
          <Row label="TVPI · P50 (median)" value={mult(mc.tvpi.p50)} big />
          <Row label="TVPI · P90 (upside)" value={mult(mc.tvpi.p90)} />
          <Row label="TVPI · mean" value={mult(mc.tvpi.mean)} muted />
        </div>

        {/* TVPI distribution histogram */}
        <div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-2">TVPI distribution</div>
          <div className="flex items-end gap-0.5 h-28">
            {(() => {
              const maxC = Math.max(1, ...mc.histogram.map((h) => h.count))
              return mc.histogram.map((h, i) => {
                const inMedianBucket = mc.tvpi.p50 >= h.from && mc.tvpi.p50 < h.to
                return (
                  <div key={i} className="flex-1 h-full group relative flex items-end" title={`${h.from.toFixed(1)}–${h.to.toFixed(1)}× · ${h.count} trials`}>
                    <div className="w-full rounded-t transition-all" style={{ height: `${Math.max(1, (h.count / maxC) * 100)}%`, backgroundColor: inMedianBucket ? "#2f45e0" : "rgb(128 128 128 / 0.35)" }} />
                  </div>
                )
              })
            })()}
          </div>
          <div className="flex justify-between mt-1 text-[10px] tabular-nums text-muted-foreground">
            <span>{mult(mc.histogram[0]?.from ?? 0)}</span>
            <span>{mult(mc.tvpi.p50)} median</span>
            <span>{mult(mc.histogram[mc.histogram.length - 1]?.to ?? 0)}</span>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Projections extend the live book ({money(base.navFV)} NAV · {money(base.called)} called · {money(base.distributed)} distributed) under each assumption. The Monte-Carlo model draws the blended exit multiple from a lognormal (base multiple as median, σ from the uncertainty slider). Directional planning only — not a forecast of returns.
      </p>
    </div>
  )
}

function McTile({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "blue" | "rose" }) {
  const c = tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" : tone === "blue" ? "text-[#2f45e0]" : tone === "rose" ? "text-rose-600 dark:text-rose-400" : ""
  return <div className="bg-background p-3.5"><div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div><div className={`mt-1 text-lg font-semibold tabular-nums ${c}`}>{value}</div></div>
}

function Slider({ label, value, setValue, suffix, hint }: { label: string; value: number; setValue: (n: number) => void; suffix: string; hint?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm tabular-nums text-muted-foreground">{value}{suffix}</span>
      </div>
      <input type="range" min={0} max={100} value={value} onChange={(e) => setValue(Number(e.target.value))} className="w-full accent-[#2f45e0]" />
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}
function Row({ label, value, big, muted }: { label: string; value: string; big?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={`text-sm ${muted ? "text-muted-foreground" : ""}`}>{label}</span>
      <span className={`tabular-nums ${big ? "text-lg font-semibold" : "font-medium"} ${muted ? "text-muted-foreground" : ""}`}>{value}</span>
    </div>
  )
}
