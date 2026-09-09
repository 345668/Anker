import { requireActiveFund } from "@/lib/auth/fund-access"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import {
  listLps, getFundLpRollup, getFundSubscriptionFunnel,
} from "@/lib/portfolio/funds"
import { FundDetailClient } from "@/components/portfolio/fund-detail-client"

export const dynamic = "force-dynamic"

/**
 * /dashboard/portfolio/fund — Canonical fund profile + LP table.
 *
 * MVP scope: shows the svs-fund-ii fund, lazily seeds it if the migration
 * inserted nothing, then renders a single profile/LP page.  When multi-fund
 * support lands the route will switch to /dashboard/portfolio/funds/[slug].
 */
export default async function FundPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")

  const fund = await requireActiveFund()

  const [lps, rollup, funnel] = await Promise.all([
    listLps(fund.id),
    getFundLpRollup(fund.id),
    getFundSubscriptionFunnel(fund.id),
  ])

  return <FundDetailClient initialFund={fund} initialLps={lps} initialRollup={rollup} initialFunnel={funnel} />
}
