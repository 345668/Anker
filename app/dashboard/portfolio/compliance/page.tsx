import { requireActiveFund } from "@/lib/auth/fund-access"
import { getComplianceOverview } from "@/lib/portfolio/compliance"
import { ComplianceClient } from "@/components/portfolio/compliance-client"

export const dynamic = "force-dynamic"

/**
 * /dashboard/portfolio/compliance — the fund's regulatory obligation register.
 *
 * A short intake profile drives which of the 27 catalog obligations apply;
 * the team overrides/dismisses items and tracks each year's filing deadlines.
 * Feature adapted from Hemrock Portfolio Reporting (Apache-2.0); see NOTICE.
 */
export default async function CompliancePage() {
  const fund = await requireActiveFund()

  const year = new Date().getUTCFullYear()
  const fundId = fund.id
  const data = fundId ? await getComplianceOverview(fundId, year) : null

  return (
    <ComplianceClient
      key={fund.id}
      fundId={fundId ?? ""}
      year={year}
      initialProfile={data?.profile ?? null}
      initialRegister={data?.register ?? []}
      initialSummary={data?.summary ?? { total: 0, applies: 0, needsReview: 0, filed: 0, overdue: 0 }}
    />
  )
}
