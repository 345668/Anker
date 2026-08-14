import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveFounderCompanyId } from "@/lib/dataroom/founder-scope"
import { createFiling } from "@/lib/modules/carta-modules"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  let b: any = {}
  try { b = await req.json() } catch { /* ignore */ }
  if (!String(b?.title ?? "").trim()) return NextResponse.json({ error: "title required" }, { status: 400 })
  const companyId = await resolveFounderCompanyId(user.id)
  const filing = await createFiling({
    companyId, userId: user.id, title: String(b.title), filingType: b.filingType ?? null, dueDate: b.dueDate ?? null,
  })
  return NextResponse.json({ ok: true, filing })
}
