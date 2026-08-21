import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { requirePersona } from "@/lib/auth/persona-guard"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { listInvestments, getFundNav } from "@/lib/portfolio/investments"
import { PageShell, PageHeader } from "@/components/shell/page-header"
import { type Metric } from "@/components/data/metric-tiles"
import { ValuationsTableClient } from "@/components/modules/valuations-table-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "Valuations — Anker" }

const money = (v: number | null | undefined) => (v == null ? "—" : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${Math.round(Number(v)).toLocaleString()}`)

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
      <ValuationsTableClient rows={rows} summary={summary} />
    </PageShell>
  )
}
