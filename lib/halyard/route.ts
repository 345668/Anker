import "server-only"
import { NextResponse } from "next/server"
import { requireWorkspace, workspaceError } from "@/lib/auth/workspace-context"
import { resolveAiPrincipal } from "@/lib/assistant/principal"
import { withAiContext } from "@/lib/assistant/context"
import { HalyardError, ownedSession, type SessionRow } from "./sessions"
import { viewableSession } from "./sharing"

/** The signed-in person in their active workspace. Halyard is for people who work in a workspace, not for investors or LPs outside one. */
export async function halyardContext(write = true) {
  const s = await requireWorkspace(write)
  return { userId: s.userId, orgId: s.orgId, persona: s.persona }
}
export async function sessionContext(id: string) {
  const c = await halyardContext(), s = await ownedSession(id, c.orgId, c.userId)
  return { ...c, session: s }
}
/** The owner, or a colleague the finished call was shared with (read only). */
export async function viewContext(id: string) {
  const c = await halyardContext(false), v = await viewableSession(id, c.orgId, c.userId)
  return { ...c, ...v }
}
/** Runs model work attributed to the workspace (ai_calls, the allowance, the data policy). */
export async function inWorkspaceAi<T>(c: { userId: string; orgId: string }, signal: AbortSignal | undefined, run: () => Promise<T>): Promise<T> {
  const principal = await resolveAiPrincipal(c.userId, { orgId: c.orgId })
  return withAiContext(principal, run, signal)
}
export function halyardFailure(e: unknown) {
  if (e instanceof HalyardError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status })
  if (e instanceof SyntaxError) return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  return workspaceError(e)
}
export const publicSession = (s: SessionRow) => ({
  id: s.id, mode: s.mode, title: s.title, language: s.language, state: s.state, source: s.source, startedAt: s.started_at, endedAt: s.ended_at,
  stt: s.stt, audioSeconds: s.audio_seconds, chars: s.chars, callId: s.call_id, crmEntryId: s.crm_entry_id,
})
