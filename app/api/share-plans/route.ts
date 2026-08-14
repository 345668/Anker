import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveFounderCompanyId } from "@/lib/dataroom/founder-scope"
import { createGrant } from "@/lib/modules/carta-modules"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  let b: any = {}
  try { b = await req.json() } catch { /* ignore */ }
  if (!String(b?.granteeName ?? "").trim()) return NextResponse.json({ error: "granteeName required" }, { status: 400 })
  const companyId = await resolveFounderCompanyId(user.id)
  const grant = await createGrant({
    companyId, userId: user.id, granteeName: String(b.granteeName), granteeEmail: b.granteeEmail ?? null,
    options: Math.round(Number(b.options) || 0), strike: b.strike != null ? Number(b.strike) : null,
    grantDate: b.grantDate ?? null, vestMonths: Number(b.vestMonths) || 48, cliffMonths: Number(b.cliffMonths) || 12,
  })
  return NextResponse.json({ ok: true, grant })
}
