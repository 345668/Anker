import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { createDistribution } from "@/lib/portfolio/distributions"

export const runtime = "nodejs"

/**
 * POST — initiate a distribution (return of capital / realized gain / dividend).
 * Body: { title, source?, distType, grossAmount, mgmtFee, carry, paymentDate?, status }
 * createDistribution allocates per-LP pro-rata by ownership_pct.
 */
export async function POST(req: NextRequest) {
  let userId: string | null = null
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    userId = user?.id ?? null
  } catch { /* ignore */ }
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  let body: any = {}
  try { body = await req.json() } catch { /* ignore */ }
  const title = String(body?.title ?? "").trim()
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 })

  const fund = await getFundBySlug("svs-fund-ii")
  if (!fund) return NextResponse.json({ error: "fund not found" }, { status: 404 })

  const gross = Number(body?.grossAmount) || 0
  const mgmt = Number(body?.mgmtFee) || 0
  const carry = Number(body?.carry) || 0
  const status = body?.status === "notified" ? "notified" : "draft"

  const { distribution } = await createDistribution({
    fundId: fund.id,
    title,
    source: body?.source ?? body?.distType ?? null,
    grossAmount: gross || null,
    mgmtFeeDeduction: mgmt,
    carryDeduction: carry,
    paymentDate: body?.paymentDate ?? null,
    createdBy: userId,
  })

  if (status !== "draft") {
    await sql`UPDATE distributions SET status = ${status}, notified_at = NOW(), updated_at = NOW() WHERE id = ${distribution.id}`
    // Deliver in-app: mark funded lines 'notified' so LPs see the notice.
    await sql`
      UPDATE distribution_line_items
      SET status = 'notified', updated_at = NOW()
      WHERE distribution_id = ${distribution.id} AND amount > 0 AND status = 'pending'
    `
  }

  return NextResponse.json({ ok: true, distributionId: distribution.id })
}
