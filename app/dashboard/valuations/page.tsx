import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { requirePersona } from "@/lib/auth/persona-guard"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { listInvestments, getFundNav } from "@/lib/portfolio/investments"
import { PageShell, PageHeader } from "@/components/shell/page-header"
import { MetricTiles, type Metric } from "@/components/data/metric-tiles"
import { DataTable } from "@/components/data/data-table"

export const dynamic = "force-dynamic"
export const metadata = { title: "Valuations — Anker" }

const money = (v: number | null | undefined) => (v == null ? "—" : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${Math.round(Number(v)).toLocaleString()}`)
const mult = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(2)}×`)
const METHOD_LABEL: Record<string, string> = { cost: "At cost", last_round: "Last round", mark: "Mark", write_down: "Write-down", write_off: "Write-off", exit: "Exit" }

export default async function ValuationsPage() {
  await requirePersona(["vc"])
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const fund = await getFundBySlug("svs-fund-ii")
  const [investments, nav] = fund ? await Promise.all([listInvestments(fund.id), getFundNav(fund.id)]) : [[], null]

  const rows = investments.map((i) => {
    const cost = Number(i.cost_basis) || 0
    const fv = i.current_fair_value != null ? Number(i.current_fair_value) : null
    return {
      id: i.id,
      company: i.company_name,
      method: i.current_value_method ?? "cost",
      as_of: i.current_value_as_of ?? null,
      cost,
      fair_value: fv,
      moic: fv != null && cost > 0 ? fv / cost : null,
      status: i.status,
    }
  })

  const marked = rows.filter((r) => r.fair_value != null && r.method !== "cost").length
  const lastMark = rows.map((r) => r.as_of).filter(Boolean).sort().reverse()[0] ?? null

  const summary: Metric[] = [
    { label: "Fund NAV", value: money(nav?.positionsFairValue) },
    { label: "Positions", value: rows.length, hint: `${marked} marked above cost basis` },
    { label: "Unrealized gain", value: money(nav ? nav.unrealizedGain : null) },
    { label: "Latest mark", value: lastMark ? new Date(lastMark).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—" },
  ]

  return (
    <PageShell>
      <PageHeader eyebrow="Fund back-office" title="Valuations" description="Every position's latest mark, method, and as-of date — the fair-value basis behind fund NAV." />
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
            { key: "as_of", header: "As of", value: (r) => r.as_of ?? "", render: (r) => r.as_of ? new Date(r.as_of).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—" },
            { key: "cost", header: "Cost basis", numeric: true, value: (r) => r.cost, render: (r) => money(r.cost), total: (rs) => money(rs.reduce((s, r) => s + r.cost, 0)) },
            { key: "fair_value", header: "Fair value", numeric: true, value: (r) => r.fair_value ?? 0, render: (r) => money(r.fair_value), total: (rs) => money(rs.reduce((s, r) => s + (r.fair_value ?? 0), 0)) },
            { key: "moic", header: "MOIC", numeric: true, value: (r) => r.moic ?? 0, render: (r) => mult(r.moic) },
            { key: "status", header: "Status", value: (r) => r.status, render: (r) => <span className="text-muted-foreground capitalize">{r.status.replace("_", " ")}</span> },
          ]}
        />
      </div>
    </PageShell>
  )
}
