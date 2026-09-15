import { requireActiveFund } from "@/lib/auth/fund-access"
import { listReports } from "@/lib/portfolio/lp-quarterly-report"
import { LpReportsListClient } from "@/components/portfolio/lp-reports-list-client"

export const dynamic = "force-dynamic"

export default async function LpReportsPage() {
  const fund = await requireActiveFund()

  const fundId = fund.id
  const rows = await listReports(fundId, 40)

  return <LpReportsListClient key={fund.id} fundId={fundId} initialReports={rows} />
}
