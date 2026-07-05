/**
 * Fund assessment — interactive radial wheel viewer.
 *
 * Route: /dashboard/portfolio/fund/assessment/wheel
 *
 * Reads the same assessment data as the flat-form editor, but renders it
 * as a 6-wedge radial visualisation. Same auto-save, same generation
 * pipeline; the SVG is just an alternate view. The form page links over
 * here, and the wheel page links back.
 *
 * Server side: identical data-loading to the flat-form page so first-paint
 * has values, completion, delta, recommendations, and meta all populated.
 */
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { getAssessment } from "@/lib/portfolio/fund-assessment"
import {
  getLatestSnapshot, computeDelta, recommendNextFields,
} from "@/lib/portfolio/fund-assessment-history"
import { getAssessmentMeta } from "@/lib/portfolio/fund-assessment-generation"
import { TAXONOMY } from "@/lib/portfolio/fund-assessment-taxonomy"
import { FundAssessmentWheelClient } from "@/components/portfolio/fund-assessment-wheel-client"

export const dynamic = "force-dynamic"

export default async function FundAssessmentWheelPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const fund = await getFundBySlug("svs-fund-ii")
  if (!fund) redirect("/dashboard/portfolio/fund")

  const initial = await getAssessment(fund.id)
  const prior = await getLatestSnapshot(fund.id)
  const initialDelta = computeDelta(initial.completion, prior)
  const initialRecommendations = recommendNextFields(initial.values, 5)
  const initialMeta = await getAssessmentMeta(fund.id)

  return (
    <FundAssessmentWheelClient
      fund={fund}
      taxonomy={TAXONOMY}
      initialValues={initial.values}
      initialCompletion={initial.completion}
      initialDelta={initialDelta}
      initialRecommendations={initialRecommendations}
      initialMeta={initialMeta}
    />
  )
}
