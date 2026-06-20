import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { listCompanies, getPortfolioRollup } from "@/lib/portfolio/queries"
import { PortfolioListClient } from "@/components/portfolio/portfolio-list-client"

// Live DB-backed page — always render at request time.
export const dynamic = "force-dynamic"

/**
 * /dashboard/portfolio — Venture-studio P0 entry point.
 *
 * Server component loads the current fund's portfolio + rollup, hands them
 * to a thin client component for filtering / sorting / new-company dialog.
 *
 * Auth: admin-gated for MVP (same as the rest of the admin surface).
 * Once we have a funds table + team membership, this will switch to
 * "any fund manager on a fund this user belongs to."
 */
export default async function PortfolioPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")

  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  // MVP fund scope. When the funds table lands, derive from the user's
  // memberships instead of hardcoding svs-fund-ii.
  const fundId = "svs-fund-ii"
  const [list, rollup] = await Promise.all([
    listCompanies({ fundId, limit: 200 }),
    getPortfolioRollup(fundId),
  ])

  return (
    <PortfolioListClient
      fundId={fundId}
      initialCompanies={list.rows}
      initialRollup={rollup}
    />
  )
}
