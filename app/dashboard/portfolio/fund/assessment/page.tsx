/**
 * Fund assessment editor.
 *
 * Surfaces all 158 fields from lib/portfolio/fund-assessment-taxonomy.ts
 * organised by domain → sub-category. Each field is an editable input
 * (or a read-only display for `generated` / `computed` ones). The header
 * shows the Strength score plus per-domain completion.
 *
 * Phase 1: flat form view. Phase 4 will replace this with the interactive
 * radial wheel; both consume the same getAssessment() result, so swapping
 * the renderer doesn't touch the data layer.
 */
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { getAssessment } from "@/lib/portfolio/fund-assessment"
import { TAXONOMY } from "@/lib/portfolio/fund-assessment-taxonomy"
import { FundAssessmentClient } from "@/components/portfolio/fund-assessment-client"

export const dynamic = "force-dynamic"

export default async function FundAssessmentPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const fund = await getFundBySlug("svs-fund-ii")
  if (!fund) redirect("/dashboard/portfolio/fund")

  const initial = await getAssessment(fund.id)

  return (
    <FundAssessmentClient
      fund={fund}
      taxonomy={TAXONOMY}
      initialValues={initial.values}
      initialCompletion={initial.completion}
    />
  )
}
