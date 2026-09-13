import { createClient } from "@/lib/supabase/server"
import { resolveActiveMembership } from "@/lib/org/active"
import { NextResponse } from "next/server"
import { sql } from "@/lib/db"

export class MatchingError extends Error {
  constructor(message: string, public status: number) { super(message) }
}
export async function matchingContext(persona?: "founder" | "vc") {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) throw new MatchingError("Sign in to continue.", 401)
  const { active } = await resolveActiveMembership(user.id)
  if (!active) throw new MatchingError("Create or select a workspace first.", 403)
  if (persona && active.persona !== persona) throw new MatchingError(`Switch to a ${persona === "vc" ? "fund" : "company"} workspace to use this engine.`, 403)
  return { userId: user.id, orgId: active.orgId }
}
export function matchingFailure(error: unknown, fallback: string) {
  if (error instanceof MatchingError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  return NextResponse.json({ error: fallback }, { status: 503 })
}
export async function authorizedSession(sessionId: string) {
  const context = await matchingContext("vc")
  const [session] = await sql`SELECT s.* FROM lp_match_sessions s JOIN fund_profiles f ON f.id = s.fund_profile_id
    WHERE s.id = ${sessionId} AND s.user_id = ${context.userId} AND f.org_id = ${context.orgId} AND s.status='completed' LIMIT 1`
  if (!session) throw new MatchingError("Session not found in this workspace.", 404)
  return session
}
export async function authorizedProfile(id: string) {
  const scope = await matchingContext("vc")
  const [row] = await sql`SELECT * FROM fund_profiles WHERE id=${id} AND user_id=${scope.userId} AND org_id=${scope.orgId}`
  if (!row) throw new MatchingError("Profile not found in this workspace.", 404)
  return row
}
export async function authorizedMatch(id: string, kind: "firm" | "contact") {
  const table = kind === "firm" ? "lp_firm_matches" : "lp_contact_matches"
  const scope = await matchingContext("vc")
  const [row] = await sql.unsafe(`SELECT m.* FROM ${table} m JOIN fund_profiles f ON f.id=m.fund_profile_id
    WHERE m.id=$1 AND f.user_id=$2 AND f.org_id=$3 LIMIT 1`, [id, scope.userId, scope.orgId])
  if (!row) throw new MatchingError("Match not found in this workspace.", 404)
  return row
}
