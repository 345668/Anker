import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import {
  getFundBySlug, createFund, listLps, getFundLpRollup, getFundSubscriptionFunnel,
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
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const fundSlug = "svs-fund-ii"
  // Migration seeds the row, but for sandboxes where the migration ran but the
  // row was deleted, fall back to a lazy create so the page never 500s.
  let fund = await getFundBySlug(fundSlug)
  if (!fund) {
    fund = await createFund({
      name: "Summit Venture Studio — Fund II",
      slug: fundSlug,
      currency: "USD",
      status: "fundraising",
      managerOrg: "Summit Venture Studio",
      vintageYear: new Date().getUTCFullYear(),
    })
  }

  const [lps, rollup, funnel] = await Promise.all([
    listLps(fund.id),
    getFundLpRollup(fund.id),
    getFundSubscriptionFunnel(fund.id),
  ])

  return <FundDetailClient initialFund={fund} initialLps={lps} initialRollup={rollup} initialFunnel={funnel} />
}
