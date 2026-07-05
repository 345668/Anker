import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { getFundBySlug, listLps } from "@/lib/portfolio/funds"
import {
  listDistributions, getFundDistributionRollup,
} from "@/lib/portfolio/distributions"
import { listCompanies } from "@/lib/portfolio/queries"
import { DistributionsListClient } from "@/components/portfolio/distributions-list-client"

export const dynamic = "force-dynamic"

export default async function DistributionsPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const fund = await getFundBySlug("svs-fund-ii")
  if (!fund) redirect("/dashboard/portfolio/fund")

  const [distributions, rollup, lps, companies] = await Promise.all([
    listDistributions(fund.id),
    getFundDistributionRollup(fund.id),
    listLps(fund.id),
    listCompanies({ fundId: fund.slug, limit: 200 }),
  ])

  return (
    <DistributionsListClient
      fund={fund}
      initialDistributions={distributions}
      rollup={rollup}
      activeLpCount={lps.filter((l) => l.status !== "transferred").length}
      companies={companies.rows.map((c) => ({ id: c.id, name: c.name, status: c.status }))}
    />
  )
}
