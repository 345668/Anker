/**
 * Resolve the tenant user a request acts as.
 *
 * Normally that is the signed-in Supabase user. The staff portal (SAIL) also
 * hosts tools whose engines live here and which are USER-scoped rather than
 * admin-scoped — sending outreach email, running the profile/enrichment agents.
 * Those cannot use the admin bearer in require-admin.ts, because they need a
 * concrete tenant identity, not "some admin".
 *
 * This is a stronger grant than the admin bearer: it lets the portal act AS a
 * named tenant user, including sending real email from their mailbox. The
 * constraints are correspondingly tighter:
 *
 *   • Opt-in — inert unless PORTAL_SERVICE_TOKEN is set (>= 32 chars).
 *   • Constant-time bearer comparison.
 *   • The acting user MUST be named explicitly in x-portal-act-as-user. There
 *     is no default and no fallback: a missing header is a hard failure, never
 *     "act as the first admin".
 *   • The id MUST resolve to a real row in users. A typo fails loudly rather
 *     than acting as a phantom principal.
 *   • The returned metadata deliberately carries NO role. Acting as a user
 *     grants THAT USER's privileges — routes which branch on
 *     metadata.role === "admin" must not silently escalate.
 *
 * Every resolution is audited, because this is impersonation.
 */
import "server-only"
import { headers } from "next/headers"
import { timingSafeEqual } from "node:crypto"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"
import { logAudit } from "@/lib/audit/audit-log"

export interface ActingUser {
  id: string
  email: string | null
  user_metadata: Record<string, any>
  /** True when resolved through the portal rather than a browser session. */
  viaPortal: boolean
  /** Portal staff who initiated it, for audit. Advisory, never an auth factor. */
  portalStaffEmail: string | null
}

function portalToken(): string | null {
  const t = process.env.PORTAL_SERVICE_TOKEN
  return t && t.length >= 32 ? t : null
}

function bearerMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function portalActingUser(): Promise<ActingUser | null> {
  const expected = portalToken()
  if (!expected) return null

  const h = await headers()
  const m = (h.get("authorization") || "").match(/^Bearer\s+(\S+)$/i)
  if (!m || !bearerMatches(m[1], expected)) return null

  // Explicit subject required. No default — impersonation must always name who.
  const actAs = (h.get("x-portal-act-as-user") || "").trim()
  if (!actAs) return null

  // The subject must exist. Prevents acting as a phantom id.
  let row: { id: string; email: string | null } | undefined
  try {
    const rows = (await sql`
      SELECT id::text AS id, email FROM users WHERE id::text = ${actAs} LIMIT 1
    `) as Array<{ id: string; email: string | null }>
    row = rows[0]
  } catch {
    return null
  }
  if (!row) return null

  const staffEmail = h.get("x-portal-staff-email") || null

  // Impersonation is always recorded. logAudit already swallows its own
  // failures, so this can never block the underlying action.
  await logAudit({
    actorId: "portal-service",
    actorEmail: staffEmail,
    action: "portal.act_as_user",
    targetType: "users",
    targetId: row.id,
    targetLabel: row.email,
    metadata: { actingAs: row.id, actingAsEmail: row.email, staffEmail },
  })

  return {
    id: row.id,
    email: row.email,
    // No role. Acting as a user grants that user's privileges, not admin.
    user_metadata: {},
    viaPortal: true,
    portalStaffEmail: staffEmail,
  }
}

/**
 * The user this request acts as, or null when unauthenticated.
 * Portal impersonation is checked first — those calls carry a bearer, not a cookie.
 */
export async function resolveActingUser(): Promise<ActingUser | null> {
  const viaPortal = await portalActingUser()
  if (viaPortal) return viaPortal

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    return {
      id: user.id,
      email: user.email ?? null,
      user_metadata: (user.user_metadata ?? {}) as Record<string, any>,
      viaPortal: false,
      portalStaffEmail: null,
    }
  } catch {
    return null
  }
}
