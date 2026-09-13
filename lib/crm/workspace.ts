import { sql } from "@/lib/db"
import { requireWorkspace, WorkspaceError } from "@/lib/auth/workspace-context"
import { workspaceError } from "@/lib/auth/workspace-context"

export async function requireCrmWorkspace(write = false) {
  const scope = await requireWorkspace(write)
  if (scope.persona !== (scope.kind === "company" ? "founder" : "vc")) throw new WorkspaceError("Select a company or fund team workspace to open CRM.")
  return scope
}

export async function requireCrmEntry(orgId: string, id: string) {
  const [entry] = await sql`SELECT id FROM crm_entries WHERE id=${id} AND org_id=${orgId}`
  if (!entry) throw new WorkspaceError("Contact not found in this workspace.", 404)
}

export async function requireCrmBoard(orgId: string, id: string | null) {
  if (!id) return
  const [board] = await sql`SELECT id FROM crm_boards WHERE id=${id} AND org_id=${orgId} AND archived=false`
  if (!board) throw new WorkspaceError("Choose an available board in this workspace.", 403)
}

/** Adapter for older HTTP handlers that return a response for auth failures. */
export async function crmWorkspaceResponse(write = false, send = false) {
  try {
    const scope = await requireCrmWorkspace(write)
    if (send && !scope.canSendOutreach) throw new WorkspaceError("The workspace owner must grant you sending permission first.")
    return scope
  }
  catch (error) { return workspaceError(error) }
}
