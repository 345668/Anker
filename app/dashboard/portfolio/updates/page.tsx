import { requireActiveFund } from "@/lib/auth/fund-access"
import { listCompanies } from "@/lib/portfolio/queries"
import { KpiUpdatesClient } from "@/components/portfolio/kpi-updates-client"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Portfolio Updates — Anker",
  description: "Paste founder investor updates; AI extracts the KPIs into a review queue.",
}

/**
 * /dashboard/portfolio/updates — KPI update ingestion.
 *
 * Paste an investor update; the AI extracts a month of KPIs and queues it
 * for review. Approve to write portfolio_kpis_monthly. Feature adapted from
 * Hemrock Portfolio Reporting (Apache-2.0); see NOTICE.
 */
export default async function PortfolioUpdatesPage() {
  const fund = await requireActiveFund()

  const fundId = fund.id
  const { rows } = await listCompanies({ fundId, limit: 500 })
  const companies = rows.map((c) => ({ id: c.id, name: c.name }))

  return <KpiUpdatesClient key={fund.id} fundId={fund.id} companies={companies} />
}
