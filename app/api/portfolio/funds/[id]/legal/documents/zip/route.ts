/**
 * GET /api/portfolio/funds/[id]/legal/documents/zip?format=docx|pdf|md|all
 *
 * Bundles every jurisdiction-applicable legal document for the fund
 * into a single ZIP. The 'all' format produces 3 files per doc
 * (.docx + .pdf + .md) plus a README.md summarising what's inside.
 *
 * Reuses the same body-resolution logic as the single-doc download
 * endpoint: per-fund overrides take precedence, otherwise the
 * field-substituted template body is rendered.
 *
 * Streams everything via lib/util/zip-writer.ts (zero-deps store-
 * only writer). Average bundle size: ~3-6 MB for 24 docs in Word.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { getLegalFields } from "@/lib/portfolio/legal-fields"
import { renderTemplate } from "@/lib/portfolio/legal-template-renderer"
import { getTemplate } from "@/lib/portfolio/legal-templates"
import { legalTemplateToDocxBuffer } from "@/lib/portfolio/legal-template-docx"
import { legalTemplateToPdfBuffer } from "@/lib/portfolio/legal-template-pdf"
import { getDocumentOverride } from "@/lib/portfolio/legal-document-overrides"
import {
  DOCUMENT_CATALOGUE, docsForDomicile, type FundDomicile,
} from "@/lib/portfolio/legal-catalogue"
import { ZipWriter } from "@/lib/util/zip-writer"

export const runtime = "nodejs"
export const maxDuration = 300  // 5 min budget — 24 docs × 3 formats can take a moment

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveFund(slugOrId: string): Promise<{ id: string; name: string } | null> {
  const fund = UUID_RE.test(slugOrId.trim())
    ? (await getFundById(slugOrId)) ?? (await getFundBySlug(slugOrId))
    : await getFundBySlug(slugOrId)
  return fund ? { id: fund.id, name: fund.name } : null
}

/** Resolve the body the exporters should serialise — override if set,
 *  otherwise field-substituted template body in plain-text mode. */
async function resolveBody(
  fundId: string, docKey: string,
): Promise<{ title: string; source: string; body: string } | null> {
  const tpl = getTemplate(docKey)
  if (!tpl) return null
  const override = await getDocumentOverride(fundId, docKey)
  if (override) {
    return { title: tpl.title, source: tpl.source, body: override.body }
  }
  const payload = await getLegalFields(fundId)
  if (!payload) return null
  const rendered = renderTemplate(docKey, payload.values, payload.approvals, { plainText: true })
  if (!rendered) return null
  return { title: rendered.template.title, source: rendered.template.source, body: rendered.body }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const fund = await resolveFund(id)
  if (!fund) return NextResponse.json({ error: "Fund not found" }, { status: 404 })

  const format = (req.nextUrl.searchParams.get("format") ?? "docx").toLowerCase()
  if (!["docx", "pdf", "md", "all"].includes(format)) {
    return NextResponse.json({ error: "format must be one of: docx | pdf | md | all" }, { status: 400 })
  }

  try {
    // Filter the catalogue by the fund's chosen domicile so a US fund
    // doesn't get EU docs in the zip and vice versa.
    const payload = await getLegalFields(fund.id)
    const domicile = (payload?.values.fund_domicile as FundDomicile) ?? "global"
    const docs = docsForDomicile(domicile)

    const zip = new ZipWriter()

    // README so the recipient knows what they're looking at.
    const readme = buildReadme(fund.name, domicile ?? "global", docs.length, format)
    zip.add("README.md", readme)

    for (const doc of docs) {
      const resolved = await resolveBody(fund.id, doc.key)
      if (!resolved) continue
      const safeName = doc.key  // already slug-safe
      // Group by entity in subfolders for easier counsel navigation.
      const folder = doc.entityKind === "management_company" ? "01_management_company"
        : doc.entityKind === "general_partner" ? "02_general_partner"
        : "03_fund"
      if (format === "md" || format === "all") {
        const cite = `<!-- Source: ${resolved.source.replace(/-->/g, "—>")} -->\n\n# ${resolved.title}\n\n*${resolved.source}*\n\n---\n\n`
        zip.add(`${folder}/${safeName}.md`, cite + resolved.body)
      }
      if (format === "docx" || format === "all") {
        const buf = await legalTemplateToDocxBuffer({
          title: resolved.title, source: resolved.source, body: resolved.body, fundName: fund.name,
        })
        zip.add(`${folder}/${safeName}.docx`, buf)
      }
      if (format === "pdf" || format === "all") {
        const buf = await legalTemplateToPdfBuffer({
          title: resolved.title, source: resolved.source, body: resolved.body, fundName: fund.name,
        })
        zip.add(`${folder}/${safeName}.pdf`, buf)
      }
    }

    const bytes = zip.finalize()
    const stamp = new Date().toISOString().slice(0, 10)
    const slugFund = fund.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
    const filename = `${slugFund}__legal-${format}__${stamp}.zip`
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (e: any) {
    console.error("[legal-documents zip]", e)
    return NextResponse.json({ error: e?.message ?? "ZIP generation failed" }, { status: 500 })
  }
}

// ─── README ─────────────────────────────────────────────────────────────-

function buildReadme(fundName: string, domicile: string, docCount: number, format: string): string {
  const today = new Date().toISOString().slice(0, 10)
  return `# ${fundName} — Legal Document Bundle

**Generated:** ${today}
**Jurisdiction filter:** \`${domicile}\`
**Documents included:** ${docCount}
**Formats:** ${format === "all" ? "Word (.docx) + PDF + Markdown (.md)" : format.toUpperCase()}

---

## Contents

The bundle is organised into three sub-folders matching the
fund-formation entity chain:

- \`01_management_company/\` — Management Company formation + ops
- \`02_general_partner/\` — General Partner formation
- \`03_fund/\` — Fund formation + operations + EU layer (if applicable)

Each document was generated by Anker by substituting the fund's
field values into a template sourced from authoritative public
sources (Delaware Division of Corporations, SEC EDGAR / eCFR,
NVCA Model Legal Documents, ILPA Model LPA, EUR-Lex AIFMD /
EuVECA / SFDR, Luxembourg CSSF). Empty fields appear as
\`[ Field Label · TBD ]\` placeholders for outside counsel to
fill in their own tooling.

---

## Important — Not Legal Advice

These templates are starting points only. Outside counsel must
review and finalise every executed document. The SOURCE block at
the top of each generated file cites the authoritative URL the
template structure came from.

---

*Generated by Anker · ${today}*
`
}
