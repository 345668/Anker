import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
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

  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")

  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const [company, latestKpi, kpiHistory] = await Promise.all([
    getCompanyById(id),
    getLatestKpi(id),
    listKpis(id, 24),
  ])
  if (!company) notFound()

  return (
    <PortfolioDetailClient
      initialCompany={company}
      initialLatestKpi={latestKpi}
      initialKpiHistory={kpiHistory}
    />
  )
}
