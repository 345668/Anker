import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveActiveMembership, type Persona } from "@/lib/org/active"
import { headers } from "next/headers"

export type CallScope = { userId: string; orgId: string; persona: Persona; writable: boolean; workspace: string }
export class CallError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}
export async function callScope(write = false): Promise<CallScope> {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) throw new CallError("Sign in to continue.", 401)
  const { active } = await resolveActiveMembership(user.id)
  if (!active?.persona) throw new CallError("Select a configured workspace before using Call Intelligence.", 403)
  if (write && (await headers()).get("x-anker-workspace") !== active.orgId) throw new CallError("Your active workspace changed. Reload before saving this call.", 409)
  const writable = active.orgRole !== "viewer"
  if (write && !writable) throw new CallError("This workspace grants view-only access.", 403)
  return { userId: user.id, orgId: active.orgId, persona: active.persona, writable, workspace: active.name }
}
export async function readCallBody(req: NextRequest) {
  // Bounded stream, including clients that omit Content-Length.
  const reader = req.body?.getReader()
  if (!reader) throw new CallError("Request body required.")
  let bytes = 0
  const chunks: Uint8Array[] = []
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > 400000) { await reader.cancel(); throw new CallError("Transcript is too large.", 413) }
    chunks.push(value)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) } catch { throw new CallError("Invalid JSON.") }
}
export async function callResponse(action: () => Promise<unknown>) {
  try { return NextResponse.json(await action(), { headers: { "Cache-Control": "no-store" } }) }
  catch (error) {
    return NextResponse.json({ error: error instanceof CallError ? error.message : "Call service unavailable. Your saved records are unchanged; please retry." }, { status: error instanceof CallError ? error.status : 503, headers: { "Cache-Control": "no-store" } })
  }
}
