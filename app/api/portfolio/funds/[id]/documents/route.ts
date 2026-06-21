/**
 * GET  /api/portfolio/funds/[id]/documents?category=&lpId=
 *   List documents for a fund. Pass lpId='' to filter to fund-wide
 *   docs only; lpId=<id> for a specific LP; omit for all.
 *
 * POST /api/portfolio/funds/[id]/documents
 *   Create a document row. Expects fileUrl already populated (caller
 *   uploads via /upload first, then passes the URL here).
 *   Body: { title, category?, description?, fundLpId?, fileUrl,
 *           fileName?, contentType?, byteSize?, sourceQuarterlyReportId?, ... }
 *
 * Admin-gated. [id] accepts UUID or slug.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import {
  listDocuments, createDocument,
  DOCUMENT_CATEGORIES, type DocumentCategory,
} from "@/lib/portfolio/data-room"

export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveFundId(slugOrId: string): Promise<string | null> {
  const trimmed = slugOrId.trim()
  if (!trimmed) return null
  const fund = UUID_RE.test(trimmed)
    ? (await getFundById(trimmed)) ?? (await getFundBySlug(trimmed))
    : await getFundBySlug(trimmed)
  return fund?.id ?? null
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })

  const url = new URL(req.url)
  const cat = url.searchParams.get("category") ?? "all"
  const category: DocumentCategory | "all" =
    (DOCUMENT_CATEGORIES as readonly string[]).includes(cat) ? cat as DocumentCategory : "all"
  const lpIdParam = url.searchParams.get("lpId")
  const lpId =
    lpIdParam === null ? undefined
    : lpIdParam === ""   ? null            // explicit fund-wide filter
    : lpIdParam
  const includeArchived = url.searchParams.get("includeArchived") === "true"

  const result = await listDocuments({ fundId, category, lpId, includeArchived })
  return NextResponse.json(result)
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const admin = guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })

  try {
    const body = await req.json()
    if (!body?.title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 })
    if (!body?.fileUrl) return NextResponse.json({ error: "fileUrl required (upload via /upload first)" }, { status: 400 })

    const category = (DOCUMENT_CATEGORIES as readonly string[]).includes(body.category)
      ? body.category as DocumentCategory
      : "other"

    const doc = await createDocument({
      fundId,
      fundLpId: body.fundLpId ?? null,
      category,
      title: String(body.title),
      description: body.description ?? null,
      fileUrl: String(body.fileUrl),
      fileName: body.fileName ?? null,
      contentType: body.contentType ?? null,
      byteSize: numOrNull(body.byteSize),
      sourceQuarterlyReportId: body.sourceQuarterlyReportId ?? null,
      sourceCapitalCallId: body.sourceCapitalCallId ?? null,
      sourceDistributionId: body.sourceDistributionId ?? null,
      uploadedBy: admin.id,
    })
    return NextResponse.json({ document: doc }, { status: 201 })
  } catch (e: any) {
    console.error("[data-room POST]", e)
    return NextResponse.json({ error: e?.message ?? "Create failed" }, { status: 500 })
  }
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
