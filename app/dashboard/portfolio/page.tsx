import { requireActiveFund } from "@/lib/auth/fund-access"
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
 * Access is restricted to the active fund's workspace owner/admin.
 */
export default async function PortfolioPage() {
  const fund = await requireActiveFund()

  const fundId = fund.id
  const [list, rollup] = await Promise.all([
    listCompanies({ fundId, limit: 200 }),
    getPortfolioRollup(fundId),
  ])

  return (
    <PortfolioListClient
      key={fund.id}
      fundId={fundId}
      fundName={fund.name}
      initialCompanies={list.rows}
      initialRollup={rollup}
    />
  )
}
