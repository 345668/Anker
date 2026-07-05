/**
 * /dashboard/portfolio/fund/deals — GP deal-flow board.
 *
 * Phase 2 of FUND_OPS_DESIGN.md: sourced → … → committed → closed with
 * scorecards, IC votes, term grids, and a close action that writes the
 * Phase-1 investments spine.
 */
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { listDeals, getPipelineRollup, hasDealTables } from "@/lib/portfolio/deal-pipeline"
import { DealBoardClient } from "@/components/portfolio/deal-board-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "Deal Pipeline — Anker" }

export default async function DealsPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const fund = await getFundBySlug("svs-fund-ii")
  if (!fund) redirect("/dashboard/portfolio/fund")

  const tablesReady = await hasDealTables()
  const [deals, rollup] = tablesReady
    ? await Promise.all([listDeals(fund.id), getPipelineRollup(fund.id)])
    : [[], null]

  return (
    <DealBoardClient
      fund={fund}
      initialDeals={deals}
      rollup={rollup}
      tablesReady={tablesReady}
    />
  )
}
