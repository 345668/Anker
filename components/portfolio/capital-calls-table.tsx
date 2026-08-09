"use client"

import { DataTable, type Column } from "@/components/data/data-table"
import { MetricTiles, type Metric } from "@/components/data/metric-tiles"

export type CallRow = {
  id: string; call_number: number; title: string | null; purpose: string | null
  default_call_pct: string | number | null; total_amount: string | number | null
  sent_at: string | null; due_date: string | null; status: string
}
const n = (v: any) => (v == null ? 0 : Number(v))
const money = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : v ? `$${v}` : "—")
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—")
const cap = (s: string) => s.replace(/_/g, " ").replace(/\b\w/, (c) => c.toUpperCase())

function statusCls(s: string) { return s === "settled" ? "text-emerald-600 border-emerald-600/30" : s === "sent" ? "text-amber-600 border-amber-600/30" : s === "cancelled" ? "text-rose-600 border-rose-600/30" : "text-muted-foreground border-foreground/20" }

export function CapitalCallsTable({ rows }: { rows: CallRow[] }) {
  const called = rows.filter((r) => r.status !== "draft" && r.status !== "cancelled")
  const metrics: Metric[] = [
    { label: "Calls", value: rows.length },
    { label: "Total called", value: money(called.reduce((s, r) => s + n(r.total_amount), 0)) },
    { label: "Settled", value: rows.filter((r) => r.status === "settled").length },
    { label: "Outstanding", value: money(rows.filter((r) => r.status === "sent").reduce((s, r) => s + n(r.total_amount), 0)) },
  ]
  const columns: Column<CallRow>[] = [
    { key: "call_number", header: "Call #", numeric: true, value: (r) => n(r.call_number), render: (r) => <span className="font-medium">#{r.call_number}</span> },
    { key: "title", header: "Title", value: (r) => r.title ?? "", render: (r) => <span className="font-medium">{r.title ?? "—"}</span> },
    { key: "purpose", header: "Purpose", value: (r) => r.purpose ?? "", render: (r) => <span className="text-muted-foreground">{r.purpose ?? "—"}</span> },
    { key: "default_call_pct", header: "Called %", numeric: true, value: (r) => n(r.default_call_pct), render: (r) => (r.default_call_pct != null ? `${n(r.default_call_pct)}%` : "—") },
    { key: "total_amount", header: "Amount", numeric: true, value: (r) => n(r.total_amount), render: (r) => money(n(r.total_amount)), total: (rs) => money(rs.reduce((s, r) => s + n(r.total_amount), 0)) },
    { key: "sent_at", header: "Sent", value: (r) => r.sent_at ?? "", render: (r) => date(r.sent_at) },
    { key: "due_date", header: "Due", value: (r) => r.due_date ?? "", render: (r) => date(r.due_date) },
    { key: "status", header: "Status", value: (r) => r.status, render: (r) => <span className={`text-[11px] font-mono uppercase tracking-wider rounded-full px-2 py-0.5 border ${statusCls(r.status)}`}>{cap(r.status)}</span> },
  ]
  return (
    <div className="space-y-6">
      <MetricTiles metrics={metrics} />
      <DataTable columns={columns} rows={rows} getRowId={(r) => r.id} exportName="capital-calls" searchPlaceholder="Search calls…" initialSort={{ key: "call_number", dir: "desc" }} emptyText="No capital calls yet." />
    </div>
  )
}
