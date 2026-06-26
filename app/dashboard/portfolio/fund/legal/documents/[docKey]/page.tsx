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
import { ArrowLeft, Download, FileText, ExternalLink, Lock, FileType, FileCode } from "lucide-react"
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
  const apiBase = `/api/portfolio/funds/${fund.id}/legal/documents/${docKey}`

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-foreground/10 bg-background/95 backdrop-blur">
        <div className="px-6 py-3 flex items-center gap-3 flex-wrap">
          <Link
            href="/dashboard/portfolio/fund/legal/documents"
            className="inline-flex items-center gap-1 text-xs font-mono uppercase tracking-wider text-foreground/75 hover:text-foreground"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> All documents
          </Link>
          <div className="w-px h-5 bg-foreground/10" />
          <FileText className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-medium">{rendered.template.title}</h1>
          {catalogueEntry?.entityKind && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 px-2 py-0.5 border border-foreground/15 rounded">
              {catalogueEntry.entityKind.replace(/_/g, " ")}
            </span>
          )}
          <div className="flex-1" />
          {/* Download as Word / PDF / Markdown — Word + PDF are
              editable in the user's own tooling; TBD slots render as
              plain '[ Label · TBD ]' text counsel can fill in directly. */}
          <a
            href={`${apiBase}?format=docx`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-foreground/15 text-foreground/80 hover:bg-foreground/10"
            title="Download as editable Word document"
          >
            <FileType className="w-3.5 h-3.5" /> Word
          </a>
          <a
            href={`${apiBase}?format=pdf`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-foreground/15 text-foreground/80 hover:bg-foreground/10"
            title="Download as PDF"
          >
            <Download className="w-3.5 h-3.5" /> PDF
          </a>
          <a
            href={`${apiBase}?format=md`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-foreground/15 text-foreground/80 hover:bg-foreground/10"
            title="Download as Markdown"
          >
            <FileCode className="w-3.5 h-3.5" /> Markdown
          </a>
          <Link
            href={`${editorBase}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-foreground/15 text-foreground/80 hover:bg-foreground/10"
          >
            Edit fields <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
        {/* Slot stats */}
        <div className="px-6 pb-3 space-y-1.5">
          <div className="flex items-center gap-3 text-[11px] font-mono uppercase tracking-wider">
            <span className="text-muted-foreground">Slots</span>
            <span className="text-muted-foreground/70">·</span>
            <span><span className="text-emerald-600">{rendered.stats.approvedSlots}</span> approved</span>
            <span><span className="text-amber-600">{rendered.stats.filledSlots - rendered.stats.approvedSlots}</span> filled</span>
            <span><span className="text-rose-700">{rendered.stats.tbdSlots}</span> TBD</span>
            <span className="text-muted-foreground/70">·</span>
            <span className="text-muted-foreground">{rendered.stats.totalSlots} total</span>
          </div>
          <div className="h-1.5 w-full bg-foreground/10 rounded overflow-hidden flex">
            <div className="h-full bg-emerald-500"
              style={{ width: `${(rendered.stats.approvedSlots / Math.max(1, rendered.stats.totalSlots)) * 100}%` }} />
            <div className="h-full bg-amber-500"
              style={{ width: `${((rendered.stats.filledSlots - rendered.stats.approvedSlots) / Math.max(1, rendered.stats.totalSlots)) * 100}%` }} />
          </div>
        </div>
      </header>

      {/* Source citation banner */}
      <div className="border-b border-foreground/10 bg-foreground/[0.03] px-6 py-2.5">
        <div className="max-w-4xl mx-auto flex items-start gap-2 text-[11px] text-muted-foreground italic">
          <Lock className="w-3 h-3 mt-0.5 shrink-0" />
          <span>
            <span className="font-mono uppercase tracking-wider text-muted-foreground/80 not-italic">Source · </span>
            {rendered.template.source}
          </span>
        </div>
      </div>

      {/* Counsel disclaimer */}
      <div className="border-b border-foreground/10 bg-amber-500/[0.04] px-6 py-2 text-[11px] text-amber-700/85 text-center">
        <strong className="font-medium">Not legal advice.</strong> Templates are starting points only — outside counsel must review and finalize every executed document.
      </div>

      {/* Paper-style document surface — tinted backdrop wraps a white
          8.5×11-feel card with shadow + serif body type, so the page
          reads as an actual document rather than a webapp form. */}
      <div className="bg-foreground/[0.04] py-10">
        <article className="max-w-[8.5in] mx-auto bg-background shadow-md ring-1 ring-foreground/10 rounded-sm px-[1in] py-[0.85in] font-serif">
          <header className="text-center mb-8 pb-6 border-b border-foreground/10">
            <h2 className="font-display text-2xl font-semibold tracking-tight">{rendered.template.title}</h2>
            <div className="mt-1.5 text-sm text-muted-foreground italic">{fund.name}</div>
          </header>
          <LegalDocumentRenderedBody body={rendered.body} editorBase={editorBase} />
          <footer className="mt-10 pt-4 border-t border-foreground/10 text-[10px] text-muted-foreground/80 text-center font-sans">
            Generated by Anker · {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </footer>
        </article>
      </div>
    </main>
  )
}
