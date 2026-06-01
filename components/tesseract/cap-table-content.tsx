"use client"

import { useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Plus, Trash2, Layers, TrendingDown, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

interface Holder {
  id: string
  name: string
  shares: number
  type: "founder" | "investor" | "esop" | "advisor"
}

interface Round {
  id: string
  name: string
  preMoney: number
  raise: number
  esopTopUp: number // post-money percentage point of ESOP increase
}

const SERIES_COLORS = [
  "oklch(0.15 0.01 270)",
  "oklch(0.78 0.14 75)",
  "oklch(0.55 0.15 200)",
  "oklch(0.70 0.15 150)",
  "oklch(0.60 0.20 30)",
  "oklch(0.45 0.05 270)",
]

const formatPct = (n: number) => `${(n * 100).toFixed(2)}%`
const formatMoney = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
    : n >= 1_000
    ? `$${(n / 1_000).toFixed(0)}K`
    : `$${n.toFixed(0)}`

export function CapTableContent() {
  const [holders, setHolders] = useState<Holder[]>([
    { id: "h1", name: "Founder A", shares: 4_500_000, type: "founder" },
    { id: "h2", name: "Founder B", shares: 4_500_000, type: "founder" },
    { id: "h3", name: "ESOP Pool", shares: 1_000_000, type: "esop" },
  ])

  const [rounds, setRounds] = useState<Round[]>([
    { id: "r1", name: "Seed", preMoney: 8_000_000, raise: 2_000_000, esopTopUp: 0.10 },
    { id: "r2", name: "Series A", preMoney: 25_000_000, raise: 8_000_000, esopTopUp: 0.05 },
  ])

  const initialShares = holders.reduce((s, h) => s + h.shares, 0)

  // Compute cap table progression: each round dilutes existing holders.
  const progression = useMemo(() => {
    let workingHolders = holders.map((h) => ({ ...h }))
    let totalShares = workingHolders.reduce((s, h) => s + h.shares, 0)

    const stages: {
      label: string
      totalShares: number
      valuation: number
      ppPerShare: number
      holdersSnapshot: { id: string; name: string; type: Holder["type"]; shares: number; pct: number }[]
    }[] = [
      {
        label: "Founding",
        totalShares,
        valuation: 0,
        ppPerShare: 0,
        holdersSnapshot: workingHolders.map((h) => ({
          ...h,
          pct: h.shares / totalShares,
        })),
      },
    ]

    for (const round of rounds) {
      const postMoney = round.preMoney + round.raise
      // ESOP top-up happens pre-money, sized to be `esopTopUp` of post-money.
      const esopHolder = workingHolders.find((h) => h.type === "esop")
      const targetEsopPostPct = (esopHolder ? esopHolder.shares / totalShares : 0) + round.esopTopUp
      // We need ESOP / post-shares = targetEsopPostPct
      // Dilution from new investors first: investorPct = raise / postMoney
      const investorPct = round.raise / postMoney
      // Solve so post-issuance ESOP percentage = targetEsopPostPct
      // current esop shares + new esop = targetEsopPostPct * postShares
      // postShares = totalShares + newEsop + newInvestor
      // newInvestor = investorPct * postShares
      // postShares (1 - investorPct) = totalShares + newEsop
      // and newEsop = targetEsopPostPct * postShares - currentEsop
      // postShares (1 - investorPct) = totalShares + targetEsopPostPct * postShares - currentEsop
      // postShares (1 - investorPct - targetEsopPostPct) = totalShares - currentEsop
      const currentEsop = esopHolder?.shares ?? 0
      const denom = 1 - investorPct - targetEsopPostPct
      const postShares = denom > 0.01 ? (totalShares - currentEsop) / denom : totalShares * 1.5
      const newEsop = Math.max(0, targetEsopPostPct * postShares - currentEsop)
      const newInvestor = investorPct * postShares

      // Apply
      if (esopHolder) {
        esopHolder.shares += newEsop
      } else if (newEsop > 0) {
        workingHolders.push({
          id: `esop-${round.id}`,
          name: "ESOP Pool",
          shares: newEsop,
          type: "esop",
        })
      }
      workingHolders.push({
        id: `inv-${round.id}`,
        name: round.name,
        shares: newInvestor,
        type: "investor",
      })
      totalShares = workingHolders.reduce((s, h) => s + h.shares, 0)

      stages.push({
        label: round.name,
        totalShares,
        valuation: postMoney,
        ppPerShare: postMoney / totalShares,
        holdersSnapshot: workingHolders.map((h) => ({
          ...h,
          pct: h.shares / totalShares,
        })),
      })
    }

    return stages
  }, [holders, rounds])

  const finalStage = progression[progression.length - 1]
  const founderInitial = holders
    .filter((h) => h.type === "founder")
    .reduce((s, h) => s + h.shares, 0)
  const founderFinalPct =
    finalStage.holdersSnapshot
      .filter((h) => h.type === "founder")
      .reduce((s, h) => s + h.pct, 0)
  const founderInitialPct = founderInitial / initialShares

  const stackedData = progression.map((stage) => {
    const row: Record<string, number | string> = { name: stage.label }
    const grouped: Record<string, number> = {}
    stage.holdersSnapshot.forEach((h) => {
      grouped[h.name] = (grouped[h.name] ?? 0) + h.pct * 100
    })
    Object.entries(grouped).forEach(([k, v]) => (row[k] = v))
    return row
  })

  const allHolderNames = Array.from(
    new Set(progression.flatMap((s) => s.holdersSnapshot.map((h) => h.name)))
  )

  const addHolder = () => {
    setHolders((prev) => [
      ...prev,
      {
        id: `h${Date.now()}`,
        name: "New holder",
        shares: 500_000,
        type: "advisor",
      },
    ])
  }

  const addRound = () => {
    const lastRound = rounds[rounds.length - 1]
    setRounds((prev) => [
      ...prev,
      {
        id: `r${Date.now()}`,
        name: `Series ${String.fromCharCode(65 + prev.length)}`,
        preMoney: (lastRound?.preMoney ?? 10_000_000) * 3,
        raise: (lastRound?.raise ?? 2_000_000) * 2.5,
        esopTopUp: 0.03,
      },
    ])
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-foreground/10">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-12">
          <div className="flex items-start justify-between gap-8 flex-wrap">
            <div>
              <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-4">
                <span className="w-8 h-px bg-foreground/30" />
                Cap table
              </span>
              <h1 className="text-5xl lg:text-6xl font-display tracking-tight leading-[0.95] mb-4">
                Model your
                <br />
                dilution.
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl">
                Plan ownership across rounds. Adjust holders, valuations, and ESOP top-ups —
                see exactly where founders land at exit.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-4 py-3 border border-foreground/10 rounded-lg">
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  Founder ownership
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-display">{formatPct(founderFinalPct)}</span>
                  <span
                    className={cn(
                      "text-xs font-mono inline-flex items-center gap-1",
                      founderFinalPct < founderInitialPct
                        ? "text-destructive"
                        : "text-emerald-600"
                    )}
                  >
                    <TrendingDown className="w-3 h-3" />
                    {formatPct(founderInitialPct - founderFinalPct)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-12 grid lg:grid-cols-3 gap-8">
        {/* Sidebar - holders + rounds */}
        <div className="lg:col-span-1 space-y-8">
          {/* Holders */}
          <div className="border border-foreground/10 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl">Initial holders</h2>
              <Button variant="ghost" size="sm" onClick={addHolder} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            </div>
            <div className="space-y-4">
              {holders.map((h) => (
                <div key={h.id} className="space-y-2 pb-4 border-b border-foreground/5 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <Input
                      value={h.name}
                      onChange={(e) =>
                        setHolders((prev) =>
                          prev.map((p) => (p.id === h.id ? { ...p, name: e.target.value } : p))
                        )
                      }
                      className="h-9 text-sm"
                    />
                    <button
                      onClick={() =>
                        setHolders((prev) => prev.filter((p) => p.id !== h.id))
                      }
                      className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={h.type}
                      onChange={(e) =>
                        setHolders((prev) =>
                          prev.map((p) =>
                            p.id === h.id ? { ...p, type: e.target.value as Holder["type"] } : p
                          )
                        )
                      }
                      className="h-9 px-3 text-xs font-mono uppercase tracking-wider border border-foreground/10 rounded-md bg-background"
                    >
                      <option value="founder">Founder</option>
                      <option value="investor">Investor</option>
                      <option value="esop">ESOP</option>
                      <option value="advisor">Advisor</option>
                    </select>
                    <Input
                      type="number"
                      value={h.shares}
                      onChange={(e) =>
                        setHolders((prev) =>
                          prev.map((p) =>
                            p.id === h.id ? { ...p, shares: Number(e.target.value) || 0 } : p
                          )
                        )
                      }
                      className="h-9 text-sm font-mono"
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-muted-foreground">
                      {formatPct(h.shares / initialShares)}
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {h.shares.toLocaleString()} sh
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Rounds */}
          <div className="border border-foreground/10 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl">Funding rounds</h2>
              <Button variant="ghost" size="sm" onClick={addRound} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            </div>
            <div className="space-y-6">
              {rounds.map((r) => (
                <div
                  key={r.id}
                  className="space-y-3 pb-6 border-b border-foreground/5 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      value={r.name}
                      onChange={(e) =>
                        setRounds((prev) =>
                          prev.map((p) => (p.id === r.id ? { ...p, name: e.target.value } : p))
                        )
                      }
                      className="h-9 text-sm font-medium"
                    />
                    <button
                      onClick={() => setRounds((prev) => prev.filter((p) => p.id !== r.id))}
                      className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        Pre-money
                      </Label>
                      <Input
                        type="number"
                        value={r.preMoney}
                        onChange={(e) =>
                          setRounds((prev) =>
                            prev.map((p) =>
                              p.id === r.id
                                ? { ...p, preMoney: Number(e.target.value) || 0 }
                                : p
                            )
                          )
                        }
                        className="h-9 text-sm font-mono mt-1"
                      />
                    </div>
                    <div>
                      <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        Raise
                      </Label>
                      <Input
                        type="number"
                        value={r.raise}
                        onChange={(e) =>
                          setRounds((prev) =>
                            prev.map((p) =>
                              p.id === r.id ? { ...p, raise: Number(e.target.value) || 0 } : p
                            )
                          )
                        }
                        className="h-9 text-sm font-mono mt-1"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        ESOP top-up
                      </Label>
                      <span className="font-mono text-xs">{(r.esopTopUp * 100).toFixed(0)}%</span>
                    </div>
                    <Slider
                      value={[r.esopTopUp * 100]}
                      max={20}
                      step={1}
                      onValueChange={(v) =>
                        setRounds((prev) =>
                          prev.map((p) =>
                            p.id === r.id ? { ...p, esopTopUp: v[0] / 100 } : p
                          )
                        )
                      }
                    />
                  </div>

                  <div className="font-mono text-[10px] text-muted-foreground pt-2">
                    Post-money {formatMoney(r.preMoney + r.raise)} · Investor stake{" "}
                    {formatPct(r.raise / (r.preMoney + r.raise))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right - chart + table */}
        <div className="lg:col-span-2 space-y-8">
          {/* Stacked chart */}
          <div className="border border-foreground/10 rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-display text-xl">Ownership by stage</h2>
                <p className="text-sm text-muted-foreground">
                  Stacked percentage across funding rounds.
                </p>
              </div>
              <Layers className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="h-80">
              <ResponsiveContainer>
                <BarChart data={stackedData}>
                  <CartesianGrid strokeDasharray="2 2" stroke="oklch(0.90 0 0)" vertical={false} />
                  <XAxis dataKey="name" stroke="oklch(0.45 0.01 270)" fontSize={12} />
                  <YAxis
                    stroke="oklch(0.45 0.01 270)"
                    fontSize={12}
                    tickFormatter={(v) => `${v}%`}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    formatter={(v: number, name) => [`${v.toFixed(2)}%`, name]}
                    contentStyle={{
                      background: "oklch(0.99 0 0)",
                      border: "1px solid oklch(0.90 0 0)",
                      borderRadius: 8,
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: "var(--font-mono)" }} />
                  {allHolderNames.map((name, i) => (
                    <Bar
                      key={name}
                      dataKey={name}
                      stackId="a"
                      fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Final cap table */}
          <div className="border border-foreground/10 rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-display text-xl">Cap table — {finalStage.label}</h2>
                <p className="text-sm text-muted-foreground">
                  Post-money {formatMoney(finalStage.valuation)} ·{" "}
                  {finalStage.totalShares.toLocaleString(undefined, { maximumFractionDigits: 0 })}{" "}
                  shares
                </p>
              </div>
              <Sparkles className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="overflow-hidden rounded-lg border border-foreground/10">
              <table className="w-full text-sm">
                <thead className="bg-foreground/5">
                  <tr>
                    <th className="text-left p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Holder
                    </th>
                    <th className="text-left p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Type
                    </th>
                    <th className="text-right p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Shares
                    </th>
                    <th className="text-right p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      %
                    </th>
                    <th className="text-right p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {finalStage.holdersSnapshot.map((h, i) => (
                    <tr key={i} className="border-t border-foreground/5">
                      <td className="p-3 font-medium">{h.name}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded font-mono text-[10px] uppercase tracking-wider bg-foreground/5">
                          {h.type}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono">
                        {h.shares.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td className="p-3 text-right font-mono">{formatPct(h.pct)}</td>
                      <td className="p-3 text-right font-mono">
                        {formatMoney(h.pct * finalStage.valuation)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
