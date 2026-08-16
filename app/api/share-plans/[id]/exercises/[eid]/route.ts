import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveFounderCompanyId } from "@/lib/dataroom/founder-scope"
import { removeExercise, getGrantServicing } from "@/lib/modules/share-plans"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function scope() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return { companyId: await resolveFounderCompanyId(user.id) }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; eid: string }> }) {
  const s = await scope()
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id, eid } = await params
  const grant = await removeExercise(s.companyId, id, eid)
  if (!grant) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const servicing = await getGrantServicing(s.companyId, id)
  return NextResponse.json({ grant, servicing })
}
