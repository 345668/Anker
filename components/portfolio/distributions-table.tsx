"use client"

import { DataTable, type Column } from "@/components/data/data-table"
import { MetricTiles, type Metric } from "@/components/data/metric-tiles"

export type DistRow = {
  id: string; distribution_number: number; title: string | null; source: string | null
  gross_amount: string | number | null; mgmt_fee_deduction: string | number | null
  carry_deduction: string | number | null; net_amount: string | number | null
  payment_date: string | null; status: string
}
const n = (v: any) => (v == null ? 0 : Number(v))
const money = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : v ? `$${v}` : "—")
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—")
const cap = (s: string) => s.replace(/_/g, " ").replace(/\b\w/, (c) => c.toUpperCase())
function statusCls(s: string) { return s === "paid" ? "text-emerald-600 border-emerald-600/30" : s === "notified" ? "text-amber-600 border-amber-600/30" : s === "cancelled" ? "text-rose-600 border-rose-600/30" : "text-muted-foreground border-foreground/20" }

export function DistributionsTable({ rows }: { rows: DistRow[] }) {
  const paid = rows.filter((r) => r.status === "paid")
  const metrics: Metric[] = [
    { label: "Distributions", value: rows.length },
    { label: "Gross total", value: money(rows.reduce((s, r) => s + n(r.gross_amount), 0)) },
    { label: "Net distributed", value: money(paid.reduce((s, r) => s + n(r.net_amount), 0)) },
    { label: "Carry", value: money(rows.reduce((s, r) => s + n(r.carry_deduction), 0)) },
  ]
  const columns: Column<DistRow>[] = [
    { key: "distribution_number", header: "Dist #", numeric: true, value: (r) => n(r.distribution_number), render: (r) => <span className="font-medium">#{r.distribution_number}</span> },
    { key: "title", header: "Title", value: (r) => r.title ?? "", render: (r) => <span className="font-medium">{r.title ?? "—"}</span> },
    { key: "source", header: "Source", value: (r) => r.source ?? "", render: (r) => <span className="text-muted-foreground capitalize">{r.source ?? "—"}</span> },
    { key: "gross_amount", header: "Gross", numeric: true, value: (r) => n(r.gross_amount), render: (r) => money(n(r.gross_amount)), total: (rs) => money(rs.reduce((s, r) => s + n(r.gross_amount), 0)) },
    { key: "mgmt_fee_deduction", header: "Mgmt fee", numeric: true, value: (r) => n(r.mgmt_fee_deduction), render: (r) => money(n(r.mgmt_fee_deduction)), defaultHidden: true },
    { key: "carry_deduction", header: "Carry", numeric: true, value: (r) => n(r.carry_deduction), render: (r) => money(n(r.carry_deduction)) },
    { key: "net_amount", header: "Net", numeric: true, value: (r) => n(r.net_amount), render: (r) => money(n(r.net_amount)), total: (rs) => money(rs.reduce((s, r) => s + n(r.net_amount), 0)) },
    { key: "payment_date", header: "Paid", value: (r) => r.payment_date ?? "", render: (r) => date(r.payment_date) },
    { key: "status", header: "Status", value: (r) => r.status, render: (r) => <span className={`text-[11px] font-mono uppercase tracking-wider rounded-full px-2 py-0.5 border ${statusCls(r.status)}`}>{cap(r.status)}</span> },
  ]
  return (
    <div className="space-y-6">
      <MetricTiles metrics={metrics} />
      <DataTable columns={columns} rows={rows} getRowId={(r) => r.id} exportName="distributions" searchPlaceholder="Search distributions…" initialSort={{ key: "distribution_number", dir: "desc" }} emptyText="No distributions yet." />
    </div>
  )
}
