import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAccessGrant, listAccessGrants, revokeAccessGrant } from "@/lib/portfolio/data-room"
import { resolveFounderCompanyId } from "@/lib/dataroom/founder-scope"

export const runtime = "nodejs"

async function companyFor(): Promise<{ userId: string; companyId: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return { userId: user.id, companyId: await resolveFounderCompanyId(user.id) }
}

/** GET — list this founder's access grants. */
export async function GET() {
  const ctx = await companyFor()
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const grants = await listAccessGrants(ctx.companyId)
  return NextResponse.json({ grants })
}

/** POST { granteeEmail, expiresInDays?, watermark? } — create a share grant. */
export async function POST(req: NextRequest) {
  const ctx = await companyFor()
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  let body: any = {}
  try { body = await req.json() } catch { /* ignore */ }
  const granteeEmail = String(body?.granteeEmail ?? "").trim()
  if (!granteeEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(granteeEmail)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 })
  }
  const grant = await createAccessGrant({
    companyId: ctx.companyId,
    granteeEmail,
    expiresInDays: body?.expiresInDays != null ? Number(body.expiresInDays) : undefined,
    watermark: body?.watermark !== false,
    createdBy: ctx.userId,
  })
  return NextResponse.json({ ok: true, grant })
}

/** DELETE ?id=... — revoke a grant. */
export async function DELETE(req: NextRequest) {
  const ctx = await companyFor()
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const id = new URL(req.url).searchParams.get("id") ?? ""
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
  const ok = await revokeAccessGrant(id, ctx.companyId)
  return NextResponse.json({ ok })
}
