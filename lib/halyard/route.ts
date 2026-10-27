import "server-only"
import { NextResponse } from "next/server"
import { requireWorkspace, workspaceError } from "@/lib/auth/workspace-context"
import { resolveAiPrincipal } from "@/lib/assistant/principal"
import { withAiContext } from "@/lib/assistant/context"
import { headers } from "next/headers"
import { authenticateDevice } from "@/lib/calls/devices"
import { CallError } from "@/lib/calls/access"
import { HalyardError, ownedSession, type SessionRow } from "./sessions"
import { viewableSession } from "./sharing"

/**
 * Who is calling: a signed-in person in their active workspace, or a paired desktop app presenting its device key (`Authorization: Bearer anker_call_...`, the same credential the call
 * sync uses; membership is checked on every request, and a revoked or expired key stops working at once). A device acts as its owner in the workspace it was paired with, on the person's
 * own sessions only; it cannot change workspace settings (the role is reported as a plain member) or share a call.
 */
export async function halyardWho(write = true) {
  const auth = (await headers()).get("authorization")
  if (auth && /^Bearer anker_call_/.test(auth)) {
    try {
      const d = await authenticateDevice(auth)
      return { userId: d.userId, orgId: d.orgId, persona: d.persona as string, name: d.workspace, role: "member", via: "device" as const, deviceId: d.deviceId ?? null }
    } catch (e) { if (e instanceof CallError) throw new HalyardError(e.message, e.status, "device"); throw e }
  }
  const s = await requireWorkspace(write)
  return { userId: s.userId, orgId: s.orgId, persona: s.persona as string, name: s.name, role: String(s.role), via: "browser" as const, deviceId: null }
}
/** The person in their workspace (browser or paired desktop). */
export async function halyardContext(write = true) {
  const w = await halyardWho(write)
  return { userId: w.userId, orgId: w.orgId, persona: w.persona, via: w.via, deviceId: w.deviceId }
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
  stt: s.stt, participantsInformed: s.participants_informed, consentAttestedAt: s.consent_attested_at, audioSeconds: s.audio_seconds, chars: s.chars, callId: s.call_id, crmEntryId: s.crm_entry_id,
})
