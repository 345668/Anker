import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createSpv } from "@/lib/modules/carta-modules"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  let b: any = {}
  try { b = await req.json() } catch { /* ignore */ }
  if (!String(b?.name ?? "").trim()) return NextResponse.json({ error: "name required" }, { status: 400 })
  const spv = await createSpv({
    userId: user.id, name: String(b.name), dealName: b.dealName ?? null,
    target: Number(b.target) || 0, committed: Number(b.committed) || 0,
    stage: b.stage, lead: b.lead ?? null, closeDate: b.closeDate ?? null,
  })
  return NextResponse.json({ ok: true, spv })
}
