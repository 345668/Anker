/**
 * DELETE /api/portfolio/funds/[id]/deals/[dealId]/documents/[docId]
 *
 * Removes the DB record and best-effort deletes the underlying blob.
 * Admin-gated. Verifies the deal → fund and doc → deal ownership chain.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { getDealById } from "@/lib/portfolio/deal-pipeline"
import { getDocument, deleteDocument, listDocuments } from "@/lib/portfolio/deal-documents"

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

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; dealId: string; docId: string }> },
) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id, dealId, docId } = await ctx.params

  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  const deal = await getDealById(dealId)
  if (!deal || deal.fund_id !== fundId) return NextResponse.json({ error: "Deal not found" }, { status: 404 })
  const doc = await getDocument(docId)
  if (!doc || doc.deal_id !== dealId) return NextResponse.json({ error: "Document not found" }, { status: 404 })

  await deleteDocument(docId)

  // Best-effort blob cleanup — the DB row is already gone, so a failed blob
  // delete only leaves an orphaned (unreferenced, private) file.
  if (process.env.BLOB_READ_WRITE_TOKEN && /^https?:\/\//.test(doc.blob_path)) {
    try {
      const { del } = await import("@vercel/blob")
      await del(doc.blob_path, { token: process.env.BLOB_READ_WRITE_TOKEN })
    } catch (e: any) {
      console.log("[deal doc delete] blob cleanup skipped:", e?.message)
    }
  }
  return NextResponse.json({ ok: true, documents: await listDocuments(dealId) })
}
