"use client"

import { MetricTiles, type Metric } from "@/components/data/metric-tiles"
import { DataTable } from "@/components/data/data-table"

/**
 * Client body for the Valuations page — column render/value/total callbacks must
 * live client-side (functions can't cross the Server→Client Component boundary).
 */
export type ValuationRow = {
  id: string
  company: string
  method: string
  as_of: string | null
  cost: number
  fair_value: number | null
  moic: number | null
  status: string
}

const money = (v: number | null | undefined) => (v == null ? "—" : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${Math.round(Number(v)).toLocaleString()}`)
const mult = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(2)}×`)
const METHOD_LABEL: Record<string, string> = { cost: "At cost", last_round: "Last round", mark: "Mark", write_down: "Write-down", write_off: "Write-off", exit: "Exit" }
const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })

export function ValuationsTableClient({ rows, summary }: { rows: ValuationRow[]; summary: Metric[] }) {
  return (
    <>
      <MetricTiles metrics={summary} columns={4} />
      <div className="mt-8">
        <DataTable
          rows={rows}
          getRowId={(r) => r.id}
          exportName="valuations"
          searchPlaceholder="Search companies…"
          initialSort={{ key: "fair_value", dir: "desc" }}
          emptyText="No positions to value yet."
          columns={[
            { key: "company", header: "Company", value: (r) => r.company, render: (r) => <span className="font-medium">{r.company}</span> },
            { key: "method", header: "Method", value: (r) => r.method, render: (r) => <span className="text-muted-foreground">{METHOD_LABEL[r.method] ?? r.method}</span> },
            { key: "as_of", header: "As of", value: (r) => r.as_of ?? "", render: (r) => (r.as_of ? fmtDate(r.as_of) : "—") },
            { key: "cost", header: "Cost basis", numeric: true, value: (r) => r.cost, render: (r) => money(r.cost), total: (rs) => money(rs.reduce((s, r) => s + r.cost, 0)) },
            { key: "fair_value", header: "Fair value", numeric: true, value: (r) => r.fair_value ?? 0, render: (r) => money(r.fair_value), total: (rs) => money(rs.reduce((s, r) => s + (r.fair_value ?? 0), 0)) },
            { key: "moic", header: "MOIC", numeric: true, value: (r) => r.moic ?? 0, render: (r) => mult(r.moic) },
            { key: "status", header: "Status", value: (r) => r.status, render: (r) => <span className="text-muted-foreground capitalize">{r.status.replace("_", " ")}</span> },
          ]}
        />
      </div>
    </>
  )
}
