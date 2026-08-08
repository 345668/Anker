import { cookies } from "next/headers"
import { sql } from "@/lib/db"

/**
 * Active-workspace resolution for the app shell (entity switcher / ⌘K / scope).
 * Active org lives in the `anker_org` cookie, always validated against the
 * user's memberships (a stale/foreign cookie heals to the first membership).
 */

export const ACTIVE_ORG_COOKIE = "anker_org"

export type Membership = {
  orgId: string
  name: string
  kind: "company" | "fund"
  orgRole: string
  persona: "founder" | "vc" | null
  canSendOutreach: boolean
}

export async function getMemberships(userId: string): Promise<Membership[]> {
  const rows = await sql`
    SELECT m.org_id, m.org_role, m.persona, m.can_send_outreach, o.name, o.kind
    FROM memberships m
    JOIN organizations o ON o.id = m.org_id
    WHERE m.user_id = ${userId}
    ORDER BY m.created_at ASC
  `
  return rows.map((r: any) => ({
    orgId: r.org_id,
    name: r.name,
    kind: r.kind,
    orgRole: r.org_role,
    persona: r.persona,
    canSendOutreach: !!r.can_send_outreach,
  }))
}

/** Resolve the active membership: cookie if valid, else the first one. */
export async function resolveActiveMembership(userId: string): Promise<{ active: Membership | null; all: Membership[] }> {
  const all = await getMemberships(userId)
  if (all.length === 0) return { active: null, all }
  const store = await cookies()
  const cookieOrg = store.get(ACTIVE_ORG_COOKIE)?.value
  const active = all.find((m) => m.orgId === cookieOrg) ?? all[0]
  return { active, all }
}

export async function setActiveOrgCookie(orgId: string): Promise<void> {
  const store = await cookies()
  store.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })
}
