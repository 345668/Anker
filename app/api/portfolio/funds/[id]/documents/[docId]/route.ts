/**
 * PATCH  /api/portfolio/funds/[id]/documents/[docId]
 *   Update title / category / description / scope / archive flag.
 *
 * DELETE /api/portfolio/funds/[id]/documents/[docId]
 *   Hard delete. Use PATCH archived:true for soft delete.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import {
  getDocumentById, updateDocument, deleteDocument,
  DOCUMENT_CATEGORIES, type DocumentCategory,
} from "@/lib/portfolio/data-room"

export const runtime = "nodejs"

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; docId: string }> },
) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { docId } = await ctx.params
  try {
    const body = await req.json()
    const patch: any = {}
    if ("fundLpId" in body) patch.fundLpId = body.fundLpId ?? null
    if (typeof body.category === "string"
        && (DOCUMENT_CATEGORIES as readonly string[]).includes(body.category)) {
      patch.category = body.category as DocumentCategory
    }
    if (typeof body.title === "string") patch.title = body.title
    if ("description" in body) patch.description = body.description ?? null
    if (typeof body.archived === "boolean") patch.archived = body.archived

    const doc = await updateDocument(docId, patch)
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ document: doc })
  } catch (e: any) {
    console.error("[data-room PATCH]", e)
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; docId: string }> },
) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { docId } = await ctx.params
  try {
    const existing = await getDocumentById(docId)
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const ok = await deleteDocument(docId)
    return NextResponse.json({ deleted: ok })
  } catch (e: any) {
    console.error("[data-room DELETE]", e)
    return NextResponse.json({ error: e?.message ?? "Delete failed" }, { status: 500 })
  }
}
