import { NextResponse } from "next/server"
import { auditContext } from "@/lib/audit/record-change"
import { createClient } from "@/lib/supabase/server"
import { resolveFounderCompanyId } from "@/lib/dataroom/founder-scope"
import { addExercise, getGrantServicing } from "@/lib/modules/share-plans"

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

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await scope()
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  let b: any = {}
  try { b = await req.json() } catch { /* ignore */ }

  try {
    const res = await addExercise(s.companyId, id, {
      exercisedOn: b.exercisedOn ?? null,
      quantity: Number(b.quantity) || 0,
      note: b.note ?? null,
    }, auditContext(req, s))
    if (!res) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const servicing = await getGrantServicing(s.companyId, id)
    return NextResponse.json({ exercise: res.exercise, grant: res.grant, servicing })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Could not record exercise" }, { status: 400 })
  }
}
