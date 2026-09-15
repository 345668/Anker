import { notFound } from "next/navigation"
import { requireActiveFund } from "@/lib/auth/fund-access"
import {
  getCompanyById,
  getLatestKpi,
  listKpis,
} from "@/lib/portfolio/queries"
import { PortfolioDetailClient } from "@/components/portfolio/portfolio-detail-client"

export const dynamic = "force-dynamic"

/**
 * /dashboard/portfolio/[id] — One portfolio company.
 *
 * Server pulls the canonical row, the most recent KPI snapshot, and the
 * trailing 24 months of KPI history. The client handles the editable
 * profile form, the "add this month's snapshot" form, and the trend charts.
 */
export default async function PortfolioDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const fund = await requireActiveFund()

  const company = await getCompanyById(id, fund.id)
  if (!company) notFound()
  const [latestKpi, kpiHistory] = await Promise.all([
    getLatestKpi(id),
    listKpis(id, 24),
  ])

  return (
    <PortfolioDetailClient
      initialCompany={company}
      initialLatestKpi={latestKpi}
      initialKpiHistory={kpiHistory}
    />
  )
}
