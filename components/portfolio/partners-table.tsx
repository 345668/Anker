"use client"

import { DataTable, type Column } from "@/components/data/data-table"
import { MetricTiles, type Metric } from "@/components/data/metric-tiles"

export type Lp = {
  id: string
  lp_name: string
  lp_type: string | null
  commitment_amount: string | number | null
  called_amount: string | number | null
  distributed_amount: string | number | null
  ownership_pct: string | number | null
  status: string
  signed_at: string | null
}

const n = (v: any) => (v == null || v === "" ? 0 : Number(v))
const money = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v.toFixed(0)}`)
const mult = (v: number) => (isFinite(v) ? `${v.toFixed(2)}×` : "—")
const label = (s: string | null) => (s ? s.replace(/_/g, " ") : "—")

export function PartnersTable({ rows, asOf }: { rows: Lp[]; asOf?: string }) {
  const totalCommit = rows.reduce((s, r) => s + n(r.commitment_amount), 0)
  const totalCalled = rows.reduce((s, r) => s + n(r.called_amount), 0)
  const totalDist = rows.reduce((s, r) => s + n(r.distributed_amount), 0)
  const metrics: Metric[] = [
    { label: "Limited Partners", value: rows.length },
    { label: "Total commitment", value: money(totalCommit) },
    { label: "Called", value: money(totalCalled), hint: totalCommit ? `${((totalCalled / totalCommit) * 100).toFixed(0)}% of commitments` : undefined },
    { label: "DPI", value: mult(totalCalled ? totalDist / totalCalled : 0), hint: `distributed ${money(totalDist)}` },
  ]

  const columns: Column<Lp>[] = [
    { key: "lp_name", header: "Partner", render: (r) => <span className="font-medium">{r.lp_name}</span>, total: () => "Total" },
    { key: "lp_type", header: "Type", value: (r) => label(r.lp_type), render: (r) => <span className="capitalize text-muted-foreground">{label(r.lp_type)}</span> },
    { key: "commitment_amount", header: "Commitment", numeric: true, value: (r) => n(r.commitment_amount), render: (r) => money(n(r.commitment_amount)), total: (rs) => money(rs.reduce((s, r) => s + n(r.commitment_amount), 0)) },
    { key: "called_amount", header: "Called", numeric: true, value: (r) => n(r.called_amount), render: (r) => money(n(r.called_amount)), total: (rs) => money(rs.reduce((s, r) => s + n(r.called_amount), 0)) },
    { key: "uncalled", header: "Uncalled", numeric: true, value: (r) => n(r.commitment_amount) - n(r.called_amount), render: (r) => money(n(r.commitment_amount) - n(r.called_amount)), total: (rs) => money(rs.reduce((s, r) => s + n(r.commitment_amount) - n(r.called_amount), 0)) },
    { key: "distributed_amount", header: "Distributed", numeric: true, value: (r) => n(r.distributed_amount), render: (r) => money(n(r.distributed_amount)), total: (rs) => money(rs.reduce((s, r) => s + n(r.distributed_amount), 0)) },
    { key: "dpi", header: "DPI", numeric: true, value: (r) => (n(r.called_amount) ? n(r.distributed_amount) / n(r.called_amount) : 0), render: (r) => mult(n(r.called_amount) ? n(r.distributed_amount) / n(r.called_amount) : 0) },
    { key: "ownership_pct", header: "Ownership", numeric: true, value: (r) => n(r.ownership_pct), render: (r) => `${n(r.ownership_pct).toFixed(1)}%`, total: (rs) => `${rs.reduce((s, r) => s + n(r.ownership_pct), 0).toFixed(1)}%` },
    {
      key: "status", header: "Status", value: (r) => r.status,
      render: (r) => (
        <span className={`text-[11px] font-mono uppercase tracking-wider rounded-full px-2 py-0.5 border ${r.status === "fully_called" ? "text-emerald-600 border-emerald-600/30" : r.status === "defaulted" ? "text-rose-600 border-rose-600/30" : "text-muted-foreground border-foreground/20"}`}>
          {label(r.status)}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <MetricTiles metrics={metrics} />
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        asOf={asOf}
        exportName="partners"
        searchPlaceholder="Search partners…"
        initialSort={{ key: "commitment_amount", dir: "desc" }}
        emptyText="No limited partners yet."
        renderExpanded={(r) => (
          <div className="grid sm:grid-cols-4 gap-4 text-sm">
            <div><div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Signed</div><div>{r.signed_at ?? "—"}</div></div>
            <div><div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Uncalled</div><div>{money(n(r.commitment_amount) - n(r.called_amount))}</div></div>
            <div><div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">% Called</div><div>{n(r.commitment_amount) ? `${((n(r.called_amount) / n(r.commitment_amount)) * 100).toFixed(0)}%` : "—"}</div></div>
            <div><div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Type</div><div className="capitalize">{label(r.lp_type)}</div></div>
          </div>
        )}
      />
    </div>
  )
}
