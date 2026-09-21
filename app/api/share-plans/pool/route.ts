import { NextResponse } from "next/server"
import { auditContext } from "@/lib/audit/record-change"
import { createClient } from "@/lib/supabase/server"
import { resolveFounderCompanyId } from "@/lib/dataroom/founder-scope"
import { getPool, setPool } from "@/lib/modules/share-plans"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function scope() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  // Identity is carried alongside the company so the change can be
  // attributed. This returned the company alone, discarding who acted.
  return { userId: user.id, email: user.email ?? null, companyId: await resolveFounderCompanyId(user.id) }
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
  const authorized = await setPool(s.companyId, Number(b.authorized) || 0, auditContext(req, s))
  return NextResponse.json({ authorized })
}
