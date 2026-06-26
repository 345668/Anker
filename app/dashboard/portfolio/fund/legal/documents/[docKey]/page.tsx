/**
 * Legal & Compliance — single document viewer.
 *
 * Route: /dashboard/portfolio/fund/legal/documents/[docKey]
 *
 * Phase 6: renders the requested template with the fund's current
 * legal-field values substituted. TBD slots are clickable amber pills
 * that deep-link back to the editor with ?field=<key>.
 */
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Download, Printer, FileText, ExternalLink, Lock } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { getLegalFields } from "@/lib/portfolio/legal-fields"
import { renderTemplate } from "@/lib/portfolio/legal-template-renderer"
import { DOCS_BY_KEY } from "@/lib/portfolio/legal-catalogue"
import { LegalDocumentRenderedBody } from "@/components/portfolio/legal-document-rendered-body"

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

  const catalogueEntry = DOCS_BY_KEY[docKey]
  const editorBase = "/dashboard/portfolio/fund/legal/fields"
  const downloadHref = `/api/portfolio/funds/${fund.id}/legal/documents/${docKey}?format=md`

  return (
    <main className="min-h-screen bg-foreground/[0.97] text-background">
      <header className="border-b border-background/10 bg-foreground/95 backdrop-blur">
        <div className="px-6 py-3 flex items-center gap-3 flex-wrap">
          <Link
            href="/dashboard/portfolio/fund/legal/documents"
            className="inline-flex items-center gap-1 text-xs font-mono uppercase tracking-wider text-background/70 hover:text-background"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> All documents
          </Link>
          <div className="w-px h-5 bg-background/15" />
          <FileText className="w-4 h-4 text-background/60" />
          <h1 className="text-sm font-medium">{rendered.template.title}</h1>
          {catalogueEntry?.entityKind && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-background/40 px-2 py-0.5 border border-background/15 rounded">
              {catalogueEntry.entityKind.replace(/_/g, " ")}
            </span>
          )}
          <div className="flex-1" />
          <a
            href={downloadHref}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-background/15 text-background/80 hover:bg-background/10"
          >
            <Download className="w-3.5 h-3.5" /> Markdown
          </a>
          <Link
            href={`${editorBase}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-background/15 text-background/80 hover:bg-background/10"
          >
            Edit fields <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
        {/* Slot stats */}
        <div className="px-6 pb-3 space-y-1.5">
          <div className="flex items-center gap-3 text-[11px] font-mono uppercase tracking-wider">
            <span className="text-background/60">Slots</span>
            <span className="text-background/40">·</span>
            <span><span className="text-emerald-400">{rendered.stats.approvedSlots}</span> approved</span>
            <span><span className="text-amber-400">{rendered.stats.filledSlots - rendered.stats.approvedSlots}</span> filled</span>
            <span><span className="text-rose-300">{rendered.stats.tbdSlots}</span> TBD</span>
            <span className="text-background/40">·</span>
            <span className="text-background/60">{rendered.stats.totalSlots} total</span>
          </div>
          <div className="h-1.5 w-full bg-background/10 rounded overflow-hidden flex">
            <div className="h-full bg-emerald-500"
              style={{ width: `${(rendered.stats.approvedSlots / Math.max(1, rendered.stats.totalSlots)) * 100}%` }} />
            <div className="h-full bg-amber-500"
              style={{ width: `${((rendered.stats.filledSlots - rendered.stats.approvedSlots) / Math.max(1, rendered.stats.totalSlots)) * 100}%` }} />
          </div>
        </div>
      </header>

      {/* Source citation banner */}
      <div className="border-b border-background/10 bg-background/[0.03] px-6 py-2.5">
        <div className="max-w-4xl mx-auto flex items-start gap-2 text-[11px] text-background/60 italic">
          <Lock className="w-3 h-3 mt-0.5 shrink-0" />
          <span>
            <span className="font-mono uppercase tracking-wider text-background/50 not-italic">Source · </span>
            {rendered.template.source}
          </span>
        </div>
      </div>

      {/* Counsel disclaimer */}
      <div className="border-b border-background/10 bg-amber-500/[0.04] px-6 py-2 text-[11px] text-amber-200/85 text-center">
        <strong className="font-medium">Not legal advice.</strong> Templates are starting points only — outside counsel must review and finalize every executed document.
      </div>

      <article className="max-w-4xl mx-auto px-8 py-10">
        <LegalDocumentRenderedBody body={rendered.body} editorBase={editorBase} />
      </article>
    </main>
  )
}
