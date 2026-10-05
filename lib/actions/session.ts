/** The signed-in person behind an Actions request. A session only: the assistant principal and MCP tokens never decide (doc 43 §5). */
import { NextResponse } from "next/server"
import { currentAiContext } from "@/lib/assistant/context"
import { requireWorkspace, workspaceError } from "@/lib/auth/workspace-context"
import { DECIDER_ROLES, AUTONOMY_ROLES } from "./model"
import { createClient } from "@/lib/supabase/server"

export async function requireDecider(need: "decide" | "autonomy" = "decide") {
  try {
    if (currentAiContext()) return NextResponse.json({ error: "Only a signed-in person can decide an action." }, { status: 403 })
    const scope = await requireWorkspace(need === "decide")
    if (!scope.canWrite && need === "decide") return NextResponse.json({ error: "This workspace is read-only." }, { status: 403 })
    if (!(need === "autonomy" ? AUTONOMY_ROLES : DECIDER_ROLES).includes(scope.role)) return NextResponse.json({ error: need === "autonomy" ? "Only a workspace owner or admin can change this." : "You cannot decide actions in this workspace." }, { status: 403 })
    const { data: { user } } = await (await createClient()).auth.getUser()
    return { ...scope, email: user?.email ?? null }
  } catch (e) { return workspaceError(e) }
}
