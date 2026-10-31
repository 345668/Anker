/**
 * Prepaid AI credit, called by SAIL (docs/architecture/58 section 8). Portal service principal only. Amounts, dates and reasons; nothing about what the credit was spent on.
 *   GET  ?org=<workspace id> -> { workspace, balanceUsd, debitedThisMonthUsd, limitUsd, spentThisMonthUsd, ledger: [...] }
 *   POST { orgId, action: "grant", amountUsd, expiresInDays?, reason } | { orgId, action: "adjust", amountUsd (signed), reason }
 * Every change is attributed to the staff member (x-portal-staff-email) and audited by SAIL.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { sql } from "@/lib/db"
import { adjustCredit, CreditError, grantCredit, ledgerOf, prepaidOf } from "@/lib/metering/credits"
import { spendAndLimit } from "@/lib/metering/allowance"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
async function guard(): Promise<NextResponse | null> {
  const g = await requireAdmin()
  if (g instanceof NextResponse) return g
  return g.id === "portal-service" ? null : NextResponse.json({ error: "Only available through the staff portal." }, { status: 403 })
}
const workspace = async (id: string) => ((await sql`SELECT id, name FROM organizations WHERE id::text = ${id}`) as any[])[0] ?? null
const ORG = /^[\w-]{1,64}$/

export async function GET(req: NextRequest) {
  const denied = await guard(); if (denied) return denied
  const id = req.nextUrl.searchParams.get("org") ?? ""
  if (!ORG.test(id)) return NextResponse.json({ error: "Give a workspace id." }, { status: 400 })
  const w = await workspace(id); if (!w) return NextResponse.json({ error: "No such workspace." }, { status: 404 })
  const [p, s, ledger] = [await prepaidOf(id), await spendAndLimit(id), await ledgerOf(id, 100)]
  return NextResponse.json({ workspace: { id: String(w.id), name: String(w.name ?? "") }, ...p, limitUsd: s.limit, spentThisMonthUsd: s.spent, ledger })
}
export async function POST(req: NextRequest) {
  const denied = await guard(); if (denied) return denied
  const b = await req.json().catch(() => null), by = req.headers.get("x-portal-staff-email") ?? "staff"
  const id = String(b?.orgId ?? "")
  if (!ORG.test(id) || !(await workspace(id))) return NextResponse.json({ error: "No such workspace." }, { status: 404 })
  try {
    if (b?.action === "grant") {
      const days = b.expiresInDays === undefined || b.expiresInDays === null || b.expiresInDays === "" ? null : Number(b.expiresInDays)
      if (days !== null && !(Number.isInteger(days) && days >= 1 && days <= 3650)) throw new CreditError("Expiry is a whole number of days from 1 to 3650, or none.")
      const r = await grantCredit({ orgId: id, amountUsd: Number(b.amountUsd), source: "manual", reason: String(b.reason ?? ""), by, expiresAt: days === null ? null : new Date(Date.now() + days * 86_400_000) })
      return NextResponse.json({ ok: true, grantId: r.id })
    }
    if (b?.action === "adjust") { await adjustCredit({ orgId: id, amountUsd: Number(b.amountUsd), reason: String(b.reason ?? ""), by }); return NextResponse.json({ ok: true }) }
    return NextResponse.json({ error: "action must be grant or adjust." }, { status: 400 })
  } catch (e) { if (e instanceof CreditError) return NextResponse.json({ error: e.message }, { status: e.status }); console.error("[admin/credits]", (e as Error)?.message); return NextResponse.json({ error: "The change could not be made." }, { status: 500 }) }
}
