"use client"

import { DataTable, type Column } from "./data-table"
import { MetricTiles, type Metric } from "./metric-tiles"

export type DealRow = {
  id: string
  name?: string | null
  firm_name?: string | null
  stage: string
  status: string
  amount: number | null
  valuation: number | null
  probability: number | null
  expected_close_date: string | null
}

const CLOSED = ["closed_won", "closed_lost", "won", "lost"]
const n = (v: any) => (v == null ? 0 : Number(v))
const money = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : v ? `$${v}` : "—")
const nice = (s: string | null) => (s ? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—")

export function DealsTable({ rows }: { rows: DealRow[] }) {
  const active = rows.filter((d) => !CLOSED.includes(d.stage) && !CLOSED.includes(d.status))
  const won = rows.filter((d) => d.stage === "closed_won" || d.status === "won")
  const metrics: Metric[] = [
    { label: "Deals", value: rows.length },
    { label: "Active", value: active.length },
    { label: "Pipeline value", value: money(active.reduce((s, d) => s + n(d.amount), 0)) },
    { label: "Closed-won value", value: money(won.reduce((s, d) => s + n(d.amount), 0)) },
  ]
  const columns: Column<DealRow>[] = [
    { key: "name", header: "Deal", value: (d) => d.name ?? "", render: (d) => <span className="font-medium">{d.name || "Untitled"}</span> },
    { key: "firm_name", header: "Firm", value: (d) => d.firm_name ?? "", render: (d) => d.firm_name ?? "—" },
    { key: "stage", header: "Stage", value: (d) => d.stage, render: (d) => <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground border border-foreground/15 rounded-full px-2 py-0.5">{nice(d.stage)}</span> },
    { key: "amount", header: "Amount", numeric: true, value: (d) => n(d.amount), render: (d) => money(n(d.amount)), total: (rs) => money(rs.reduce((s, d) => s + n(d.amount), 0)) },
    { key: "valuation", header: "Valuation", numeric: true, value: (d) => n(d.valuation), render: (d) => money(n(d.valuation)) },
    { key: "probability", header: "Prob.", numeric: true, value: (d) => n(d.probability), render: (d) => (d.probability != null ? `${d.probability}%` : "—") },
    { key: "expected_close_date", header: "Close", value: (d) => d.expected_close_date ?? "", render: (d) => (d.expected_close_date ? new Date(d.expected_close_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—") },
    { key: "status", header: "Status", value: (d) => d.status, render: (d) => <span className={`text-[11px] font-mono uppercase tracking-wider ${d.status === "won" ? "text-emerald-600" : d.status === "lost" ? "text-rose-600" : "text-muted-foreground"}`}>{nice(d.status)}</span> },
  ]
  return (
    <div className="space-y-6">
      <MetricTiles metrics={metrics} />
      <DataTable columns={columns} rows={rows} getRowId={(d) => d.id} exportName="deals" searchPlaceholder="Search deals…" initialSort={{ key: "amount", dir: "desc" }} emptyText="No deals yet." />
    </div>
  )
}
