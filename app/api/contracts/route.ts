import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createContract } from "@/lib/modules/carta-modules"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  let b: any = {}
  try { b = await req.json() } catch { /* ignore */ }
  if (!String(b?.title ?? "").trim()) return NextResponse.json({ error: "title required" }, { status: 400 })
  const contract = await createContract({
    userId: user.id, title: String(b.title), counterparty: b.counterparty ?? null, type: b.type ?? null,
    status: b.status, value: b.value != null ? Number(b.value) : null, effective: b.effective ?? null, expiry: b.expiry ?? null,
  })
  return NextResponse.json({ ok: true, contract })
}
