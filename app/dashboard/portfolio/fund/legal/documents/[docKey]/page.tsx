/**
 * Legal & Compliance — single document viewer + in-browser editor.
 *
 * Route: /dashboard/portfolio/fund/legal/documents/[docKey]
 *
 * Server pre-fetches:
 *   - the field-substituted template body (with TBD spans for the
 *     read-only view)
 *   - any per-fund override stored in funds.legal_document_overrides
 *
 * Hands both off to <LegalDocumentEditor>, which owns the Edit/Save/
 * Discard UI and the Word/PDF/Markdown download buttons.
 */
import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { getLegalFields } from "@/lib/portfolio/legal-fields"
import { renderTemplate } from "@/lib/portfolio/legal-template-renderer"
import { DOCS_BY_KEY } from "@/lib/portfolio/legal-catalogue"
import { getDocumentOverride } from "@/lib/portfolio/legal-document-overrides"
import { LegalDocumentEditor } from "@/components/portfolio/legal-document-editor"

export const dynamic = "force-dynamic"

export default async function LegalDocumentPage({
  params,
}: {
  params: Promise<{ docKey: string }>
}) {
  const { docKey } = await params
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const fund = await getFundBySlug("svs-fund-ii")
  if (!fund) redirect("/dashboard/portfolio/fund")

  const payload = await getLegalFields(fund.id)
  if (!payload) redirect("/dashboard/portfolio/fund")

  const rendered = renderTemplate(docKey, payload.values, payload.approvals)
  if (!rendered) notFound()

  // Check for an existing per-fund edit. If present, the editor opens
  // on the override; otherwise it shows the field-substituted template.
  const override = await getDocumentOverride(fund.id, docKey)

  const catalogueEntry = DOCS_BY_KEY[docKey]
  const editorBase = "/dashboard/portfolio/fund/legal/fields"

  return (
    <LegalDocumentEditor
      fundId={fund.id}
      fundName={fund.name}
      editorBase={editorBase}
      catalogueEntry={catalogueEntry}
      initial={{
        docKey: rendered.template.docKey,
        title: rendered.template.title,
        source: rendered.template.source,
        body: override?.body ?? rendered.body,
        templateBody: rendered.body,
        isOverride: !!override,
        overrideUpdatedAt: override?.updatedAt ?? null,
        overrideUpdatedBy: override?.updatedBy ?? null,
        stats: rendered.stats,
      }}
    />
  )
}
