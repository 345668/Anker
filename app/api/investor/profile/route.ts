import { NextRequest, NextResponse } from "next/server"
import { investorContext, investorFailure } from "@/lib/investor/access"
import { getProfile, listEntities, updateProfile } from "@/lib/investor/profile"

export const runtime = "nodejs"
export async function GET() {
  try { const c = await investorContext(); return NextResponse.json({ profile: await getProfile(c.userId), entities: await listEntities(c.userId), email: c.email }) } catch (e) { return investorFailure(e) }
}
export async function PATCH(req: NextRequest) {
  try { const c = await investorContext(); return NextResponse.json({ profile: await updateProfile(c.userId, await req.json()) }) } catch (e) { return investorFailure(e) }
}
