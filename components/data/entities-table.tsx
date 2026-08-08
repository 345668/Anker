"use client"

import { DataTable, type Column } from "./data-table"
import { MetricTiles, type Metric } from "./metric-tiles"

type Fund = {
  id: string; name: string; vintage_year: number | null; target_size: string | number | null
  currency: string | null; status: string | null; management_fee_pct: string | number | null
  carry_pct: string | number | null; term_years: number | null; description: string | null
}
type Workspace = { orgId: string; name: string; kind: string; persona: string | null; orgRole: string }

const num = (v: any) => (v == null || v === "" ? null : Number(v))
function money(v: any, ccy?: string | null) {
  const n = num(v)
  if (n == null) return "—"
  const sym = ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : "$"
  return n >= 1e6 ? `${sym}${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${sym}${(n / 1e3).toFixed(0)}K` : `${sym}${n}`
}
const pct = (v: any) => (num(v) == null ? "—" : `${num(v)}%`)

function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "green" | "amber" }) {
  const cls = tone === "green" ? "text-emerald-600 border-emerald-600/30" : tone === "amber" ? "text-amber-600 border-amber-600/30" : "text-muted-foreground border-foreground/20"
  return <span className={`inline-block text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border ${cls}`}>{children}</span>
}

export function EntitiesTable({ mode, rows, asOf }: { mode: "funds" | "workspaces"; rows: any[]; asOf?: string }) {
  if (mode === "funds") {
    const funds = rows as Fund[]
    const totalTarget = funds.reduce((s, f) => s + (num(f.target_size) ?? 0), 0)
    const active = funds.filter((f) => (f.status ?? "").toLowerCase() === "active").length
    const metrics: Metric[] = [
      { label: "Funds & SPVs", value: funds.length },
      { label: "Active", value: active },
      { label: "Total target size", value: money(totalTarget) },
      { label: "Avg. carry", value: funds.length ? `${(funds.reduce((s, f) => s + (num(f.carry_pct) ?? 0), 0) / funds.length).toFixed(0)}%` : "—" },
    ]
    const columns: Column<Fund>[] = [
      { key: "name", header: "Name", render: (f) => <span className="font-medium">{f.name}</span> },
      { key: "vintage_year", header: "Vintage", numeric: true, value: (f) => num(f.vintage_year), render: (f) => f.vintage_year ?? "—" },
      { key: "target_size", header: "Target size", numeric: true, value: (f) => num(f.target_size), render: (f) => money(f.target_size, f.currency), total: (rs) => money(rs.reduce((s, f) => s + (num(f.target_size) ?? 0), 0)) },
      { key: "status", header: "Status", value: (f) => f.status ?? "", render: (f) => <Badge tone={(f.status ?? "").toLowerCase() === "active" ? "green" : "muted"}>{f.status ?? "—"}</Badge> },
      { key: "management_fee_pct", header: "Mgmt fee", numeric: true, value: (f) => num(f.management_fee_pct), render: (f) => pct(f.management_fee_pct) },
      { key: "carry_pct", header: "Carry", numeric: true, value: (f) => num(f.carry_pct), render: (f) => pct(f.carry_pct) },
      { key: "term_years", header: "Term", numeric: true, value: (f) => num(f.term_years), render: (f) => (f.term_years ? `${f.term_years}y` : "—"), defaultHidden: true },
    ]
    return (
      <div className="space-y-6">
        <MetricTiles metrics={metrics} />
        <DataTable
          columns={columns}
          rows={funds}
          getRowId={(f) => f.id}
          asOf={asOf}
          exportName="entities"
          searchPlaceholder="Search funds & SPVs…"
          initialSort={{ key: "target_size", dir: "desc" }}
          emptyText="No funds yet."
          renderExpanded={(f) => (
            <div className="text-sm text-muted-foreground">
              <div className="grid sm:grid-cols-3 gap-4">
                <div><div className="text-[10px] font-mono uppercase tracking-wider">Vintage</div><div className="text-foreground">{f.vintage_year ?? "—"}</div></div>
                <div><div className="text-[10px] font-mono uppercase tracking-wider">Term</div><div className="text-foreground">{f.term_years ? `${f.term_years} years` : "—"}</div></div>
                <div><div className="text-[10px] font-mono uppercase tracking-wider">Fee / Carry</div><div className="text-foreground">{pct(f.management_fee_pct)} / {pct(f.carry_pct)}</div></div>
              </div>
              {f.description ? <p className="mt-3 max-w-2xl">{f.description}</p> : null}
            </div>
          )}
        />
      </div>
    )
  }

  const ws = rows as Workspace[]
  const metrics: Metric[] = [
    { label: "Workspaces", value: ws.length },
    { label: "Funds", value: ws.filter((w) => w.kind === "fund").length },
    { label: "Companies", value: ws.filter((w) => w.kind === "company").length },
  ]
  const columns: Column<Workspace>[] = [
    { key: "name", header: "Name", render: (w) => <span className="font-medium">{w.name}</span> },
    { key: "kind", header: "Type", value: (w) => w.kind, render: (w) => <Badge tone={w.kind === "fund" ? "amber" : "muted"}>{w.kind}</Badge> },
    { key: "persona", header: "Persona", value: (w) => w.persona ?? "", render: (w) => w.persona ?? "—" },
    { key: "orgRole", header: "Role", value: (w) => w.orgRole, render: (w) => w.orgRole.replace("_", " ") },
  ]
  return (
    <div className="space-y-6">
      <MetricTiles metrics={metrics} columns={3} />
      <DataTable columns={columns} rows={ws} getRowId={(w) => w.orgId} exportName="workspaces" searchPlaceholder="Search workspaces…" emptyText="No workspaces yet." />
    </div>
  )
}
