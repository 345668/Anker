/**
 * Documents the fund publishes to its investors (docs/architecture/60 section 8). Fund managers only.
 *   GET                                                  -> the fund's published documents
 *   POST multipart { file, title, category, lpId? }      -> publishes a PDF to one investor, or to every investor when lpId is empty
 *   DELETE json { docId }                                -> takes one down
 * An email is a separate, deliberate click per investor (the invite route with kind "new_material").
 */
import { NextRequest, NextResponse } from "next/server"
import { requireFundManager } from "@/lib/auth/lp-manager"
import { LpError } from "@/lib/portfolio/lp-onboarding"
import { addDocument, listDocumentsForFund, removeDocument } from "@/lib/portfolio/lp-statement"
import { logAudit } from "@/lib/audit/audit-log"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireFundManager((await ctx.params).id); if (g instanceof NextResponse) return g
  return NextResponse.json({ documents: await listDocumentsForFund(g.fundId) }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireFundManager((await ctx.params).id); if (g instanceof NextResponse) return g
  try {
    const f = await req.formData(); const file = f.get("file")
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a PDF." }, { status: 400 })
    const lpId = String(f.get("lpId") ?? "").trim() || null
    const doc = await addDocument(g.fundId, g.id, { lpId, category: f.get("category"), title: f.get("title"), filename: file.name, bytes: Buffer.from(await file.arrayBuffer()) })
    await logAudit({ actorId: g.id, action: "lp.document_published", targetType: "fund", targetId: g.fundId, metadata: { category: doc.category, forAll: doc.forAll } })
    return NextResponse.json({ ok: true, doc }, { status: 201 })
  } catch (e) { if (e instanceof LpError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status }); throw e }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireFundManager((await ctx.params).id); if (g instanceof NextResponse) return g
  const b = await req.json().catch(() => ({}))
  if (typeof b?.docId !== "string" || !/^[0-9a-f-]{36}$/i.test(b.docId)) return NextResponse.json({ error: "Unknown document." }, { status: 400 })
  if (!(await removeDocument(g.fundId, b.docId))) return NextResponse.json({ error: "Not found." }, { status: 404 })
  await logAudit({ actorId: g.id, action: "lp.document_removed", targetType: "fund", targetId: g.fundId, metadata: {} })
  return NextResponse.json({ ok: true })
}
