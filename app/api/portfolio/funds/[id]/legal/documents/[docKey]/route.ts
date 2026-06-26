/**
 * GET    /api/portfolio/funds/[id]/legal/documents/[docKey]?format={json|md|docx|pdf}
 * POST   /api/portfolio/funds/[id]/legal/documents/[docKey]   { body }   → save override
 * DELETE /api/portfolio/funds/[id]/legal/documents/[docKey]               → discard override
 *
 * Read flow:
 *   1. Resolve the fund + check the per-fund override JSONB
 *   2. If an override exists for this doc_key, use override.body
 *      else render the template with the fund's legal-field values
 *   3. Serialise in the requested format. Word + PDF + Markdown
 *      always use the same body, so what the operator sees in the
 *      browser is what comes out in the chosen format.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { getLegalFields } from "@/lib/portfolio/legal-fields"
import { renderTemplate } from "@/lib/portfolio/legal-template-renderer"
import { getTemplate } from "@/lib/portfolio/legal-templates"
import { legalTemplateToDocxBuffer } from "@/lib/portfolio/legal-template-docx"
import { legalTemplateToPdfBuffer } from "@/lib/portfolio/legal-template-pdf"
import {
  getDocumentOverride, setDocumentOverride, clearDocumentOverride,
  OverrideMissingColumnError,
} from "@/lib/portfolio/legal-document-overrides"

export const runtime = "nodejs"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveFund(slugOrId: string): Promise<{ id: string; name: string } | null> {
  const fund = UUID_RE.test(slugOrId.trim())
    ? (await getFundById(slugOrId)) ?? (await getFundBySlug(slugOrId))
    : await getFundBySlug(slugOrId)
  return fund ? { id: fund.id, name: fund.name } : null
}

/** Returns the body the renderer/exporters should use: override if set,
 *  else the field-substituted template (plain-text form for exports). */
async function resolveBody(
  fundId: string,
  docKey: string,
  forPlainText: boolean,
): Promise<{ title: string; source: string; body: string; isOverride: boolean } | null> {
  const tpl = getTemplate(docKey)
  if (!tpl) return null
  const override = await getDocumentOverride(fundId, docKey)
  if (override) {
    return { title: tpl.title, source: tpl.source, body: override.body, isOverride: true }
  }
  const payload = await getLegalFields(fundId)
  if (!payload) return null
  const rendered = renderTemplate(docKey, payload.values, payload.approvals, { plainText: forPlainText })
  if (!rendered) return null
  return {
    title: rendered.template.title,
    source: rendered.template.source,
    body: rendered.body,
    isOverride: false,
  }
}

// ─── GET ─────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; docKey: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id, docKey } = await ctx.params
  const fund = await resolveFund(id)
  if (!fund) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  try {
    const format = req.nextUrl.searchParams.get("format") ?? "json"

    if (format === "md" || format === "markdown") {
      const resolved = await resolveBody(fund.id, docKey, /* plainText */ true)
      if (!resolved) return NextResponse.json({ error: "Unknown docKey" }, { status: 404 })
      const cite = `<!-- Source: ${resolved.source.replace(/-->/g, "—>")} -->\n\n# ${resolved.title}\n\n*${resolved.source}*\n\n---\n\n`
      return new NextResponse(cite + resolved.body, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${docKey}.md"`,
        },
      })
    }

    if (format === "docx" || format === "word") {
      const resolved = await resolveBody(fund.id, docKey, /* plainText */ true)
      if (!resolved) return NextResponse.json({ error: "Unknown docKey" }, { status: 404 })
      const buf = await legalTemplateToDocxBuffer({
        title: resolved.title, source: resolved.source, body: resolved.body, fundName: fund.name,
      })
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${docKey}.docx"`,
        },
      })
    }

    if (format === "pdf") {
      const resolved = await resolveBody(fund.id, docKey, /* plainText */ true)
      if (!resolved) return NextResponse.json({ error: "Unknown docKey" }, { status: 404 })
      const buf = await legalTemplateToPdfBuffer({
        title: resolved.title, source: resolved.source, body: resolved.body, fundName: fund.name,
      })
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${docKey}.pdf"`,
        },
      })
    }

    // Default JSON for the in-browser viewer. We return:
    //   body         — what's currently displayed (override if any,
    //                   else field-substituted with TBD spans)
    //   templateBody — the field-substituted body (plain text), used
    //                   for the Discard → revert flow
    //   isOverride   — true if the operator has edited this doc
    //   stats        — slot counts (only meaningful for the template)
    const override = await getDocumentOverride(fund.id, docKey)
    const payload = await getLegalFields(fund.id)
    if (!payload) return NextResponse.json({ error: "Fund payload missing" }, { status: 404 })
    const rendered = renderTemplate(docKey, payload.values, payload.approvals)
    if (!rendered) return NextResponse.json({ error: "Unknown docKey" }, { status: 404 })
    return NextResponse.json({
      docKey: rendered.template.docKey,
      title: rendered.template.title,
      source: rendered.template.source,
      body: override?.body ?? rendered.body,
      templateBody: rendered.body,
      isOverride: !!override,
      overrideUpdatedAt: override?.updatedAt ?? null,
      overrideUpdatedBy: override?.updatedBy ?? null,
      stats: rendered.stats,
      tbdFieldKeys: rendered.tbdFieldKeys,
    })
  } catch (e: any) {
    console.error("[legal-documents docKey GET]", e)
    return NextResponse.json({ error: e?.message ?? "Render failed" }, { status: 500 })
  }
}

// ─── POST: save edited body ──────────────────────────────────────────────

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; docKey: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const admin = guard
  const { id, docKey } = await ctx.params
  const fund = await resolveFund(id)
  if (!fund) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  if (!getTemplate(docKey)) return NextResponse.json({ error: "Unknown docKey" }, { status: 404 })
  try {
    const body = await req.json()
    if (typeof body?.body !== "string") {
      return NextResponse.json({ error: "Body must include { body: string }" }, { status: 400 })
    }
    if (body.body.length > 1_000_000) {
      return NextResponse.json({ error: "Body too large (>1MB)" }, { status: 413 })
    }
    const saved = await setDocumentOverride({
      fundId: fund.id,
      docKey,
      body: body.body,
      updatedBy: admin.email ?? admin.id ?? null,
    })
    return NextResponse.json({ ok: true, override: saved })
  } catch (e: any) {
    if (e instanceof OverrideMissingColumnError) {
      return NextResponse.json({ error: e.message, code: "schema_missing" }, { status: 503 })
    }
    console.error("[legal-documents docKey POST]", e)
    return NextResponse.json({ error: e?.message ?? "Save failed" }, { status: 500 })
  }
}

// ─── DELETE: discard override + revert to template ───────────────────────

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; docKey: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id, docKey } = await ctx.params
  const fund = await resolveFund(id)
  if (!fund) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  try {
    await clearDocumentOverride({ fundId: fund.id, docKey })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e instanceof OverrideMissingColumnError) {
      return NextResponse.json({ error: e.message, code: "schema_missing" }, { status: 503 })
    }
    console.error("[legal-documents docKey DELETE]", e)
    return NextResponse.json({ error: e?.message ?? "Discard failed" }, { status: 500 })
  }
}
