/**
 * /dashboard/portfolio/fund/economics — fees & carry.
 *
 * Phase 4 of FUND_OPS_DESIGN.md: management-fee schedule + quarterly
 * accruals (booked into the Phase-3 ledger), and the European waterfall
 * engine whose runs pre-fill distribution drafts.
 */
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { getFundBySlug, getFundLpRollup } from "@/lib/portfolio/funds"
import { getFeeSchedule, listAccruals, hasFeeTables } from "@/lib/portfolio/fund-fees"
import { listRuns, hasWaterfallTable } from "@/lib/portfolio/waterfall"
import { FundEconomicsClient } from "@/components/portfolio/fund-economics-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "Fees & Carry — Anker" }

export default async function EconomicsPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const fund = await getFundBySlug("svs-fund-ii")
  if (!fund) redirect("/dashboard/portfolio/fund")

  const [feesReady, waterfallReady] = await Promise.all([hasFeeTables(), hasWaterfallTable()])
  const [schedule, accruals, runs, rollup] = await Promise.all([
    feesReady ? getFeeSchedule(fund.id) : null,
    feesReady ? listAccruals(fund.id) : [],
    waterfallReady ? listRuns(fund.id) : [],
    getFundLpRollup(fund.id),
  ])

  return (
    <FundEconomicsClient
      fund={fund}
      initialSchedule={schedule}
      initialAccruals={accruals}
      initialRuns={runs}
      rollup={rollup}
      tablesReady={feesReady && waterfallReady}
    />
  )
}
