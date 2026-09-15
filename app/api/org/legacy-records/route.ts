import { NextResponse } from "next/server"
import { z } from "zod"
import { sql } from "@/lib/db"
import { requireCrmWorkspace } from "@/lib/crm/workspace"
import { teamFailure } from "@/lib/org/team-api"
import { WorkspaceError } from "@/lib/auth/workspace-context"
export const runtime = "nodejs"
export async function GET() {
  try {
    const scope = await requireCrmWorkspace()
    const boards = await sql`SELECT b.id,b.name,(SELECT count(*)::int FROM crm_entries e WHERE e.board_id=b.id) AS count
      FROM crm_boards b WHERE b.user_id=${scope.userId} AND b.org_id IS NULL ORDER BY b.created_at LIMIT 200`
    const contacts = await sql`SELECT id,display_name AS name FROM crm_entries WHERE user_id=${scope.userId} AND org_id IS NULL AND board_id IS NULL ORDER BY added_at LIMIT 200`
    const updates = scope.persona === "founder" ? await sql`SELECT id,title AS name,status FROM investor_updates WHERE user_id=${scope.userId} AND org_id IS NULL ORDER BY created_at LIMIT 200` : []
    return NextResponse.json({ boards, contacts, updates, orgId:scope.orgId, workspace:scope.name, canWrite:scope.canWrite }, { headers:{"Cache-Control":"private, no-store"} })
  } catch(error) { return teamFailure(error) }
}
export async function POST(req: Request) {
  try {
    const scope = await requireCrmWorkspace(true)
    const input = z.object({orgId:z.string(),kind:z.enum(["board","contact","update"]),id:z.string().min(1).max(200),confirmed:z.literal(true)}).parse(await req.json())
    if(input.orgId !== scope.orgId) throw new WorkspaceError("Workspace changed. Review the destination again.",409)
    await sql`SELECT workspace_adopt_record(${scope.userId},${scope.orgId},${input.kind},${input.id})`
    return NextResponse.json({ok:true})
  } catch(error) {
    if ((error as {code?:string})?.code === "23505") return NextResponse.json({error:"The move conflicts with an existing relationship, import or round. Nothing was moved. Review both records before merging them."},{status:409})
    return teamFailure(error)
  }
}
