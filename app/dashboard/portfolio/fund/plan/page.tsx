/**
 * /dashboard/portfolio/fund/plan — plan vs. actual.
 *
 * Phase 7 of FUND_OPS_DESIGN.md (§3.4): the VC Fund Model's assumptions
 * are saved on the fund and re-computed deterministically; the record
 * (calls, investments, distributions, NAV) provides the actuals. The
 * reserve policy drives the deal pipeline's allocation check.
 */
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { getPlanVsActual } from "@/lib/portfolio/plan-actual"
import { FundPlanClient } from "@/components/portfolio/fund-plan-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "Plan vs Actual — Anker" }

export default async function PlanPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const fund = await getFundBySlug("svs-fund-ii")
  if (!fund) redirect("/dashboard/portfolio/fund")

  const planVsActual = await getPlanVsActual(fund.id)

  return <FundPlanClient fund={fund} initial={planVsActual} />
}
