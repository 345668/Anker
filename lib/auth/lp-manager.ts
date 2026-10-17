import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireAdmin } from "@/lib/auth/require-admin"
import { requireFundAccess } from "@/lib/auth/fund-access"

/**
 * Who may manage an LP (docs/architecture/60): the owner or admin of the workspace that owns the LP's fund. A fund that belongs to no workspace (the original
 * flagship fund) is managed by the platform administrators only. Staff privileges never open a customer's fund.
 */
export async function requireLpManager(lpId: string): Promise<{ id: string; email: string | null; fundId: string } | NextResponse> {
  const [lp] = (await sql`SELECT l.fund_id, (SELECT 1 FROM organizations o WHERE o.fund_id::text = l.fund_id::text LIMIT 1) AS owned FROM fund_lps l WHERE l.id = ${lpId} LIMIT 1`) as any[]
  if (!lp) return NextResponse.json({ error: "LP not found" }, { status: 404 })
  const fundId = String(lp.fund_id)
  if (lp.owned) {
    const g = await requireFundAccess(fundId)
    return g instanceof NextResponse ? g : { id: g.id, email: g.email, fundId }
  }
  const g = await requireAdmin()
  return g instanceof NextResponse ? g : { id: g.id, email: (g as any).email ?? null, fundId }
}

/** The same rule for a fund (the fund's LP list). */
export async function requireFundManager(fundIdOrSlug: string): Promise<{ id: string; email: string | null; fundId: string } | NextResponse> {
  const [f] = (await sql`SELECT f.id::text AS id, (SELECT 1 FROM organizations o WHERE o.fund_id::text = f.id::text LIMIT 1) AS owned FROM funds f WHERE f.id::text = ${fundIdOrSlug} OR f.slug = ${fundIdOrSlug} LIMIT 1`) as any[]
  if (!f) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  if (f.owned) { const g = await requireFundAccess(fundIdOrSlug); return g instanceof NextResponse ? g : { id: g.id, email: g.email, fundId: f.id } }
  const g = await requireAdmin()
  return g instanceof NextResponse ? g : { id: g.id, email: (g as any).email ?? null, fundId: f.id }
}
