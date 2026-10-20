import "server-only"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireWorkspace, WorkspaceError, workspaceError } from "@/lib/auth/workspace-context"
import { ListingError } from "@/lib/platform/listings"
import { InvestorError, getProfile } from "./profile"
import { fundOfOrg } from "./listing"

/** The signed-in person, who must have an investor profile. */
export async function investorContext() {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) throw new InvestorError("Sign in to continue.", 401, "auth")
  if (!(await getProfile(user.id))) throw new InvestorError("This account has no investor profile.", 403, "no_profile")
  return { userId: user.id, email: user.email ?? null, confirmed: !!user.email_confirmed_at, name: String(user.user_metadata?.full_name ?? "") }
}

/** A signed-in person who may not have an investor profile yet (to create one). */
export async function accountContext() {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) throw new InvestorError("Sign in to continue.", 401, "auth")
  return { userId: user.id, email: user.email ?? null, confirmed: !!user.email_confirmed_at, name: String(user.user_metadata?.full_name ?? "") }
}

/** A fund workspace member who may answer investors: the workspace owner or an admin. */
export async function fundContext(write = false) {
  const s = await requireWorkspace(write)
  if (s.persona !== "vc") throw new WorkspaceError("Switch to your fund workspace to use this.", 403)
  if (write && !["workspace_owner", "admin"].includes(String(s.role))) throw new WorkspaceError("Only a workspace owner or admin can answer investors.", 403)
  const fund = await fundOfOrg(s.orgId)
  if (!fund) throw new WorkspaceError("This workspace does not manage a fund.", 404)
  return { ...s, fund }
}

export function investorFailure(error: unknown, fallback = "That could not be completed.") {
  if (error instanceof InvestorError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
  if (error instanceof ListingError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  if (error instanceof WorkspaceError || (error as any)?.code) return workspaceError(error)
  console.error("[investor]", (error as any)?.message)
  return NextResponse.json({ error: fallback }, { status: 503 })
}
