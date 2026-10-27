import "server-only"
import { sql } from "@/lib/db"
import { HalyardError, type SessionRow } from "./sessions"

/**
 * Sharing a finished call with a teammate (docs/architecture/62 sections 9 and 13). Explicit and per person: the owner picks colleagues from their own workspace; only a FINISHED call can
 * be shared (following a live call is the desktop's follow-along, H7); a person with access can read the transcript, the brief and the notes, never the owner's suggestions or the
 * follow-up email draft, and can change nothing. The owner can withdraw access at any time, and access ends on its own when the person leaves the workspace.
 */
export interface Member { userId: string; name: string; email: string; role: string }

export async function listMembers(orgId: string, selfId: string): Promise<Member[]> {
  const rows = (await sql`SELECT m.user_id, m.org_role, p.full_name, p.email FROM memberships m LEFT JOIN profiles p ON p.id::text = m.user_id::text
    WHERE m.org_id::text = ${orgId} AND m.user_id::text <> ${selfId} ORDER BY p.full_name NULLS LAST, p.email LIMIT 200`) as any[]
  return rows.map((r) => ({ userId: String(r.user_id), name: r.full_name || r.email || "Member", email: r.email || "", role: r.org_role }))
}
const isMember = async (orgId: string, userId: string) => !!((await sql`SELECT 1 FROM memberships WHERE org_id::text = ${orgId} AND user_id::text = ${userId} LIMIT 1`) as any[])[0]

export async function listShares(sessionId: string): Promise<Array<{ userId: string; name: string; email: string; grantedAt: string | null }>> {
  const rows = (await sql`SELECT v.viewer_user_id, p.full_name, p.email FROM halyard_viewers v LEFT JOIN profiles p ON p.id::text = v.viewer_user_id WHERE v.session_id = ${sessionId} AND v.revoked_at IS NULL ORDER BY p.full_name NULLS LAST`) as any[]
  return rows.map((r) => ({ userId: String(r.viewer_user_id), name: r.full_name || r.email || "Member", email: r.email || "", grantedAt: null }))
}
export async function shareSession(s: SessionRow, targetUserId: string): Promise<void> {
  if (s.state !== "ended") throw new HalyardError("A call can be shared once it has ended.", 409, "not_ended")
  if (!targetUserId || targetUserId === s.user_id) throw new HalyardError("Choose a colleague.", 400, "bad_target")
  if (!(await isMember(s.org_id, targetUserId))) throw new HalyardError("That person is not a member of this workspace.", 404, "not_member")
  await sql`INSERT INTO halyard_viewers (session_id, viewer_user_id, granted_by) VALUES (${s.id}, ${targetUserId}, ${s.user_id})
    ON CONFLICT (session_id, viewer_user_id) DO UPDATE SET revoked_at = NULL, granted_by = EXCLUDED.granted_by`
}
export async function unshareSession(s: SessionRow, targetUserId: string): Promise<void> {
  await sql`UPDATE halyard_viewers SET revoked_at = now() WHERE session_id = ${s.id} AND viewer_user_id = ${targetUserId} AND revoked_at IS NULL`
}

/** The session for its owner, or for a person it was shared with (finished call, still a member of the workspace, access not withdrawn). */
export async function viewableSession(id: string, orgId: string, userId: string): Promise<{ session: SessionRow; role: "owner" | "viewer"; ownerName: string }> {
  const [r] = (await sql`SELECT s.*, p.full_name AS owner_name, p.email AS owner_email FROM halyard_sessions s LEFT JOIN profiles p ON p.id::text = s.user_id WHERE s.id = ${id} AND s.org_id = ${orgId}`) as any[]
  if (!r) throw new HalyardError("That session was not found.", 404, "not_found")
  const { owner_name, owner_email, ...session } = r
  const ownerName = owner_name || owner_email || "a colleague"
  if (session.user_id === userId) return { session, role: "owner", ownerName }
  const [v] = (await sql`SELECT 1 FROM halyard_viewers WHERE session_id = ${id} AND viewer_user_id = ${userId} AND revoked_at IS NULL`) as any[]
  if (!v || session.state !== "ended" || !(await isMember(orgId, userId))) throw new HalyardError("That session was not found.", 404, "not_found")
  return { session, role: "viewer", ownerName }
}

export async function sharedWithMe(orgId: string, userId: string) {
  const rows = (await sql`SELECT s.*, p.full_name AS owner_name, p.email AS owner_email FROM halyard_viewers v JOIN halyard_sessions s ON s.id = v.session_id LEFT JOIN profiles p ON p.id::text = s.user_id
    WHERE v.viewer_user_id = ${userId} AND v.revoked_at IS NULL AND s.org_id = ${orgId} AND s.state = 'ended' ORDER BY s.ended_at DESC NULLS LAST LIMIT 50`) as any[]
  return rows.map((r) => ({ session: r as SessionRow, ownerName: r.owner_name || r.owner_email || "a colleague" }))
}
