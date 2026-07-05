import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { getFundBySlug, getFundLpRollup, listLps } from "@/lib/portfolio/funds"
import { listCalls } from "@/lib/portfolio/capital-calls"
import { CapitalCallsListClient } from "@/components/portfolio/capital-calls-list-client"

export const dynamic = "force-dynamic"

export default async function CallsPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const fund = await getFundBySlug("svs-fund-ii")
  if (!fund) redirect("/dashboard/portfolio/fund")

  const [calls, rollup, lps] = await Promise.all([
    listCalls(fund.id),
    getFundLpRollup(fund.id),
    listLps(fund.id),
  ])

  return (
    <CapitalCallsListClient
      fund={fund}
      initialCalls={calls}
      rollup={rollup}
      lpCount={lps.filter((l) => l.status !== "transferred").length}
    />
  )
}
