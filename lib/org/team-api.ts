import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { WorkspaceError } from "@/lib/auth/workspace-context"
export async function teamActor() {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) throw new WorkspaceError("Sign in to manage workspace access.", 401)
  return user
}
export function teamFailure(error: unknown) {
  if (error instanceof WorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message || "Check the requested change." }, { status: 400 })
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON." }, { status: 400 })
  const code = (error as { code?: string })?.code
  const status = code === "42501" ? 403 : code === "P0002" ? 404 : ["40001","23505"].includes(code || "") ? 409 : 503
  const message = status === 503 ? "Workspace access could not be updated. Check the database migration and retry." : (error as Error).message
  return NextResponse.json({ error: message }, { status })
}
