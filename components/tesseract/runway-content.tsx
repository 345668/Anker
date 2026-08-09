"use client"

import { PageHeader } from "@/components/shell/page-header"
import { useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Flame, AlertTriangle, Calendar, Wallet, TrendingUp } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

interface ScenarioInput {
  cashOnHand: number
  monthlyBurn: number
  burnGrowth: number // monthly % growth in burn
  monthlyRevenue: number
  revenueGrowth: number // monthly % growth in revenue
  newRaiseMonth: number // when (months from now) a planned round closes; 0 = none
  newRaiseAmount: number
}

const formatMoney = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000
    ? `$${(n / 1_000).toFixed(0)}K`
    : `$${n.toFixed(0)}`

const monthsToReadable = (m: number) => {
  if (!isFinite(m) || m > 240) return "∞"
  const years = Math.floor(m / 12)
  const months = Math.round(m - years * 12)
  if (years === 0) return `${months} mo`
  if (months === 0) return `${years}y`
  return `${years}y ${months}m`
}

function project(input: ScenarioInput, horizonMonths: number) {
  const points: { month: number; cash: number; burn: number; revenue: number; netBurn: number }[] = []
  let cash = input.cashOnHand
  let burn = input.monthlyBurn
  let revenue = input.monthlyRevenue
  let zeroMonth: number | null = null

  for (let m = 0; m <= horizonMonths; m++) {
    if (m === input.newRaiseMonth && input.newRaiseAmount > 0) {
      cash += input.newRaiseAmount
    }
    const netBurn = Math.max(0, burn - revenue)
    points.push({ month: m, cash, burn, revenue, netBurn })
    if (cash <= 0 && zeroMonth === null) zeroMonth = m
    cash -= netBurn
    burn *= 1 + input.burnGrowth
    revenue *= 1 + input.revenueGrowth
  }

  return { points, zeroMonth }
}

export function RunwayContent() {
  const [input, setInput] = useState<ScenarioInput>({
    cashOnHand: 1_800_000,
    monthlyBurn: 180_000,
    burnGrowth: 0.03,
    monthlyRevenue: 25_000,
    revenueGrowth: 0.12,
    newRaiseMonth: 0,
    newRaiseAmount: 0,
  })

  const horizon = 36
  const baseline = useMemo(() => project(input, horizon), [input])
  const conservative = useMemo(
    () =>
      project(
        {
          ...input,
          burnGrowth: input.burnGrowth + 0.02,
          revenueGrowth: Math.max(0, input.revenueGrowth - 0.05),
        },
        horizon
      ),
    [input]
  )
  const optimistic = useMemo(
    () =>
      project(
        {
          ...input,
          burnGrowth: Math.max(0, input.burnGrowth - 0.01),
          revenueGrowth: input.revenueGrowth + 0.05,
        },
        horizon
      ),
    [input]
  )

  const chartData = baseline.points.map((p, i) => ({
    month: `M${p.month}`,
    Baseline: Math.max(0, p.cash),
    Conservative: Math.max(0, conservative.points[i]?.cash ?? 0),
    Optimistic: Math.max(0, optimistic.points[i]?.cash ?? 0),
  }))

  const burnData = baseline.points.map((p) => ({
    month: `M${p.month}`,
    Burn: p.burn,
    Revenue: p.revenue,
    "Net burn": p.netBurn,
  }))

  const baseRunway = baseline.zeroMonth ?? horizon + 1
  const consRunway = conservative.zeroMonth ?? horizon + 1
  const optRunway = optimistic.zeroMonth ?? horizon + 1

  const fundraiseUrgent = baseRunway < 9
  const fundraiseSoon = baseRunway >= 9 && baseRunway < 15

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-foreground/10">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-12">
          <PageHeader
            accent="#e5380f"
            eyebrow="Runway"
            title="Know when you'll need to raise"
            description="Live burn modeling with three scenarios. Pinpoint your zero-cash month and time your next round before the cliff."
          />

          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-foreground/10 mt-12 rounded-lg overflow-hidden border border-foreground/10">
            <KPI
              icon={<Wallet className="w-4 h-4" />}
              label="Cash on hand"
              value={formatMoney(input.cashOnHand)}
            />
            <KPI
              icon={<Flame className="w-4 h-4" />}
              label="Net burn / mo"
              value={formatMoney(Math.max(0, input.monthlyBurn - input.monthlyRevenue))}
              tone={input.monthlyBurn > input.monthlyRevenue ? "warn" : "good"}
            />
            <KPI
              icon={<Calendar className="w-4 h-4" />}
              label="Baseline runway"
              value={monthsToReadable(baseRunway)}
              tone={fundraiseUrgent ? "bad" : fundraiseSoon ? "warn" : "good"}
            />
            <KPI
              icon={<TrendingUp className="w-4 h-4" />}
              label="Revenue growth"
              value={`${(input.revenueGrowth * 100).toFixed(0)}% / mo`}
            />
          </div>

          {(fundraiseUrgent || fundraiseSoon) && (
            <div
              className={cn(
                "mt-6 flex items-start gap-3 p-4 rounded-lg border",
                fundraiseUrgent
                  ? "bg-destructive/5 border-destructive/30 text-destructive"
                  : "bg-amber-500/5 border-amber-500/30 text-amber-700"
              )}
            >
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="text-sm">
                <span className="font-medium">
                  {fundraiseUrgent ? "Start fundraising now." : "Begin fundraise within 60 days."}
                </span>{" "}
                Most rounds take 3-6 months from kickoff to wire. With{" "}
                {monthsToReadable(baseRunway)} of baseline runway, the safe window is closing.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Inputs + chart */}
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-12 grid lg:grid-cols-3 gap-8">
        {/* Inputs */}
        <div className="lg:col-span-1 space-y-6">
          <div className="border border-foreground/10 rounded-lg p-6 space-y-6">
            <h2 className="font-display text-xl">Assumptions</h2>

            <NumberField
              label="Cash on hand"
              value={input.cashOnHand}
              onChange={(v) => setInput((p) => ({ ...p, cashOnHand: v }))}
              prefix="$"
            />
            <NumberField
              label="Monthly burn"
              value={input.monthlyBurn}
              onChange={(v) => setInput((p) => ({ ...p, monthlyBurn: v }))}
              prefix="$"
            />
            <NumberField
              label="Monthly revenue"
              value={input.monthlyRevenue}
              onChange={(v) => setInput((p) => ({ ...p, monthlyRevenue: v }))}
              prefix="$"
            />

            <SliderField
              label="Burn growth"
              value={input.burnGrowth * 100}
              max={20}
              step={1}
              suffix="% / mo"
              onChange={(v) => setInput((p) => ({ ...p, burnGrowth: v / 100 }))}
            />
            <SliderField
              label="Revenue growth"
              value={input.revenueGrowth * 100}
              max={50}
              step={1}
              suffix="% / mo"
              onChange={(v) => setInput((p) => ({ ...p, revenueGrowth: v / 100 }))}
            />
          </div>

          <div className="border border-foreground/10 rounded-lg p-6 space-y-4">
            <h2 className="font-display text-xl">Planned raise</h2>
            <NumberField
              label="Amount"
              value={input.newRaiseAmount}
              onChange={(v) => setInput((p) => ({ ...p, newRaiseAmount: v }))}
              prefix="$"
            />
            <SliderField
              label="Closes in"
              value={input.newRaiseMonth}
              max={24}
              step={1}
              suffix=" mo"
              onChange={(v) => setInput((p) => ({ ...p, newRaiseMonth: v }))}
            />
            <p className="text-xs text-muted-foreground font-mono">
              Set amount = $0 to model without a raise.
            </p>
          </div>
        </div>

        {/* Chart */}
        <div className="lg:col-span-2 space-y-6">
          <div className="border border-foreground/10 rounded-lg p-6">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <div>
                <h2 className="font-display text-xl">Cash projection</h2>
                <p className="text-sm text-muted-foreground">
                  36-month projection across three scenarios.
                </p>
              </div>
              <div className="flex items-center gap-4 font-mono text-xs">
                <ScenarioPill label="Conservative" runway={consRunway} color="oklch(0.60 0.20 30)" />
                <ScenarioPill label="Baseline" runway={baseRunway} color="oklch(0.15 0.01 270)" />
                <ScenarioPill label="Optimistic" runway={optRunway} color="oklch(0.70 0.15 150)" />
              </div>
            </div>
            <div className="h-80">
              <ResponsiveContainer>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="b" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.15 0.01 270)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="oklch(0.15 0.01 270)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="c" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.60 0.20 30)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="oklch(0.60 0.20 30)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="o" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.70 0.15 150)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="oklch(0.70 0.15 150)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 2" stroke="oklch(0.90 0 0)" vertical={false} />
                  <XAxis dataKey="month" stroke="oklch(0.45 0.01 270)" fontSize={11} />
                  <YAxis
                    stroke="oklch(0.45 0.01 270)"
                    fontSize={11}
                    tickFormatter={(v) => formatMoney(v as number)}
                  />
                  <Tooltip
                    formatter={(v: number) => formatMoney(v)}
                    contentStyle={{
                      background: "oklch(0.99 0 0)",
                      border: "1px solid oklch(0.90 0 0)",
                      borderRadius: 8,
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: "var(--font-mono)" }} />
                  <Area
                    type="monotone"
                    dataKey="Optimistic"
                    stroke="oklch(0.70 0.15 150)"
                    fill="url(#o)"
                    strokeWidth={1.5}
                  />
                  <Area
                    type="monotone"
                    dataKey="Baseline"
                    stroke="oklch(0.15 0.01 270)"
                    fill="url(#b)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="Conservative"
                    stroke="oklch(0.60 0.20 30)"
                    fill="url(#c)"
                    strokeWidth={1.5}
                  />
                  {input.newRaiseAmount > 0 && (
                    <ReferenceLine
                      x={`M${input.newRaiseMonth}`}
                      stroke="oklch(0.78 0.14 75)"
                      strokeDasharray="4 4"
                      label={{
                        value: `Raise ${formatMoney(input.newRaiseAmount)}`,
                        position: "top",
                        fontSize: 10,
                        fontFamily: "var(--font-mono)",
                      }}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="border border-foreground/10 rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-display text-xl">Burn vs. revenue</h2>
                <p className="text-sm text-muted-foreground">
                  Default growth assumptions. Watch the gap close.
                </p>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer>
                <AreaChart data={burnData}>
                  <CartesianGrid strokeDasharray="2 2" stroke="oklch(0.90 0 0)" vertical={false} />
                  <XAxis dataKey="month" stroke="oklch(0.45 0.01 270)" fontSize={11} />
                  <YAxis
                    stroke="oklch(0.45 0.01 270)"
                    fontSize={11}
                    tickFormatter={(v) => formatMoney(v as number)}
                  />
                  <Tooltip
                    formatter={(v: number) => formatMoney(v)}
                    contentStyle={{
                      background: "oklch(0.99 0 0)",
                      border: "1px solid oklch(0.90 0 0)",
                      borderRadius: 8,
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: "var(--font-mono)" }} />
                  <Area
                    type="monotone"
                    dataKey="Burn"
                    stroke="oklch(0.60 0.20 30)"
                    fill="oklch(0.60 0.20 30)"
                    fillOpacity={0.1}
                    strokeWidth={1.5}
                  />
                  <Area
                    type="monotone"
                    dataKey="Revenue"
                    stroke="oklch(0.70 0.15 150)"
                    fill="oklch(0.70 0.15 150)"
                    fillOpacity={0.15}
                    strokeWidth={1.5}
                  />
                  <Line
                    type="monotone"
                    dataKey="Net burn"
                    stroke="oklch(0.15 0.01 270)"
                    strokeWidth={2}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function KPI({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone?: "good" | "warn" | "bad" | "neutral"
}) {
  return (
    <div className="bg-background p-5">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        {icon}
        <span className="font-mono text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div
        className={cn(
          "text-2xl font-display",
          tone === "warn" && "text-amber-600",
          tone === "bad" && "text-destructive",
          tone === "good" && "text-emerald-600"
        )}
      >
        {value}
      </div>
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
  prefix,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  prefix?: string
}) {
  return (
    <div>
      <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <div className="relative mt-1.5">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-mono">
            {prefix}
          </span>
        )}
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className={cn("h-10 font-mono", prefix && "pl-7")}
        />
      </div>
    </div>
  )
}

function SliderField({
  label,
  value,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string
  value: number
  max: number
  step: number
  suffix: string
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </Label>
        <span className="font-mono text-xs">
          {value.toFixed(0)}
          {suffix}
        </span>
      </div>
      <Slider value={[value]} max={max} step={step} onValueChange={(v) => onChange(v[0])} />
    </div>
  )
}

function ScenarioPill({
  label,
  runway,
  color,
}: {
  label: string
  runway: number
  color: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{monthsToReadable(runway)}</span>
    </div>
  )
}
