import { NextResponse } from "next/server"
import { getWorkspaceTeam, changeWorkspaceTeam } from "@/lib/org/team"
import { teamActor, teamFailure } from "@/lib/org/team-api"
export const runtime = "nodejs"
export const maxDuration = 60
export async function GET(_req: Request, context: { params: Promise<{ orgId: string }> }) {
  try { return NextResponse.json(await getWorkspaceTeam(await teamActor(), (await context.params).orgId), { headers: { "Cache-Control": "private, no-store" } }) }
  catch (error) { return teamFailure(error) }
}
export async function POST(req: Request, context: { params: Promise<{ orgId: string }> }) {
  try { return NextResponse.json(await changeWorkspaceTeam(await teamActor(), (await context.params).orgId, await req.json())) }
  catch (error) { return teamFailure(error) }
}
