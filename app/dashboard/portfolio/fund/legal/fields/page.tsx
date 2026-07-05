/**
 * Legal & Compliance — fields editor.
 *
 * Route: /dashboard/portfolio/fund/legal/fields
 *
 * Phase 2 of the legal component. Surfaces all 94 fields organised by
 * section with the 3-state approval workflow (Empty → Filled → Approved)
 * and the All / Empty / Filled / Approved filter tabs from the
 * reference screenshot.
 */
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { getLegalFields } from "@/lib/portfolio/legal-fields"
import { getLegalFieldsMeta } from "@/lib/portfolio/legal-fields-generation"
import { getReviewState } from "@/lib/portfolio/legal-reviews"
import { LEGAL_FIELD_SECTIONS } from "@/lib/portfolio/legal-fields-taxonomy"
import { DOCUMENT_CATALOGUE, docsForDomicile, type FundDomicile } from "@/lib/portfolio/legal-catalogue"
import { LegalFieldsClient } from "@/components/portfolio/legal-fields-client"

export const dynamic = "force-dynamic"

export default async function LegalFieldsPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const fund = await getFundBySlug("svs-fund-ii")
  if (!fund) redirect("/dashboard/portfolio/fund")

  const payload = await getLegalFields(fund.id)
  if (!payload) redirect("/dashboard/portfolio/fund")
  // Phase-3 AI generation metadata. Empty {} when nothing has been
  // generated yet or before the meta-column migration has run.
  const initialMeta = await getLegalFieldsMeta(fund.id)
  const initialReviewState = await getReviewState(fund.id)

  // Filter the catalogue by the fund's chosen domicile so each field
  // card's chip cluster only surfaces jurisdiction-applicable docs.
  const domicile = (payload.values.fund_domicile as FundDomicile) ?? "global"
  const filteredCatalogue = docsForDomicile(domicile)

  return (
    <LegalFieldsClient
      payload={payload}
      sections={LEGAL_FIELD_SECTIONS}
      catalogue={filteredCatalogue}
      initialMeta={initialMeta}
      initialReviewState={initialReviewState}
    />
  )
}
