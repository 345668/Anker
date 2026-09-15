import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { matchingContext, matchingFailure } from "@/lib/matching/access"
import { serializeFundProfile } from "@/lib/matching/fund-profile"
import { POST as saveProfile } from "../route"
type Context = { params: Promise<{ id: string }> }
export async function GET(_req: NextRequest, ctx: Context) {
  try {
    const scope = await matchingContext("vc"), { id } = await ctx.params
    const [row] = await sql`SELECT * FROM fund_profiles WHERE id=${id} AND user_id=${scope.userId} AND org_id=${scope.orgId} AND is_active=true`
    return row ? NextResponse.json(serializeFundProfile(row)) : NextResponse.json({ error: "Profile not found" }, { status: 404 })
  } catch (error) { return matchingFailure(error, "Profile could not be loaded.") }
}
export async function PATCH(req: NextRequest, ctx: Context) {
  try {
    const current = await GET(req, ctx)
    if (!current.ok) return current
    const profile = await current.json(), changes = await req.json()
    const response = await saveProfile(new NextRequest(req.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...profile, ...changes, id: profile.id }) }))
    if (!response.ok) return response
    const data = await response.json()
    return NextResponse.json(data.profile)
  } catch (error) { return matchingFailure(error, "Profile could not be saved.") }
}
export async function DELETE(_req: NextRequest, ctx: Context) {
  try {
    const scope = await matchingContext("vc"), { id } = await ctx.params
    const rows = await sql`UPDATE fund_profiles SET is_active=false, updated_at=now() WHERE id=${id} AND user_id=${scope.userId} AND org_id=${scope.orgId} RETURNING id`
    return rows.length ? NextResponse.json({ success: true }) : NextResponse.json({ error: "Profile not found" }, { status: 404 })
  } catch (error) { return matchingFailure(error, "Profile could not be archived.") }
}
