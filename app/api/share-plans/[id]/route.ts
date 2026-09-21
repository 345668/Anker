import { NextResponse } from "next/server"
import { auditContext } from "@/lib/audit/record-change"
import { createClient } from "@/lib/supabase/server"
import { resolveFounderCompanyId } from "@/lib/dataroom/founder-scope"
import { getGrantServicing, setGrantStatus, updateGrantTerms } from "@/lib/modules/share-plans"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function scope() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return { userId: user.id, email: user.email ?? null, companyId: await resolveFounderCompanyId(user.id) }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await scope()
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const servicing = await getGrantServicing(s.companyId, id)
  if (!servicing) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ servicing })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await scope()
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  let b: any = {}
  try { b = await req.json() } catch { /* ignore */ }

  if (typeof b.status === "string") {
    try {
      // Audited inside setGrantStatus, with the row before and after. This
      // route used to write its own event recording only the NEW status, which
      // could not answer what the grant was before.
      const grant = await setGrantStatus(s.companyId, id, b.status, auditContext(req, s))
      if (!grant) return NextResponse.json({ error: "Not found" }, { status: 404 })
      return NextResponse.json({ grant })
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? "invalid status" }, { status: 400 })
    }
  }

  const grant = await updateGrantTerms(s.companyId, id, {
    options: b.options != null ? Number(b.options) : undefined,
    strike: b.strike !== undefined ? (b.strike == null ? null : Number(b.strike)) : undefined,
    grantDate: b.grantDate,
    vestingStart: b.vestingStart,
    vestMonths: b.vestMonths != null ? Number(b.vestMonths) : undefined,
    cliffMonths: b.cliffMonths != null ? Number(b.cliffMonths) : undefined,
    terminatedOn: b.terminatedOn,
  }, auditContext(req, s))
  if (!grant) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const servicing = await getGrantServicing(s.companyId, id)
  return NextResponse.json({ grant, servicing })
}
