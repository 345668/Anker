"use client"

import { DataTable, type Column } from "./data-table"
import { MetricTiles, type Metric } from "./metric-tiles"

export type FirmRow = {
  id: string
  name: string
  firm_type?: string | null
  type?: string | null
  hq_location?: string | null
  location?: string | null
  stages?: string[] | null
  typical_check_size?: string | null
  investment_count?: number | null
  portfolio_companies?: string[] | null
  founded_year?: number | null
  website?: string | null
}

const arr = (a?: string[] | null) => (a && a.length ? a : [])

export function FirmsTable({ rows }: { rows: FirmRow[] }) {
  const withChecks = rows.filter((f) => f.typical_check_size)
  const metrics: Metric[] = [
    { label: "Firms", value: rows.length },
    { label: "With check size", value: withChecks.length },
    { label: "Countries", value: new Set(rows.map((f) => f.hq_location || f.location).filter(Boolean)).size },
    { label: "Avg. investments", value: rows.length ? Math.round(rows.reduce((s, f) => s + (f.investment_count ?? 0), 0) / rows.length) : 0 },
  ]
  const columns: Column<FirmRow>[] = [
    { key: "name", header: "Firm", render: (f) => <span className="font-medium">{f.name}</span> },
    { key: "type", header: "Type", value: (f) => f.firm_type ?? f.type ?? "", render: (f) => <span className="text-muted-foreground capitalize">{(f.firm_type ?? f.type ?? "—")}</span> },
    { key: "hq", header: "HQ", value: (f) => f.hq_location ?? f.location ?? "", render: (f) => f.hq_location ?? f.location ?? "—" },
    { key: "stages", header: "Stages", sortable: false, value: (f) => arr(f.stages).join(" "), render: (f) => (
      <span className="flex flex-wrap gap-1">
        {arr(f.stages).slice(0, 3).map((s) => <span key={s} className="text-[10px] font-mono uppercase tracking-wider border border-foreground/15 rounded px-1.5 py-0.5">{s}</span>)}
        {arr(f.stages).length > 3 ? <span className="text-[10px] text-muted-foreground">+{arr(f.stages).length - 3}</span> : null}
      </span>
    ) },
    { key: "typical_check_size", header: "Check size", value: (f) => f.typical_check_size ?? "", render: (f) => f.typical_check_size ?? "—" },
    { key: "investment_count", header: "Investments", numeric: true, value: (f) => f.investment_count ?? 0, render: (f) => f.investment_count ?? "—" },
    { key: "portfolio", header: "Portfolio", numeric: true, value: (f) => arr(f.portfolio_companies).length, render: (f) => arr(f.portfolio_companies).length || "—", defaultHidden: true },
    { key: "founded_year", header: "Founded", numeric: true, value: (f) => f.founded_year ?? 0, render: (f) => f.founded_year ?? "—", defaultHidden: true },
  ]
  return (
    <div className="space-y-6">
      <MetricTiles metrics={metrics} />
      <DataTable columns={columns} rows={rows} getRowId={(f) => f.id} exportName="firms" searchPlaceholder="Search firms…" initialSort={{ key: "investment_count", dir: "desc" }} emptyText="No firms yet." />
    </div>
  )
}
