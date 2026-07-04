/**
 * /dashboard/portfolio/fund/management — management company + studio.
 *
 * Phase 6 of FUND_OPS_DESIGN.md (§3.4/§3.5): budget vs. actuals for the
 * management company with fee income auto-fed from Phase-4 accruals,
 * and the studio project pipeline whose spinout writes the Phase-1
 * investments spine.
 */
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { getFundBySlug } from "@/lib/portfolio/funds"
import {
  getMcOverview, listActuals, listProjects, hasMcTables,
} from "@/lib/portfolio/management-company"
import { ManagementClient } from "@/components/portfolio/management-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "Management Co — Anker" }

export default async function ManagementPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const fund = await getFundBySlug("svs-fund-ii")
  if (!fund) redirect("/dashboard/portfolio/fund")

  const year = new Date().getFullYear()
  const tablesReady = await hasMcTables()
  const [overview, actuals, projects] = tablesReady
    ? await Promise.all([
        getMcOverview(fund.id, year), listActuals(fund.id, year), listProjects(fund.id),
      ])
    : [null, [], []]

  return (
    <ManagementClient
      fund={fund}
      year={year}
      initialOverview={overview}
      initialActuals={actuals}
      initialProjects={projects}
      tablesReady={tablesReady}
    />
  )
}
