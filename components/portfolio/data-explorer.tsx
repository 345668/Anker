"use client"

import { useMemo, useState } from "react"
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts"
import { BarChart3, LineChart as LineIcon, AreaChart as AreaIcon, PieChart as PieIcon, Download } from "lucide-react"

export type ExplorerRow = {
  company: string
  kind: string
  security: string
  status: string
  round: string
  year: string
  invested: number
  fairValue: number
  realized: number
}

type ChartType = "bar" | "line" | "area" | "pie"
type DimKey = "kind" | "security" | "status" | "round" | "year"
type MeasureKey = "count" | "invested" | "fairValue" | "unrealized" | "moic"

const DIMENSIONS: { key: DimKey; label: string }[] = [
  { key: "kind", label: "Investment type" },
  { key: "security", label: "Security" },
  { key: "status", label: "Status" },
  { key: "round", label: "Round" },
  { key: "year", label: "Vintage year" },
]
const MEASURES: { key: MeasureKey; label: string; kind: "money" | "count" | "mult" }[] = [
  { key: "count", label: "# investments", kind: "count" },
  { key: "invested", label: "Invested (cost)", kind: "money" },
  { key: "fairValue", label: "Fair value", kind: "money" },
  { key: "unrealized", label: "Unrealized gain", kind: "money" },
  { key: "moic", label: "Gross MOIC", kind: "mult" },
]
const CHARTS: { key: ChartType; label: string; icon: any }[] = [
  { key: "bar", label: "Bar", icon: BarChart3 },
  { key: "line", label: "Line", icon: LineIcon },
  { key: "area", label: "Area", icon: AreaIcon },
  { key: "pie", label: "Pie", icon: PieIcon },
]

const PALETTE = ["#2f45e0", "#e5380f", "#127c78", "#8b5cf6", "#f59e0b", "#0ea5e9", "#db2777", "#65a30d", "#64748b"]

function fmt(v: number, kind: "money" | "count" | "mult") {
  if (kind === "mult") return `${v.toFixed(2)}×`
  if (kind === "count") return `${Math.round(v)}`
  return v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${Math.round(v).toLocaleString()}`
}

const label = (dim: DimKey, v: string) => (v && v.trim() ? v.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : dim === "year" ? "Undated" : "Unspecified")

export function DataExplorer({ rows }: { rows: ExplorerRow[] }) {
  const [chart, setChart] = useState<ChartType>("bar")
  const [dim, setDim] = useState<DimKey>("kind")
  const [measure, setMeasure] = useState<MeasureKey>("invested")

  const measureMeta = MEASURES.find((m) => m.key === measure)!

  const data = useMemo(() => {
    const buckets = new Map<string, { invested: number; fairValue: number; realized: number; count: number }>()
    for (const r of rows) {
      const k = label(dim, r[dim])
      const b = buckets.get(k) ?? { invested: 0, fairValue: 0, realized: 0, count: 0 }
      b.invested += r.invested
      b.fairValue += r.fairValue
      b.realized += r.realized
      b.count += 1
      buckets.set(k, b)
    }
    const out = Array.from(buckets.entries()).map(([name, b]) => {
      let value: number
      if (measure === "count") value = b.count
      else if (measure === "invested") value = b.invested
      else if (measure === "fairValue") value = b.fairValue
      else if (measure === "unrealized") value = b.fairValue - b.invested
      else value = b.invested > 0 ? (b.fairValue + b.realized) / b.invested : 0
      return { name, value: Number(value.toFixed(measureMeta.kind === "mult" ? 2 : 0)) }
    })
    return out.sort((a, b) => b.value - a.value)
  }, [rows, dim, measure, measureMeta.kind])

  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data])

  function exportCsv() {
    const header = `${DIMENSIONS.find((d) => d.key === dim)!.label},${measureMeta.label}`
    const body = data.map((d) => `"${d.name}",${d.value}`).join("\n")
    const blob = new Blob([`${header}\n${body}\n`], { type: "text/csv" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `anker-explorer-${dim}-${measure}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const axisStyle = { fontSize: 11, fill: "currentColor", opacity: 0.6 }
  const tip = {
    contentStyle: { background: "var(--color-background)", border: "1px solid rgba(128,128,128,0.25)", borderRadius: 8, fontSize: 12 },
    formatter: (v: any) => [fmt(Number(v), measureMeta.kind), measureMeta.label],
  }

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4 mb-6">
        <Field label="Measure">
          <Select value={measure} onChange={(v) => setMeasure(v as MeasureKey)} options={MEASURES.map((m) => ({ value: m.key, label: m.label }))} />
        </Field>
        <Field label="Group by">
          <Select value={dim} onChange={(v) => setDim(v as DimKey)} options={DIMENSIONS.map((d) => ({ value: d.key, label: d.label }))} />
        </Field>
        <div className="flex items-center gap-1 rounded-lg border border-foreground/12 p-1">
          {CHARTS.map((c) => {
            const Icon = c.icon
            const on = chart === c.key
            return (
              <button key={c.key} onClick={() => setChart(c.key)} title={c.label}
                className={`grid place-items-center w-8 h-8 rounded-md transition-colors ${on ? "bg-[#2f45e0] text-white" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon className="w-4 h-4" />
              </button>
            )
          })}
        </div>
        <button onClick={exportCsv} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-foreground/12 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Chart */}
      <div className="border border-foreground/10 rounded-xl p-4 sm:p-6">
        <div className="flex items-baseline justify-between mb-4">
          <div className="text-sm font-medium">{measureMeta.label} by {DIMENSIONS.find((d) => d.key === dim)!.label.toLowerCase()}</div>
          {measureMeta.kind !== "mult" ? <div className="text-xs text-muted-foreground tabular-nums">Total {fmt(total, measureMeta.kind)}</div> : null}
        </div>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-16 text-center">No investment data to plot yet.</p>
        ) : (
          <div className="h-[340px] text-foreground">
            <ResponsiveContainer width="100%" height="100%">
              {chart === "bar" ? (
                <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.08} vertical={false} />
                  <XAxis dataKey="name" tick={axisStyle} tickLine={false} axisLine={false} interval={0} angle={-15} textAnchor="end" height={54} />
                  <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={(v) => fmt(Number(v), measureMeta.kind)} width={64} />
                  <Tooltip {...tip} cursor={{ fill: "currentColor", opacity: 0.04 }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Bar>
                </BarChart>
              ) : chart === "line" ? (
                <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.08} vertical={false} />
                  <XAxis dataKey="name" tick={axisStyle} tickLine={false} axisLine={false} interval={0} angle={-15} textAnchor="end" height={54} />
                  <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={(v) => fmt(Number(v), measureMeta.kind)} width={64} />
                  <Tooltip {...tip} />
                  <Line type="monotone" dataKey="value" stroke="#2f45e0" strokeWidth={2} dot={{ r: 3, fill: "#2f45e0" }} />
                </LineChart>
              ) : chart === "area" ? (
                <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <defs>
                    <linearGradient id="exp-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2f45e0" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#2f45e0" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.08} vertical={false} />
                  <XAxis dataKey="name" tick={axisStyle} tickLine={false} axisLine={false} interval={0} angle={-15} textAnchor="end" height={54} />
                  <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={(v) => fmt(Number(v), measureMeta.kind)} width={64} />
                  <Tooltip {...tip} />
                  <Area type="monotone" dataKey="value" stroke="#2f45e0" strokeWidth={2} fill="url(#exp-area)" />
                </AreaChart>
              ) : (
                <PieChart>
                  <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={120} innerRadius={64} paddingAngle={2}>
                    {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip {...tip} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Breakdown table */}
      {data.length > 0 ? (
        <div className="mt-6 overflow-x-auto border border-foreground/10 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-foreground/10 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                <th className="text-left px-4 py-2.5">{DIMENSIONS.find((d) => d.key === dim)!.label}</th>
                <th className="text-right px-4 py-2.5">{measureMeta.label}</th>
                {measureMeta.kind !== "mult" ? <th className="text-right px-4 py-2.5">Share</th> : null}
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={d.name} className="border-b border-foreground/[0.06] last:border-0">
                  <td className="px-4 py-2.5 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />{d.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">{fmt(d.value, measureMeta.kind)}</td>
                  {measureMeta.kind !== "mult" ? <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{total > 0 ? `${((d.value / total) * 100).toFixed(0)}%` : "—"}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-foreground/12 bg-background px-3 py-2 text-sm min-w-[170px] focus:outline-none focus:border-foreground/40">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
