/**
 * Teams on an investor entity and its dashboard (docs/architecture/69). The owner invites by email with a role; the invited person accepts for themselves, signed in with that confirmed address.
 * A fund never sees the team.
 */
import { sql } from "@/lib/db"
import { InvestorError, entityIdsFor, getEntity, logEvent, type EntityView } from "./profile"
import { myRequests, type InvestorRequestView } from "./requests"

export const TEAM_MAX = 10, INVITES_OPEN_MAX = 10, INVITE_DAYS = 14
export const ROLES = ["can_act", "can_view"] as const
export type TeamRole = (typeof ROLES)[number]
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/
type Send = (m: { to: string; subject: string; text: string }) => Promise<void>
const appUrl = () => (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.an-ker.de").replace(/\/$/, "")
const defaultSend: Send = async (m) => {
  const { isResendConfigured, sendEmail } = await import("@/lib/email/resend")
  if (!isResendConfigured()) return
  await sendEmail({ ...m, noTracking: true })
}
const role = (v: unknown): TeamRole => { if (!(ROLES as readonly string[]).includes(String(v))) throw new InvestorError("Choose a role: can act, or can view."); return v as TeamRole }
async function owned(userId: string, entityId: string): Promise<EntityView> {
  if (!(await entityIdsFor(userId, "own")).includes(entityId)) throw new InvestorError("Only the owner of this entity can do that.", 403, "owner_only")
  const e = await getEntity(userId, entityId)
  if (!e) throw new InvestorError("That entity was not found.", 404, "not_found")
  return e
}

export interface TeamView {
  entityId: string; role: string
  owner: { name: string }; members: Array<{ userId: string; name: string; role: TeamRole; email: string | null; since: string }>
  invites: Array<{ id: string; email: string; role: TeamRole; expiresAt: string }>
}
export async function teamOf(userId: string, entityId: string): Promise<TeamView> {
  const e = await getEntity(userId, entityId)
  if (!e) throw new InvestorError("That entity was not found.", 404, "not_found")
  const isOwner = e.role === "owner"
  const [o] = (await sql`SELECT COALESCE(p.display_name, 'Owner') AS name FROM investor_entities e LEFT JOIN investor_profiles p ON p.user_id = e.user_id WHERE e.id = ${entityId}`) as any[]
  const members = (await sql`SELECT m.user_id, m.role, m.created_at, COALESCE(p.display_name, 'Member') AS name, pr.email FROM investor_entity_members m LEFT JOIN investor_profiles p ON p.user_id = m.user_id LEFT JOIN profiles pr ON pr.id::text = m.user_id WHERE m.entity_id = ${entityId} ORDER BY m.created_at`) as any[]
  const invites = isOwner ? ((await sql`SELECT id, email, role, expires_at FROM investor_entity_invites WHERE entity_id = ${entityId} AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC`) as any[]) : []
  return { entityId, role: e.role, owner: { name: o?.name ?? "Owner" },
    members: members.map((m) => ({ userId: String(m.user_id), name: m.name, role: m.role, email: isOwner ? m.email ?? null : null, since: new Date(m.created_at).toISOString() })),
    invites: invites.map((i) => ({ id: String(i.id), email: i.email, role: i.role, expiresAt: new Date(i.expires_at).toISOString() })) }
}

export async function invite(ownerId: string, entityId: string, input: { email: unknown; role: unknown }, send: Send = defaultSend): Promise<void> {
  const e = await owned(ownerId, entityId)
  const to = String(input.email ?? "").trim().toLowerCase(), r = role(input.role)
  if (!EMAIL.test(to)) throw new InvestorError("Enter a valid email address.")
  const [own] = (await sql`SELECT lower(p.email) AS email FROM profiles p WHERE p.id::text = ${ownerId}`) as any[]
  if (own?.email === to) throw new InvestorError("That is your own address: you already own this entity.", 409, "self")
  const [m] = (await sql`SELECT count(*)::int n, count(*) FILTER (WHERE lower(pr.email) = ${to})::int has FROM investor_entity_members x LEFT JOIN profiles pr ON pr.id::text = x.user_id WHERE x.entity_id = ${entityId}`) as any[]
  if (Number(m.has) > 0) throw new InvestorError("That person is already on the team.", 409, "member")
  if (Number(m.n) >= TEAM_MAX) throw new InvestorError(`A team can have up to ${TEAM_MAX} people besides the owner.`, 409, "limit")
  const [o] = (await sql`SELECT count(*)::int n FROM investor_entity_invites WHERE entity_id = ${entityId} AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()`) as any[]
  if (Number(o.n) >= INVITES_OPEN_MAX) throw new InvestorError("Too many invitations are waiting. Revoke one first.", 429, "limit")
  await sql`DELETE FROM investor_entity_invites WHERE entity_id = ${entityId} AND lower(email) = ${to} AND accepted_at IS NULL AND (revoked_at IS NOT NULL OR expires_at <= now())`
  try { await sql`INSERT INTO investor_entity_invites (entity_id, email, role, invited_by, expires_at) VALUES (${entityId}, ${to}, ${r}, ${ownerId}, now() + make_interval(days => ${INVITE_DAYS}))` }
  catch (x: any) { if (x?.code === "23505") throw new InvestorError("That address already has an invitation waiting.", 409, "pending"); throw x }
  await logEvent(entityId, ownerId, "team_invited", { role: r })
  await send({ to, subject: "You have an invitation on Anker", text: `Someone has invited you to an investor account on Anker.\n\nSign in with this email address to see it and answer: ${appUrl()}/investor\n\nThe invitation is valid for ${INVITE_DAYS} days. If you did not expect it, ignore this email.` }).catch((x) => console.warn("[investor-team] invite email failed:", x?.message))
  void e
}
export async function revokeInvite(ownerId: string, entityId: string, inviteId: string): Promise<void> {
  await owned(ownerId, entityId)
  const rows = (await sql`UPDATE investor_entity_invites SET revoked_at = now() WHERE id::text = ${inviteId} AND entity_id = ${entityId} AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id`) as any[]
  if (!rows.length) throw new InvestorError("That invitation was not found.", 404, "not_found")
  await logEvent(entityId, ownerId, "team_invite_revoked")
}
export async function removeMember(ownerId: string, entityId: string, memberId: string): Promise<void> {
  await owned(ownerId, entityId)
  const rows = (await sql`DELETE FROM investor_entity_members WHERE entity_id = ${entityId} AND user_id = ${memberId} RETURNING user_id`) as any[]
  if (!rows.length) throw new InvestorError("That person is not on the team.", 404, "not_found")
  await logEvent(entityId, ownerId, "team_removed", { member: memberId })
}
export async function changeRole(ownerId: string, entityId: string, memberId: string, newRole: unknown): Promise<void> {
  await owned(ownerId, entityId)
  const rows = (await sql`UPDATE investor_entity_members SET role = ${role(newRole)} WHERE entity_id = ${entityId} AND user_id = ${memberId} RETURNING user_id`) as any[]
  if (!rows.length) throw new InvestorError("That person is not on the team.", 404, "not_found")
  await logEvent(entityId, ownerId, "team_role_changed", { member: memberId, role: newRole })
}
/** A member leaves. The owner cannot leave: they archive the entity instead. */
export async function leave(userId: string, entityId: string): Promise<void> {
  const rows = (await sql`DELETE FROM investor_entity_members WHERE entity_id = ${entityId} AND user_id = ${userId} RETURNING user_id`) as any[]
  if (!rows.length) throw new InvestorError("You are not a member of this team.", 404, "not_found")
  await logEvent(entityId, userId, "team_left")
}

// ─── invitations to me ─────────────────────────────────────────────────────────

export interface InvitationView { id: string; entityName: string; role: TeamRole; from: string; expiresAt: string }
/** Open invitations for the signed-in person's confirmed address. */
export async function myInvitations(email: string | null, confirmed: boolean): Promise<InvitationView[]> {
  const e = String(email ?? "").trim().toLowerCase()
  if (!e || !confirmed) return []
  const rows = (await sql`SELECT i.id, i.role, i.expires_at, ie.legal_name, COALESCE(p.display_name, 'The owner') AS from_name FROM investor_entity_invites i JOIN investor_entities ie ON ie.id = i.entity_id AND ie.archived_at IS NULL LEFT JOIN investor_profiles p ON p.user_id = i.invited_by
    WHERE lower(i.email) = ${e} AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now() ORDER BY i.created_at DESC`) as any[]
  return rows.map((r) => ({ id: String(r.id), entityName: r.legal_name, role: r.role, from: r.from_name, expiresAt: new Date(r.expires_at).toISOString() }))
}
export async function answerInvitation(userId: string, email: string | null, confirmed: boolean, inviteId: string, action: "accept" | "decline"): Promise<void> {
  const mine = (await myInvitations(email, confirmed)).find((i) => i.id === inviteId)
  if (!mine) throw new InvestorError("That invitation was not found for your address.", 404, "not_found")
  const [i] = (await sql`SELECT entity_id, role FROM investor_entity_invites WHERE id::text = ${inviteId}`) as any[]
  if (action === "decline") { await sql`UPDATE investor_entity_invites SET revoked_at = now() WHERE id::text = ${inviteId}`; return }
  const [o] = (await sql`SELECT user_id FROM investor_entities WHERE id = ${i.entity_id}`) as any[]
  if (String(o?.user_id) === userId) throw new InvestorError("You already own this entity.", 409, "self")
  const [n] = (await sql`SELECT count(*)::int n FROM investor_entity_members WHERE entity_id = ${i.entity_id}`) as any[]
  if (Number(n.n) >= TEAM_MAX) throw new InvestorError("This team is full.", 409, "limit")
  await sql`INSERT INTO investor_entity_members (entity_id, user_id, role, added_by) VALUES (${i.entity_id}, ${userId}, ${i.role}, (SELECT invited_by FROM investor_entity_invites WHERE id::text = ${inviteId})) ON CONFLICT (entity_id, user_id) DO UPDATE SET role = EXCLUDED.role`
  await sql`UPDATE investor_entity_invites SET accepted_at = now() WHERE id::text = ${inviteId}`
  await logEvent(String(i.entity_id), userId, "team_joined", { role: i.role })
}

// ─── the dashboard of one entity ─────────────────────────────────────────────────

export interface EntityDashboard { entity: EntityView; team: TeamView; requests: InvestorRequestView[]; events: Array<{ id: string; by: string; action: string; at: string; detail: Record<string, unknown> }> }
export async function dashboardOf(userId: string, entityId: string): Promise<EntityDashboard> {
  const entity = await getEntity(userId, entityId)
  if (!entity) throw new InvestorError("That entity was not found.", 404, "not_found")
  const team = await teamOf(userId, entityId)
  const requests = await myRequests(userId, { entityId })
  const ev = (await sql`SELECT x.id, x.action, x.at, x.detail, COALESCE(p.display_name, 'Someone') AS name FROM investor_entity_events x LEFT JOIN investor_profiles p ON p.user_id = x.user_id WHERE x.entity_id = ${entityId} ORDER BY x.at DESC LIMIT 20`) as any[]
  return { entity, team, requests, events: ev.map((x) => ({ id: String(x.id), by: x.name, action: x.action, at: new Date(x.at).toISOString(), detail: typeof x.detail === "string" ? JSON.parse(x.detail) : x.detail ?? {} })) }
}
