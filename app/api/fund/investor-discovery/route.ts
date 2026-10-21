import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { fundContext, investorFailure } from "@/lib/investor/access"
import { DISCOVERY_MIN_POOL, discoverabilityOpen, inviteEntity, invitesOfFund, searchForFund, withdrawInvite } from "@/lib/investor/discovery"

export const runtime = "nodejs"
/** Cards of opt-in investor entities that fit this fund's own rules, and this fund's invitations. Says `open: false` while the platform flag is off. */
export async function GET() {
  try {
    const c = await fundContext()
    if (!(await discoverabilityOpen())) return NextResponse.json({ open: false, cards: [], invites: [] })
    const cards = await searchForFund(c.fund.fundId)
    const [pool] = (await sql`SELECT count(*)::int n FROM investor_entities WHERE discoverable = true AND archived_at IS NULL`) as any[]
    return NextResponse.json({ open: true, cards, poolTooSmall: Number(pool.n) < DISCOVERY_MIN_POOL, invites: await invitesOfFund(c.fund.fundId) })
  } catch (e) { return investorFailure(e) }
}
/** { cardId } — invite that entity to connect. No message can be added. */
export async function POST(req: NextRequest) {
  try { const c = await fundContext(true), b = await req.json(); return NextResponse.json({ ok: true, ...(await inviteEntity(c.fund.fundId, c.userId, String(b?.cardId ?? ""))) }, { status: 201 }) } catch (e) { return investorFailure(e) }
}
export async function DELETE(req: NextRequest) {
  try { const c = await fundContext(true); await withdrawInvite(c.fund.fundId, req.nextUrl.searchParams.get("inviteId") ?? ""); return NextResponse.json({ ok: true }) } catch (e) { return investorFailure(e) }
}
