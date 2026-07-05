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
import {
  getLatestSnapshot, computeDelta, recommendNextFields,
} from "@/lib/portfolio/fund-assessment-history"
import { getAssessmentMeta } from "@/lib/portfolio/fund-assessment-generation"
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
  // Phase 2 additions: latest snapshot drives the +N delta badge, the
  // recommendations engine ranks unfilled fields by score-gain. Both are
  // computed server-side so the client renders the right values on first
  // paint (no flicker).
  const prior = await getLatestSnapshot(fund.id)
  const initialDelta = computeDelta(initial.completion, prior)
  const initialRecommendations = recommendNextFields(initial.values, 5)
  // Phase 3: meta carries the per-field confidence + provenance for the
  // 19 AI-generated fields. Empty {} for funds that haven't been generated
  // yet (or before the migration runs).
  const initialMeta = await getAssessmentMeta(fund.id)

  return (
    <FundAssessmentClient
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
