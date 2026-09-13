import { createHash, randomBytes } from "node:crypto"
import { z } from "zod"
import { sql } from "@/lib/db"
import { WorkspaceError } from "@/lib/auth/workspace-context"
import { sendEmail, isResendConfigured } from "@/lib/email/resend"

export const teamActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("invite"), revision: z.number().int().nonnegative(), email: z.string().trim().email().max(254).transform(s => s.toLowerCase()), role: z.enum(["admin","member","viewer"]), canSendOutreach: z.boolean().default(false), delivery: z.enum(["link","email"]).default("link") }),
  z.object({ action: z.literal("revoke_invitation"), revision: z.number().int().nonnegative(), invitationId: z.string().uuid() }),
  z.object({ action: z.literal("set_sending"), revision: z.number().int().nonnegative(), canSendOutreach:z.boolean() }),
  z.object({ action: z.literal("change_role"), revision: z.number().int().nonnegative(), userId: z.string().min(1).max(200), role: z.enum(["admin","member","viewer"]), canSendOutreach: z.boolean().optional() }),
  ...(["remove_member","start_transfer"] as const).map(action => z.object({ action: z.literal(action), revision: z.number().int().nonnegative(), userId: z.string().min(1).max(200) })),
  ...(["accept_transfer","cancel_transfer"] as const).map(action => z.object({ action: z.literal(action), revision: z.number().int().nonnegative(), transferId: z.string().uuid() })),
  ...(["leave","archive","restore"] as const).map(action => z.object({ action: z.literal(action), revision: z.number().int().nonnegative() })),
])
export type TeamActor = { id: string; email?: string; email_confirmed_at?: string }
export const hashInvitation = (token: string) => createHash("sha256").update(token).digest("hex")

export async function getWorkspaceTeam(actor: TeamActor, orgId: string) {
  const [workspace] = await sql`SELECT o.id, o.name, o.kind, o.owner_user_id, o.archived_at, o.team_revision, m.org_role, m.persona
    FROM organizations o JOIN memberships m ON m.org_id=o.id WHERE o.id=${orgId} AND m.user_id=${actor.id}`
  if (!workspace || workspace.persona !== (workspace.kind === "company" ? "founder" : "vc")) throw new WorkspaceError("Workspace team not found.", 404)
  const isOwner = workspace.owner_user_id === actor.id && workspace.org_role === "workspace_owner"
  if (workspace.archived_at && !isOwner) throw new WorkspaceError("This workspace is archived.", 403)
  const canManage = isOwner || workspace.org_role === "admin"
  const members = await sql`SELECT user_id, org_role, persona, can_send_outreach, contact_email, created_at FROM memberships WHERE org_id=${orgId} AND persona=${workspace.persona} ORDER BY created_at,user_id`
  const invitations = canManage ? await sql`SELECT id,email,role,can_send_outreach,expires_at,created_at,
    CASE WHEN status='pending' AND expires_at<=now() THEN 'expired' ELSE status END AS status,delivery_status,delivery_error
    FROM workspace_invitations WHERE org_id=${orgId} ORDER BY created_at DESC LIMIT 100` : []
  const transfers = await sql`SELECT id,from_user_id,to_user_id,status,expires_at FROM workspace_ownership_transfers
    WHERE org_id=${orgId} AND status='pending' AND (${isOwner} OR to_user_id=${actor.id})`
  const events = canManage ? await sql`SELECT id,actor_user_id,action,target_user_id,details,created_at FROM workspace_access_events WHERE org_id=${orgId} ORDER BY id DESC LIMIT 100` : []
  return { workspace, members: members.map(m => ({ ...m, contact_email: m.user_id === actor.id ? actor.email ?? m.contact_email : m.contact_email })), invitations, transfers, events,
    actorId: actor.id, isOwner, canManage, emailAvailable: isResendConfigured() }
}

export async function changeWorkspaceTeam(actor: TeamActor, orgId: string, raw: unknown) {
  const input = teamActionSchema.parse(raw)
  if (input.action === "invite" && input.delivery === "email" && !isResendConfigured()) throw new WorkspaceError("Email delivery is unavailable. Create a shareable invitation link instead.", 503)
  const token = input.action === "invite" ? randomBytes(32).toString("base64url") : null
  const payload = input.action === "invite" ? { ...input, tokenHash: hashInvitation(token!), delivery: input.delivery === "email" ? "pending" : "link" } : input
  const [row] = await sql`SELECT workspace_team_action(${actor.id},${orgId},${input.action},${JSON.stringify(payload)}::jsonb) AS result`
  const result = row.result
  if (input.action !== "invite") return result
  const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || "https://www.an-ker.de").origin
  const invitationUrl = `${origin}/join-workspace#${token}`
  let deliveryStatus = "link"
  if (input.delivery === "email") {
    try {
      const receipt = await sendEmail({ to: input.email, subject: "Your Anker workspace invitation",
        text: `You have been invited to an Anker workspace as ${input.role}. Sign in with ${input.email} and review the invitation before accepting.\n\n${invitationUrl}\n\nThis invitation expires in seven days. If you were not expecting it, you can ignore this message.`,
        idempotencyKey: `workspace-invite:${result.invitationId}`, signal: AbortSignal.timeout(25000) })
      await sql`UPDATE workspace_invitations SET delivery_status='sent',provider_id=${receipt.resendId} WHERE id=${result.invitationId} AND org_id=${orgId}`
      deliveryStatus = "sent"
    } catch {
      deliveryStatus = "failed"
      await sql`UPDATE workspace_invitations SET delivery_status='failed',delivery_error='Email delivery was not confirmed. Share the invitation link or replace the invitation.' WHERE id=${result.invitationId} AND org_id=${orgId}`.catch(() => {})
    }
  }
  return { ...result, invitationUrl, deliveryStatus }
}

export async function reviewInvitation(actor: TeamActor, token: string, accept: boolean) {
  if (!actor.email || !actor.email_confirmed_at) throw new WorkspaceError("Verify your account email before accepting a workspace invitation.", 403)
  if (!/^[a-zA-Z0-9_-]{43}$/.test(token)) throw new WorkspaceError("This invitation link is invalid.", 400)
  const hash = hashInvitation(token)
  if (accept) {
    const [row] = await sql`SELECT workspace_accept_invitation(${actor.id},${actor.email},${hash}) AS org_id`
    return { orgId: row.org_id }
  }
  const [invitation] = await sql`SELECT o.name,o.kind,i.role,i.can_send_outreach,i.expires_at,i.status
    FROM workspace_invitations i JOIN organizations o ON o.id=i.org_id
    WHERE i.token_hash=${hash} AND lower(i.email)=lower(${actor.email}) AND o.archived_at IS NULL`
  if (!invitation) throw new WorkspaceError("Invitation unavailable. Sign in with the email address that was invited, or request a new link.", 404)
  if (invitation.status === "revoked" || (invitation.status !== "accepted" && new Date(invitation.expires_at) <= new Date())) throw new WorkspaceError("Invitation expired or was revoked. Request a new link.", 410)
  return { invitation }
}
