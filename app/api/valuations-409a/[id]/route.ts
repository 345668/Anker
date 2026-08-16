import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveFounderCompanyId } from "@/lib/dataroom/founder-scope"
import { getValuation, saveValuationOpm, setValuationStatus } from "@/lib/modules/valuation-409a"
import { compute409a, type OpmInputs } from "@/lib/modules/opm-409a"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const STATUSES = ["requested", "in_progress", "completed", "board_approved", "expired"]

async function scope() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return { userId: user.id, companyId: await resolveFounderCompanyId(user.id) }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await scope()
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const valuation = await getValuation(s.companyId, id)
  if (!valuation) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ valuation })
}

function toInputs(b: any): OpmInputs {
  const n = (v: any, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d)
  return {
    commonShares: n(b.commonShares), preferredShares: n(b.preferredShares),
    liquidationPref: n(b.liquidationPref), recentPrice: n(b.recentPrice),
    volatility: n(b.volatility, 0.6), riskFreeRate: n(b.riskFreeRate, 0.04),
    yearsToLiquidity: n(b.yearsToLiquidity, 4), dlom: n(b.dlom, 0.25),
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await scope()
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  let b: any = {}
  try { b = await req.json() } catch { /* ignore */ }

  if (typeof b.status === "string") {
    if (!STATUSES.includes(b.status)) return NextResponse.json({ error: "invalid status" }, { status: 400 })
    const valuation = await setValuationStatus(s.companyId, id, b.status)
    if (!valuation) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ valuation })
  }

  // Compute + save.
  const inputs = toInputs(b.inputs ?? b)
  if (inputs.preferredShares <= 0 || inputs.recentPrice <= 0 || inputs.commonShares <= 0) {
    return NextResponse.json({ error: "commonShares, preferredShares, and recentPrice are required" }, { status: 400 })
  }
  const result = compute409a(inputs)
  const valuation = await saveValuationOpm(s.companyId, id, inputs, { commonFmv: result.commonFmv, equityValue: result.equityValue })
  if (!valuation) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ valuation, result })
}
