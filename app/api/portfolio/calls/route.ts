import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { createCall } from "@/lib/portfolio/capital-calls"

export const runtime = "nodejs"

/**
 * POST — initiate a capital activity (capital call).
 * Body: {
 *   title, purpose?, dueDate?,
 *   activityType: 'pro_rata' | 'subsequent_close' | 'bring_in_line',
 *   mode: 'pct' | 'amount', pct?, totalAmount?,
 *   lpIds: string[],            // investors to call from
 *   status: 'draft' | 'sent',
 * }
 * Creates the call + per-LP line items with computed allocations.
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

  const mode = body?.mode === "amount" ? "amount" : "pct"
  const pct = Number(body?.pct) || 0
  const totalAmount = Number(body?.totalAmount) || 0
  const lpIds: string[] = Array.isArray(body?.lpIds) ? body.lpIds.map(String) : []
  const status = body?.status === "sent" ? "sent" : "draft"

  // Create the call with zero-amount lines for every LP, then set the
  // selected LPs' amounts precisely.
  const { call } = await createCall({
    fundId: fund.id,
    title,
    purpose: body?.purpose ?? null,
    dueDate: body?.dueDate ?? null,
    defaultCallPct: 0,
    createdBy: userId,
  })

  // Pull the LP commitments for the selected set to allocate.
  const selected = lpIds.length
    ? await sql`SELECT id, commitment_amount FROM fund_lps WHERE fund_id = ${fund.id} AND id = ANY(${lpIds})`
    : await sql`SELECT id, commitment_amount FROM fund_lps WHERE fund_id = ${fund.id} AND status != 'transferred'`

  const sumCommit = selected.reduce((s: number, r: any) => s + (Number(r.commitment_amount) || 0), 0)

  let total = 0
  for (const lp of selected) {
    const commit = Number(lp.commitment_amount) || 0
    const amount = mode === "pct"
      ? Math.round(commit * pct * 100) / 100
      : sumCommit > 0 ? Math.round(totalAmount * (commit / sumCommit) * 100) / 100 : 0
    total += amount
    await sql`
      UPDATE capital_call_line_items
      SET amount = ${amount}, updated_at = NOW()
      WHERE call_id = ${call.id} AND fund_lp_id = ${lp.id}
    `
  }

  await sql`UPDATE capital_calls SET total_amount = ${total}, status = ${status}, updated_at = NOW() WHERE id = ${call.id}`

  return NextResponse.json({ ok: true, callId: call.id, total })
}
