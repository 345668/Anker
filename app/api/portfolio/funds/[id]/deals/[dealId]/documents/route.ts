/**
 * GET  /api/portfolio/funds/[id]/deals/[dealId]/documents  → data-room list
 * POST /api/portfolio/funds/[id]/deals/[dealId]/documents  → create record
 *   Body (after a client-side blob upload):
 *     { category, name, blobUrl, contentType?, size? }
 *
 * Admin-gated. Verifies the deal belongs to the resolved fund.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { getDealById } from "@/lib/portfolio/deal-pipeline"
import { listDocuments, createDocumentRecord, isDealDocCategory } from "@/lib/portfolio/deal-documents"

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

async function loadScoped(id: string, dealId: string) {
  const fundId = await resolveFundId(id)
  if (!fundId) return { error: NextResponse.json({ error: "Fund not found" }, { status: 404 }) }
  const deal = await getDealById(dealId)
  if (!deal || deal.fund_id !== fundId) {
    return { error: NextResponse.json({ error: "Deal not found" }, { status: 404 }) }
  }
  return { fundId, deal }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string; dealId: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id, dealId } = await ctx.params
  const scoped = await loadScoped(id, dealId)
  if ("error" in scoped) return scoped.error
  return NextResponse.json({ documents: await listDocuments(dealId) })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; dealId: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const admin = guard
  const { id, dealId } = await ctx.params
  const scoped = await loadScoped(id, dealId)
  if ("error" in scoped) return scoped.error

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }
  const category = String(body?.category ?? "other")
  if (!isDealDocCategory(category)) {
    return NextResponse.json({ error: `Unknown category: ${category}` }, { status: 400 })
  }
  if (!body?.blobUrl || !String(body.blobUrl).trim()) {
    return NextResponse.json({ error: "blobUrl is required" }, { status: 400 })
  }
  if (!body?.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 })
  }

  const doc = await createDocumentRecord({
    dealId,
    fundId: scoped.fundId,
    category,
    name: String(body.name).trim(),
    blobPath: String(body.blobUrl).trim(),
    contentType: body.contentType ?? null,
    size: body.size != null ? Number(body.size) : null,
    stageAtUpload: scoped.deal.stage,
    uploadedBy: admin.email ?? admin.id ?? null,
  })
  return NextResponse.json({ document: doc, documents: await listDocuments(dealId) })
}
