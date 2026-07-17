import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { getComplianceOverview } from "@/lib/portfolio/compliance"
import { resolveComplianceFundId } from "@/lib/portfolio/compliance-fund"
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
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const year = new Date().getUTCFullYear()
  const fundId = await resolveComplianceFundId(null)
  const data = fundId ? await getComplianceOverview(fundId, year) : null

  return (
    <ComplianceClient
      fundId={fundId ?? ""}
      year={year}
      initialProfile={data?.profile ?? null}
      initialRegister={data?.register ?? []}
      initialSummary={data?.summary ?? { total: 0, applies: 0, needsReview: 0, filed: 0, overdue: 0 }}
    />
  )
}
