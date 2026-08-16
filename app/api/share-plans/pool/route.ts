import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveFounderCompanyId } from "@/lib/dataroom/founder-scope"
import { getPool, setPool } from "@/lib/modules/share-plans"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function scope() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return { companyId: await resolveFounderCompanyId(user.id) }
}

export async function GET() {
  const s = await scope()
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json({ authorized: await getPool(s.companyId) })
}

export async function PUT(req: Request) {
  const s = await scope()
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  let b: any = {}
  try { b = await req.json() } catch { /* ignore */ }
  const authorized = await setPool(s.companyId, Number(b.authorized) || 0)
  return NextResponse.json({ authorized })
}
