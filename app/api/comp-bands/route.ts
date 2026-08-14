import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveFounderCompanyId } from "@/lib/dataroom/founder-scope"
import { createBand } from "@/lib/modules/carta-modules"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  let b: any = {}
  try { b = await req.json() } catch { /* ignore */ }
  if (!String(b?.role ?? "").trim()) return NextResponse.json({ error: "role required" }, { status: 400 })
  const companyId = await resolveFounderCompanyId(user.id)
  const band = await createBand({
    companyId, userId: user.id, role: String(b.role), level: b.level ?? null, geography: b.geography ?? null,
    baseMin: b.baseMin != null ? Number(b.baseMin) : null, baseMax: b.baseMax != null ? Number(b.baseMax) : null,
    equityMin: b.equityMin != null ? Number(b.equityMin) : null, equityMax: b.equityMax != null ? Number(b.equityMax) : null,
  })
  return NextResponse.json({ ok: true, band })
}
