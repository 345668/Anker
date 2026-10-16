import "server-only"
import { sql } from "@/lib/db"
import { disconnectBot } from "./bots"

/**
 * A person who is no longer a member of a workspace must lose their Telegram access to it (docs/architecture/57 section 20): their phones are disconnected, their queued
 * messages dropped, and their personal bot (if any) is removed with its webhook and token. There is no member-removal screen in the app yet, so this does not depend on one:
 * it is a check that runs every minute from the Telegram sweep, and `forgetMember` is the call any future removal path should make at once.
 */
export async function forgetMember(orgId: string, userId: string, by = "membership_removed"): Promise<{ links: number; bot: boolean }> {
  const revoked = (await sql`UPDATE telegram_links SET status = 'revoked', revoked_at = now(), revoked_by = ${by} WHERE org_id = ${orgId} AND user_id = ${userId} AND status <> 'revoked' RETURNING id`) as any[]
  if (revoked.length) await sql`UPDATE telegram_updates SET status = 'dropped', payload_enc = NULL, finished_at = now() WHERE link_id = ANY(${revoked.map((r) => r.id)}::text[]) AND status IN ('queued', 'running')`
  await sql`DELETE FROM telegram_link_codes WHERE org_id = ${orgId} AND user_id = ${userId}`
  const bot = await disconnectBot(orgId, by, { scope: "personal", userId })
  return { links: revoked.length, bot }
}

/** Finds links and personal bots whose owner is no longer a member of the workspace, and removes them. Cheap when there is nothing to do. */
export async function purgeFormerMembers(): Promise<{ members: number; links: number; bots: number }> {
  const gone = (await sql`SELECT DISTINCT x.org_id, x.user_id FROM (
      SELECT org_id, user_id FROM telegram_links WHERE status <> 'revoked'
      UNION SELECT org_id, user_id FROM telegram_bots WHERE user_id IS NOT NULL) x
    WHERE NOT EXISTS (SELECT 1 FROM memberships m WHERE m.org_id::text = x.org_id AND m.user_id::text = x.user_id) LIMIT 50`) as any[]
  let links = 0, bots = 0
  for (const g of gone) { const r = await forgetMember(String(g.org_id), String(g.user_id)); links += r.links; if (r.bot) bots++ }
  return { members: gone.length, links, bots }
}

/** True when the person still belongs to the workspace. */
export async function isMember(orgId: string, userId: string): Promise<boolean> {
  const [r] = (await sql`SELECT 1 AS ok FROM memberships WHERE org_id::text = ${orgId} AND user_id::text = ${userId} LIMIT 1`) as any[]
  return !!r
}
