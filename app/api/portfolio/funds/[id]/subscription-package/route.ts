/**
 * The fund's subscription package (docs/architecture/60 section 7). Fund managers only.
 *   GET                                  -> { current, draft }: the published package and the one being prepared
 *   POST multipart { file, title? }      -> adds a PDF to the draft
 *   POST json { action: "publish", title? } -> makes the draft the current package (the old one is retired; LPs already sent it keep it)
 *   DELETE json { docId }                -> removes a document from the draft
 */
import { NextRequest, NextResponse } from "next/server"
import { requireFundManager } from "@/lib/auth/lp-manager"
import { LpError } from "@/lib/portfolio/lp-onboarding"
import { addPackageDoc, packageView, publishPackage, removePackageDoc } from "@/lib/portfolio/lp-subscription"
import { logAudit } from "@/lib/audit/audit-log"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const fail = (e: unknown) => { if (e instanceof LpError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status }); throw e }

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireFundManager((await ctx.params).id); if (g instanceof NextResponse) return g
  return NextResponse.json(await packageView(g.fundId), { headers: { "Cache-Control": "private, no-store" } })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireFundManager((await ctx.params).id); if (g instanceof NextResponse) return g
  try {
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const f = await req.formData(); const file = f.get("file")
      if (!(file instanceof File)) return NextResponse.json({ error: "Choose a PDF." }, { status: 400 })
      const doc = await addPackageDoc(g.fundId, g.id, { title: String(f.get("title") ?? ""), filename: file.name, bytes: Buffer.from(await file.arrayBuffer()) })
      await logAudit({ actorId: g.id, action: "lp.package_doc_added", targetType: "fund", targetId: g.fundId, metadata: { sha256: doc.sha256 } })
      return NextResponse.json({ ok: true, doc }, { status: 201 })
    }
    const b = await req.json().catch(() => ({}))
    if (b?.action === "publish") {
      const r = await publishPackage(g.fundId, g.id, b.title)
      await logAudit({ actorId: g.id, action: "lp.package_published", targetType: "fund", targetId: g.fundId, metadata: { version: r.version } })
      return NextResponse.json({ ok: true, ...r })
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 })
  } catch (e) { return fail(e) }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireFundManager((await ctx.params).id); if (g instanceof NextResponse) return g
  const b = await req.json().catch(() => ({}))
  if (typeof b?.docId !== "string" || !/^[0-9a-f-]{36}$/i.test(b.docId)) return NextResponse.json({ error: "Unknown document." }, { status: 400 })
  if (!(await removePackageDoc(g.fundId, b.docId))) return NextResponse.json({ error: "Only a document in the draft can be removed." }, { status: 409 })
  return NextResponse.json({ ok: true })
}
