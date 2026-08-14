import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { requirePersona } from "@/lib/auth/persona-guard"
import { getFundBySlug, listLps } from "@/lib/portfolio/funds"
import { listDocuments } from "@/lib/portfolio/data-room"
import { PageShell, PageHeader } from "@/components/shell/page-header"
import { MetricTiles, type Metric } from "@/components/data/metric-tiles"
import { DataTable } from "@/components/data/data-table"

export const dynamic = "force-dynamic"
export const metadata = { title: "Fund Tax — Anker" }

const YEAR = new Date().getFullYear() - 1

export default async function FundTaxPage() {
  await requirePersona(["vc"])
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const fund = await getFundBySlug("svs-fund-ii")
  const [lps, docs] = fund
    ? await Promise.all([
        listLps(fund.id).then((l) => l.filter((x) => x.status !== "transferred")),
        listDocuments({ fundId: fund.id, category: "k1", limit: 500 }),
      ])
    : [[], { rows: [] as any[] }]

  // A K-1 is "issued" for an LP when a k1-category doc scoped to that LP exists.
  const issuedFor = new Set((docs.rows ?? []).map((d: any) => d.fund_lp_id).filter(Boolean))
  const rows = lps.map((l) => ({ id: l.id, name: l.lp_name, type: l.lp_type ?? "—", issued: issuedFor.has(l.id) }))
  const issued = rows.filter((r) => r.issued).length

  const summary: Metric[] = [
    { label: `Tax year`, value: YEAR },
    { label: "Investors", value: rows.length },
    { label: "K-1s issued", value: issued, hint: rows.length ? `${Math.round((issued / rows.length) * 100)}% complete` : undefined },
    { label: "Outstanding", value: rows.length - issued },
  ]

  return (
    <PageShell>
      <PageHeader eyebrow="Fund back-office" title="Fund Tax" description="Fund accounting and investor tax in one place — track K-1 issuance, estimates, and filings across the LP base." />
      <MetricTiles metrics={summary} columns={4} />
      <div className="mt-8">
        <DataTable
          rows={rows}
          getRowId={(r) => r.id}
          exportName={`k1-status-${YEAR}`}
          searchPlaceholder="Search investors…"
          emptyText="No investors on file."
          columns={[
            { key: "name", header: "Investor", value: (r) => r.name, render: (r) => <span className="font-medium">{r.name}</span> },
            { key: "type", header: "Type", value: (r) => r.type, render: (r) => <span className="text-muted-foreground capitalize">{String(r.type).replace(/_/g, " ")}</span> },
            { key: "issued", header: `K-1 ${YEAR}`, value: (r) => (r.issued ? 1 : 0), render: (r) => r.issued
              ? <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Issued</span>
              : <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">Outstanding</span> },
          ]}
        />
      </div>
    </PageShell>
  )
}
