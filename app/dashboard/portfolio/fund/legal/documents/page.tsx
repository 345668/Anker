/**
 * Legal & Compliance — document review viewer.
 *
 * Route: /dashboard/portfolio/fund/legal/review
 *
 * Phase 4 of the legal component. Renders each of the 13 documents
 * with its bound fields inlined. Empty fields become TBD pills that
 * deep-link back to /legal/fields?field=<key>.
 */
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { getLegalFields } from "@/lib/portfolio/legal-fields"
import { getLegalFieldsMeta } from "@/lib/portfolio/legal-fields-generation"
import { LEGAL_FIELD_SECTIONS } from "@/lib/portfolio/legal-fields-taxonomy"
import { DOCUMENT_CATALOGUE } from "@/lib/portfolio/legal-catalogue"
import { LegalReviewClient } from "@/components/portfolio/legal-review-client"

export const dynamic = "force-dynamic"

export default async function LegalReviewPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const fund = await getFundBySlug("svs-fund-ii")
  if (!fund) redirect("/dashboard/portfolio/fund")

  const payload = await getLegalFields(fund.id)
  if (!payload) redirect("/dashboard/portfolio/fund")
  const initialMeta = await getLegalFieldsMeta(fund.id)

  return (
    <LegalReviewClient
      payload={payload}
      sections={LEGAL_FIELD_SECTIONS}
      catalogue={DOCUMENT_CATALOGUE}
      initialMeta={initialMeta}
    />
  )
}
