/**
 * POST /api/discovery/save { items: [{ kind, id }] } — save directory records
 * to the workspace CRM, labelled `discover` (docs/architecture/10 DS7–DS9).
 * One request for a whole selection; investors already saved are skipped.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireWorkspace, workspaceError, WorkspaceError } from "@/lib/auth/workspace-context"
import { saveToCrm, MAX_SAVE, type CrmItem } from "@/lib/crm/save-entities"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const scope = await requireWorkspace(true)
    if (!["founder", "vc"].includes(scope.persona)) throw new WorkspaceError("Select a company or fund workspace to save contacts.", 403)
    const body = await req.json()
    const items: CrmItem[] = (Array.isArray(body?.items) ? body.items : [])
      .filter((i: any) => i && (i.kind === "firm" || i.kind === "contact") && typeof i.id === "string")
      .slice(0, MAX_SAVE)
      .map((i: any) => ({ kind: i.kind, id: i.id, displayName: i.name, title: i.title, email: i.email, linkedin: i.linkedin, location: i.location, type: i.type }))
    if (!items.length) throw new WorkspaceError("Choose at least one record.", 400)
    const result = await saveToCrm(scope, items, "discover")
    return NextResponse.json({ ok: true, ...result })
  } catch (e) { return workspaceError(e) }
}
