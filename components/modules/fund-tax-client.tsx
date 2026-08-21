"use client"

import { MetricTiles, type Metric } from "@/components/data/metric-tiles"
import { DataTable } from "@/components/data/data-table"

/**
 * Client body for the Fund Tax page. The column `render`/`value` callbacks must
 * live in a Client Component — functions can't be passed from a Server Component
 * to a Client Component (that RSC-serialization error is what crashed the page).
 * The server page passes only serializable data (rows, summary, year).
 */
export type FundTaxRow = { id: string; name: string; type: string; issued: boolean }

export function FundTaxClient({ rows, year, summary }: { rows: FundTaxRow[]; year: number; summary: Metric[] }) {
  return (
    <>
      <MetricTiles metrics={summary} columns={4} />
      <div className="mt-8">
        <DataTable
          rows={rows}
          getRowId={(r) => r.id}
          exportName={`k1-status-${year}`}
          searchPlaceholder="Search investors…"
          emptyText="No investors on file."
          columns={[
            { key: "name", header: "Investor", value: (r) => r.name, render: (r) => <span className="font-medium">{r.name}</span> },
            { key: "type", header: "Type", value: (r) => r.type, render: (r) => <span className="text-muted-foreground capitalize">{String(r.type).replace(/_/g, " ")}</span> },
            {
              key: "issued", header: `K-1 ${year}`, value: (r) => (r.issued ? 1 : 0),
              render: (r) => r.issued
                ? <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Issued</span>
                : <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">Outstanding</span>,
            },
          ]}
        />
      </div>
    </>
  )
}
