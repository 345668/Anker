/** Who may approve and revoke sends. A signed-in person only: never the assistant principal, an agent or a token (docs/architecture/46 §6). */
import { NextResponse } from "next/server"
import { currentAiContext } from "@/lib/assistant/context"
import { crmWorkspaceResponse } from "@/lib/crm/workspace"
import { requireWorkspace, workspaceError } from "@/lib/auth/workspace-context"
import { createClient } from "@/lib/supabase/server"

export async function requireSender() {
  if (currentAiContext()) return NextResponse.json({ error: "Only a signed-in person can approve sending." }, { status: 403 })
  const scope = await crmWorkspaceResponse(true, true)
  if (scope instanceof NextResponse) return scope
  const { data: { user } } = await (await createClient()).auth.getUser()
  return { ...scope, email: user?.email ?? null }
}

/** Revoking is wider than approving: the sender, or an owner or admin of the workspace. */
export async function requireRevoker() {
  try {
    if (currentAiContext()) return NextResponse.json({ error: "Only a signed-in person can revoke sending." }, { status: 403 })
    const scope = await requireWorkspace(false)
    const { data: { user } } = await (await createClient()).auth.getUser()
    return { ...scope, email: user?.email ?? null }
  } catch (e) { return workspaceError(e) }
}
