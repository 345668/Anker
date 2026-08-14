import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveFounderCompanyId } from "@/lib/dataroom/founder-scope"
import { createValuation } from "@/lib/modules/carta-modules"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  let b: any = {}
  try { b = await req.json() } catch { /* ignore */ }
  const companyId = await resolveFounderCompanyId(user.id)
  const valuation = await createValuation({
    companyId, userId: user.id, method: b.method ?? "OPM",
    commonPrice: b.commonPrice != null ? Number(b.commonPrice) : null,
    fmv: b.fmv != null ? Number(b.fmv) : null, status: b.status ?? "requested",
  })
  return NextResponse.json({ ok: true, valuation })
}
