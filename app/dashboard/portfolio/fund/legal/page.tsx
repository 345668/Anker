/**
 * Legal & Compliance — canvas view.
 *
 * Route: /dashboard/portfolio/fund/legal
 *
 * Phase 1 of the legal component. Shows the 3-entity hierarchy
 * (Management Company → GP → Fund) with document cards underneath each.
 * Auto-seeds entities + documents on first visit via getLegalTree.
 *
 * Phases 2-6 add: 94-field editor, computed/AI fields, document review
 * viewer with TBD placeholders, submit-for-legal-review workflow, and
 * finally the 13 actual document templates.
 */
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { getLegalTree } from "@/lib/portfolio/legal"
import { LegalCanvasClient } from "@/components/portfolio/legal-canvas-client"

export const dynamic = "force-dynamic"

export default async function FundLegalPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const fund = await getFundBySlug("svs-fund-ii")
  if (!fund) redirect("/dashboard/portfolio/fund")

  const tree = await getLegalTree(fund.id)
  if (!tree) redirect("/dashboard/portfolio/fund")

  return <LegalCanvasClient tree={tree} />
}
