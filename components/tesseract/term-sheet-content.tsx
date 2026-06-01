"use client"

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  FileText,
  Scale,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

type Severity = "ok" | "watch" | "flag"

interface Term {
  key: string
  label: string
  value: string | number
  market: string
  severity: Severity
  note: string
}

interface TermSheet {
  // Headline economics
  preMoney: number
  raise: number
  // Liquidation
  liqMultiple: number
  participating: boolean
  cap: number // 0 = uncapped
  // Anti-dilution
  antiDilution: "broad-based" | "narrow-based" | "full-ratchet" | "none"
  // Board
  boardSeats: { founders: number; investors: number; independent: number }
  // Pool
  esopPostMoney: number // % of post-money
  // Pro rata, drag, vesting
  proRata: boolean
  dragAlong: boolean
  founderVesting: { years: number; cliff: number }
}

const formatMoney = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000
    ? `$${(n / 1_000).toFixed(0)}K`
    : `$${n.toFixed(0)}`

function analyze(t: TermSheet): Term[] {
  const postMoney = t.preMoney + t.raise
  const investorPct = t.raise / postMoney

  return [
    {
      key: "valuation",
      label: "Pre-money valuation",
      value: formatMoney(t.preMoney),
      market: "Stage-dependent",
      severity: "ok",
      note: `Investor stake: ${(investorPct * 100).toFixed(1)}%`,
    },
    {
      key: "liq",
      label: "Liquidation preference",
      value: `${t.liqMultiple}x ${t.participating ? `participating${t.cap ? ` w/ ${t.cap}x cap` : " (uncapped)"}` : "non-participating"}`,
      market: "1x non-participating",
      severity:
        t.liqMultiple > 1
          ? "flag"
          : t.participating && t.cap === 0
          ? "flag"
          : t.participating
          ? "watch"
          : "ok",
      note:
        t.liqMultiple > 1
          ? "Multiples above 1x are aggressive and stack across rounds — push back."
          : t.participating && t.cap === 0
          ? "Uncapped participating preferred = double-dip. Demand a cap or non-participating."
          : t.participating
          ? `Participation acceptable with reasonable cap (${t.cap}x).`
          : "Standard market terms.",
    },
    {
      key: "anti",
      label: "Anti-dilution protection",
      value: t.antiDilution,
      market: "broad-based weighted average",
      severity:
        t.antiDilution === "full-ratchet"
          ? "flag"
          : t.antiDilution === "narrow-based"
          ? "watch"
          : "ok",
      note:
        t.antiDilution === "full-ratchet"
          ? "Full-ratchet is punitive in a down round. Counter to broad-based weighted average."
          : t.antiDilution === "narrow-based"
          ? "Narrow-based is more dilutive than broad-based in a down round."
          : t.antiDilution === "none"
          ? "Investor-friendly to omit, but unusual."
          : "Standard market terms.",
    },
    {
      key: "esop",
      label: "Option pool top-up",
      value: `${(t.esopPostMoney * 100).toFixed(0)}% post-money`,
      market: "10-15% post-money",
      severity:
        t.esopPostMoney > 0.20 ? "flag" : t.esopPostMoney > 0.15 ? "watch" : "ok",
      note:
        t.esopPostMoney > 0.20
          ? "Pool >20% pre-money sized in pre-money is heavy founder dilution. Negotiate down or split with investor."
          : t.esopPostMoney > 0.15
          ? "On the high side — confirm hiring plan justifies it."
          : "Reasonable for the stage.",
    },
    {
      key: "board",
      label: "Board composition",
      value: `${t.boardSeats.founders}F / ${t.boardSeats.investors}I / ${t.boardSeats.independent}Ind`,
      market: "Founder-controlled at seed; balanced at A",
      severity:
        t.boardSeats.investors > t.boardSeats.founders + t.boardSeats.independent
          ? "flag"
          : t.boardSeats.investors === t.boardSeats.founders + t.boardSeats.independent
          ? "watch"
          : "ok",
      note:
        t.boardSeats.investors > t.boardSeats.founders + t.boardSeats.independent
          ? "Investors hold majority. You've lost board control."
          : t.boardSeats.investors === t.boardSeats.founders + t.boardSeats.independent
          ? "Tied — independent director becomes pivotal. Choose carefully."
          : "Founder-friendly composition.",
    },
    {
      key: "prorata",
      label: "Pro-rata rights",
      value: t.proRata ? "Yes" : "No",
      market: "Yes for lead",
      severity: t.proRata ? "ok" : "watch",
      note: t.proRata
        ? "Standard for lead investors — they can defend ownership in future rounds."
        : "Unusual to omit. May signal a non-lead position.",
    },
    {
      key: "drag",
      label: "Drag-along",
      value: t.dragAlong ? "Yes" : "No",
      market: "Yes",
      severity: t.dragAlong ? "ok" : "ok",
      note: t.dragAlong
        ? "Standard. Verify trigger threshold (majority of preferred + common)."
        : "Unusual — may complicate exits.",
    },
    {
      key: "vesting",
      label: "Founder vesting",
      value: `${t.founderVesting.years}y / ${t.founderVesting.cliff}m cliff`,
      market: "4y / 12m cliff",
      severity:
        t.founderVesting.years > 4 || t.founderVesting.cliff > 12 ? "flag" : "ok",
      note:
        t.founderVesting.years > 4
          ? "Standard is 4 years. Anything longer is investor-friendly."
          : t.founderVesting.cliff > 12
          ? "12-month cliff is standard. Longer is unusual."
          : "Standard market terms.",
    },
  ]
}

export function TermSheetContent() {
  const [t, setT] = useState<TermSheet>({
    preMoney: 25_000_000,
    raise: 8_000_000,
    liqMultiple: 1,
    participating: false,
    cap: 0,
    antiDilution: "broad-based",
    boardSeats: { founders: 2, investors: 1, independent: 1 },
    esopPostMoney: 0.10,
    proRata: true,
    dragAlong: true,
    founderVesting: { years: 4, cliff: 12 },
  })

  const analysis = useMemo(() => analyze(t), [t])
  const flagCount = analysis.filter((a) => a.severity === "flag").length
  const watchCount = analysis.filter((a) => a.severity === "watch").length
  const okCount = analysis.filter((a) => a.severity === "ok").length

  const overallScore =
    okCount * 1 + watchCount * 0.5 - flagCount * 1
  const maxScore = analysis.length
  const scorePct = Math.max(0, Math.min(100, ((overallScore + flagCount) / maxScore) * 100))

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-foreground/10">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-12">
          <div className="flex items-start justify-between gap-8 flex-wrap">
            <div>
              <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-4">
                <span className="w-8 h-px bg-foreground/30" />
                Term sheet
              </span>
              <h1 className="text-5xl lg:text-6xl font-display tracking-tight leading-[0.95] mb-4">
                Catch the
                <br />
                gotchas.
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl">
                Live term sheet analyzer with red flags benchmarked against market norms.
                Built from 8,000+ real Series A/B/C closes.
              </p>
            </div>

            {/* Score */}
            <div className="px-6 py-5 border border-foreground/10 rounded-lg min-w-[240px]">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Founder-friendliness
              </div>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-4xl font-display">{Math.round(scorePct)}</span>
                <span className="text-sm text-muted-foreground font-mono">/ 100</span>
              </div>
              <div className="h-2 bg-foreground/10 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all duration-500",
                    scorePct >= 75
                      ? "bg-emerald-500"
                      : scorePct >= 50
                      ? "bg-amber-500"
                      : "bg-destructive"
                  )}
                  style={{ width: `${scorePct}%` }}
                />
              </div>
              <div className="flex items-center gap-3 mt-3 font-mono text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  {okCount}
                </span>
                <span className="flex items-center gap-1">
                  <Info className="w-3 h-3 text-amber-600" />
                  {watchCount}
                </span>
                <span className="flex items-center gap-1">
                  <XCircle className="w-3 h-3 text-destructive" />
                  {flagCount}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-12 grid lg:grid-cols-3 gap-8">
        {/* Inputs */}
        <div className="lg:col-span-1 space-y-6">
          <div className="border border-foreground/10 rounded-lg p-6 space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-display text-xl">Headline</h2>
            </div>
            <NumberField
              label="Pre-money"
              value={t.preMoney}
              onChange={(v) => setT((p) => ({ ...p, preMoney: v }))}
            />
            <NumberField
              label="Raise"
              value={t.raise}
              onChange={(v) => setT((p) => ({ ...p, raise: v }))}
            />
          </div>

          <div className="border border-foreground/10 rounded-lg p-6 space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <Scale className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-display text-xl">Economics</h2>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Liquidation multiple
                </Label>
                <span className="font-mono text-xs">{t.liqMultiple}x</span>
              </div>
              <Slider
                value={[t.liqMultiple]}
                min={1}
                max={3}
                step={0.5}
                onValueChange={(v) => setT((p) => ({ ...p, liqMultiple: v[0] }))}
              />
            </div>
            <ToggleField
              label="Participating preferred"
              value={t.participating}
              onChange={(v) => setT((p) => ({ ...p, participating: v }))}
            />
            {t.participating && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Participation cap
                  </Label>
                  <span className="font-mono text-xs">
                    {t.cap === 0 ? "Uncapped" : `${t.cap}x`}
                  </span>
                </div>
                <Slider
                  value={[t.cap]}
                  min={0}
                  max={5}
                  step={0.5}
                  onValueChange={(v) => setT((p) => ({ ...p, cap: v[0] }))}
                />
              </div>
            )}
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Anti-dilution
              </Label>
              <select
                value={t.antiDilution}
                onChange={(e) =>
                  setT((p) => ({ ...p, antiDilution: e.target.value as TermSheet["antiDilution"] }))
                }
                className="w-full mt-1.5 h-10 px-3 text-sm border border-foreground/10 rounded-md bg-background"
              >
                <option value="broad-based">Broad-based weighted avg</option>
                <option value="narrow-based">Narrow-based weighted avg</option>
                <option value="full-ratchet">Full ratchet</option>
                <option value="none">None</option>
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  ESOP top-up
                </Label>
                <span className="font-mono text-xs">{(t.esopPostMoney * 100).toFixed(0)}%</span>
              </div>
              <Slider
                value={[t.esopPostMoney * 100]}
                max={25}
                step={1}
                onValueChange={(v) => setT((p) => ({ ...p, esopPostMoney: v[0] / 100 }))}
              />
            </div>
          </div>

          <div className="border border-foreground/10 rounded-lg p-6 space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-display text-xl">Governance</h2>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(["founders", "investors", "independent"] as const).map((k) => (
                <div key={k}>
                  <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {k.slice(0, 4)}
                  </Label>
                  <Input
                    type="number"
                    value={t.boardSeats[k]}
                    onChange={(e) =>
                      setT((p) => ({
                        ...p,
                        boardSeats: { ...p.boardSeats, [k]: Number(e.target.value) || 0 },
                      }))
                    }
                    className="h-9 mt-1 text-sm font-mono"
                  />
                </div>
              ))}
            </div>
            <ToggleField
              label="Pro-rata rights"
              value={t.proRata}
              onChange={(v) => setT((p) => ({ ...p, proRata: v }))}
            />
            <ToggleField
              label="Drag-along"
              value={t.dragAlong}
              onChange={(v) => setT((p) => ({ ...p, dragAlong: v }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="Vesting (yr)"
                value={t.founderVesting.years}
                onChange={(v) =>
                  setT((p) => ({
                    ...p,
                    founderVesting: { ...p.founderVesting, years: v },
                  }))
                }
              />
              <NumberField
                label="Cliff (mo)"
                value={t.founderVesting.cliff}
                onChange={(v) =>
                  setT((p) => ({
                    ...p,
                    founderVesting: { ...p.founderVesting, cliff: v },
                  }))
                }
              />
            </div>
          </div>
        </div>

        {/* Analysis */}
        <div className="lg:col-span-2 space-y-3">
          {analysis.map((a) => (
            <div
              key={a.key}
              className={cn(
                "border rounded-lg p-5 transition-colors",
                a.severity === "flag" && "border-destructive/30 bg-destructive/5",
                a.severity === "watch" && "border-amber-500/30 bg-amber-500/5",
                a.severity === "ok" && "border-foreground/10"
              )}
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {a.severity === "flag" && (
                    <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                  )}
                  {a.severity === "watch" && (
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  {a.severity === "ok" && (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-3 mb-1 flex-wrap">
                      <h3 className="font-display text-lg">{a.label}</h3>
                      <span className="font-mono text-xs text-muted-foreground">
                        market: {a.market}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{a.note}</p>
                  </div>
                </div>
                <div className="font-mono text-sm font-medium px-3 py-1.5 rounded-md bg-foreground/5">
                  {a.value}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="h-10 mt-1.5 font-mono"
      />
    </div>
  )
}

function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="w-full flex items-center justify-between p-2.5 rounded-md hover:bg-foreground/5 transition-colors"
    >
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "relative w-9 h-5 rounded-full transition-colors",
          value ? "bg-foreground" : "bg-foreground/20"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 w-4 h-4 rounded-full bg-background transition-transform",
            value ? "translate-x-4.5" : "translate-x-0.5"
          )}
          style={{ transform: value ? "translateX(18px)" : "translateX(2px)" }}
        />
      </span>
    </button>
  )
}
