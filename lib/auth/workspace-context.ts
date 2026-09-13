import { createClient } from "@/lib/supabase/server"
import { resolveActiveMembership } from "@/lib/org/active"
import { NextResponse } from "next/server"

export class WorkspaceError extends Error {
  constructor(message: string, public status = 403) { super(message) }
}

/** Navigation previews never grant access to workspace records. */
export async function requireWorkspace(write = false) {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw new WorkspaceError("Sign in to continue.", 401)
  const { active } = await resolveActiveMembership(user.id)
  if (!active?.persona) throw new WorkspaceError("Select a workspace to continue.")
  const canWrite = active.orgRole !== "viewer"
  if (write && !canWrite) throw new WorkspaceError("This workspace is read-only.")
  return { userId: user.id, orgId: active.orgId, name: active.name, persona: active.persona, canWrite, kind: active.kind }
}

export function workspaceError(error: unknown) {
  if (error instanceof WorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error("[workspace operation]", error)
  return NextResponse.json({ error: "We could not complete this request. Please try again." }, { status: 500 })
}
