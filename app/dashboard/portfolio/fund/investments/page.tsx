/**
 * /dashboard/portfolio/fund/investments — the fund's position book.
 *
 * Phase 1 of FUND_OPS_DESIGN.md: investments spine + valuation snapshots
 * + NAV of record. Lists every position with its latest mark, fund-level
 * NAV / TVPI / DPI / IRR computed from the record, inline mark + new
 * position actions.
 */
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { listInvestments, getFundPerformance, hasInvestmentsTables } from "@/lib/portfolio/investments"
import { InvestmentsClient } from "@/components/portfolio/investments-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "Investments — Anker" }

export default async function InvestmentsPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const fund = await getFundBySlug("svs-fund-ii")
  if (!fund) redirect("/dashboard/portfolio/fund")

  const tablesReady = await hasInvestmentsTables()
  const [investments, performance] = tablesReady
    ? await Promise.all([listInvestments(fund.id), getFundPerformance(fund.id)])
    : [[], null]

  return (
    <InvestmentsClient
      fund={fund}
      initialInvestments={investments}
      performance={performance}
      tablesReady={tablesReady}
    />
  )
}
