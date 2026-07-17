import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
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
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const fundId = "svs-fund-ii"
  const { rows } = await listCompanies({ fundId, limit: 500 })
  const companies = rows.map((c) => ({ id: c.id, name: c.name }))

  return <KpiUpdatesClient companies={companies} />
}
