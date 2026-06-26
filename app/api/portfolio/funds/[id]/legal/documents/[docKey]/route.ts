/**
 * GET /api/portfolio/funds/[id]/legal/documents/[docKey]?format={json|md|docx|pdf}
 *
 *   json (default) → { docKey, title, source, body, stats, tbdFieldKeys }
 *   md             → text/markdown; TBD markers stripped
 *   docx           → editable Word document, paginated, 1" margins
 *   pdf            → paginated PDF in Times-Roman 11pt
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { getLegalFields } from "@/lib/portfolio/legal-fields"
import { renderTemplate } from "@/lib/portfolio/legal-template-renderer"
import { legalTemplateToDocxBuffer } from "@/lib/portfolio/legal-template-docx"
import { legalTemplateToPdfBuffer } from "@/lib/portfolio/legal-template-pdf"

export const runtime = "nodejs"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveFundId(slugOrId: string): Promise<{ id: string; name: string } | null> {
  const fund = UUID_RE.test(slugOrId.trim())
    ? (await getFundById(slugOrId)) ?? (await getFundBySlug(slugOrId))
    : await getFundBySlug(slugOrId)
  return fund ? { id: fund.id, name: fund.name } : null
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; docKey: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id, docKey } = await ctx.params
  const fund = await resolveFundId(id)
  if (!fund) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  try {
    const payload = await getLegalFields(fund.id)
    if (!payload) return NextResponse.json({ error: "Fund payload missing" }, { status: 404 })
    const format = req.nextUrl.searchParams.get("format") ?? "json"

    if (format === "md" || format === "markdown") {
      const rendered = renderTemplate(docKey, payload.values, payload.approvals, { plainText: true })
      if (!rendered) return NextResponse.json({ error: "Unknown docKey" }, { status: 404 })
      const filename = `${docKey}.md`
      const cite = `<!-- Source: ${rendered.template.source.replace(/-->/g, "—>")} -->\n\n# ${rendered.template.title}\n\n*${rendered.template.source}*\n\n---\n\n`
      return new NextResponse(cite + rendered.body, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      })
    }

    if (format === "docx" || format === "word") {
      const rendered = renderTemplate(docKey, payload.values, payload.approvals, { plainText: true })
      if (!rendered) return NextResponse.json({ error: "Unknown docKey" }, { status: 404 })
      const buf = await legalTemplateToDocxBuffer({
        title: rendered.template.title,
        source: rendered.template.source,
        body: rendered.body,
        fundName: fund.name,
      })
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${docKey}.docx"`,
        },
      })
    }

    if (format === "pdf") {
      const rendered = renderTemplate(docKey, payload.values, payload.approvals, { plainText: true })
      if (!rendered) return NextResponse.json({ error: "Unknown docKey" }, { status: 404 })
      const buf = await legalTemplateToPdfBuffer({
        title: rendered.template.title,
        source: rendered.template.source,
        body: rendered.body,
        fundName: fund.name,
      })
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${docKey}.pdf"`,
        },
      })
    }

    // Default: JSON for the in-browser viewer.
    const rendered = renderTemplate(docKey, payload.values, payload.approvals)
    if (!rendered) return NextResponse.json({ error: "Unknown docKey" }, { status: 404 })
    return NextResponse.json({
      docKey: rendered.template.docKey,
      title: rendered.template.title,
      source: rendered.template.source,
      body: rendered.body,
      stats: rendered.stats,
      tbdFieldKeys: rendered.tbdFieldKeys,
    })
  } catch (e: any) {
    console.error("[legal-documents docKey GET]", e)
    return NextResponse.json({ error: e?.message ?? "Render failed" }, { status: 500 })
  }
}
