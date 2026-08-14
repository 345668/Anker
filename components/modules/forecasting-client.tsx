"use client"

import { useMemo, useState } from "react"

export type ForecastBase = {
  size: number; invested: number; called: number; distributed: number; navFV: number; grossMoic: number | null
}

const money = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${Math.round(v).toLocaleString()}`)
const mult = (v: number) => `${v.toFixed(2)}×`

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

  const dryPowder = Math.max(0, base.size - base.invested)
  const deployable = dryPowder * (deployPct / 100)

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

      <p className="text-xs text-muted-foreground">
        Projections extend the live book ({money(base.navFV)} NAV · {money(base.called)} called · {money(base.distributed)} distributed) under each assumption. Directional planning only — not a forecast of returns.
      </p>
    </div>
  )
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
