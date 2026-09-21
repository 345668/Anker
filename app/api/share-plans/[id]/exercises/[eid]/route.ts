import { NextResponse } from "next/server"
import { auditContext } from "@/lib/audit/record-change"
import { createClient } from "@/lib/supabase/server"
import { resolveFounderCompanyId } from "@/lib/dataroom/founder-scope"
import { removeExercise, getGrantServicing } from "@/lib/modules/share-plans"

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

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; eid: string }> }) {
  const s = await scope()
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id, eid } = await params
  const grant = await removeExercise(s.companyId, id, eid, auditContext(req, s))
  if (!grant) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const servicing = await getGrantServicing(s.companyId, id)
  return NextResponse.json({ grant, servicing })
}
