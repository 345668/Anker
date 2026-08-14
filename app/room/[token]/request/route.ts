import { NextRequest, NextResponse } from "next/server"
import { verifyAccessGrant, createDocumentRequest } from "@/lib/portfolio/data-room"

export const runtime = "nodejs"

/** POST { section, itemLabel, note? } — an investor requests a missing document
 *  from the founder's room. Authorized by the share token; requester email
 *  comes from the grant (not user-supplied). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const grant = await verifyAccessGrant(token)
  if (!grant) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let body: any = {}
  try { body = await req.json() } catch { /* ignore */ }
  const itemLabel = String(body?.itemLabel ?? "").trim()
  if (!itemLabel) return NextResponse.json({ error: "itemLabel required" }, { status: 400 })

  await createDocumentRequest({
    companyId: grant.company_id,
    requesterEmail: grant.grantee_email,
    section: body?.section ? String(body.section) : null,
    itemLabel,
    note: body?.note ? String(body.note) : null,
  })
  return NextResponse.json({ ok: true })
}
