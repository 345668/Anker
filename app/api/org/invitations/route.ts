import { NextResponse } from "next/server"
import { z } from "zod"
import { reviewInvitation } from "@/lib/org/team"
import { teamActor, teamFailure } from "@/lib/org/team-api"
import { setActiveOrgCookie } from "@/lib/org/active"
export const runtime = "nodejs"
export async function POST(req: Request) {
  try {
    const actor = await teamActor()
    const body = z.object({ token: z.string().length(43), action: z.enum(["preview", "accept"]) }).parse(await req.json())
    const result = await reviewInvitation(actor, body.token, body.action === "accept")
    if ("orgId" in result) await setActiveOrgCookie(result.orgId)
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { return teamFailure(error) }
}
