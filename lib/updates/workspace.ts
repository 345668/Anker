import { requireCrmWorkspace } from "@/lib/crm/workspace"
import { WorkspaceError } from "@/lib/auth/workspace-context"
export async function requireUpdateWorkspace(write = false, send = false) {
  const scope = await requireCrmWorkspace(write)
  if (scope.persona !== "founder") throw new WorkspaceError("Investor updates belong to a company workspace.")
  if (send && !scope.canSendOutreach) throw new WorkspaceError("The workspace owner must grant you sending permission first.")
  return scope
}
