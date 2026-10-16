import "server-only"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { sql } from "@/lib/db"

/**
 * Linking a Telegram account to a person and one workspace (docs/architecture/57 section 4). The code is single-use, short-lived and stored hashed; pressing Start only creates a
 * PENDING link; it becomes active when the person approves the device inside Anker, so a code shared by mistake is not enough.
 */
export const CODE_TTL_MIN = 10, IDLE_SUSPEND_DAYS = 90
const sha = (s: string) => createHash("sha256").update(s).digest("hex")

export interface LinkRow { bot_id: string; id: string; user_id: string; org_id: string; telegram_user_id: string; chat_id: string; telegram_username: string | null; mode: "write" | "read"; status: "pending" | "active" | "suspended" | "revoked"; anker_chat_id: string | null; linked_at: string; confirmed_in_app_at: string | null; last_seen_at: string | null }

export async function createLinkCode(userId: string, orgId: string, botId = "platform"): Promise<{ code: string; expiresAt: string }> {
  const code = randomBytes(18).toString("base64url")            // 24 characters, within Telegram's 64 for a start parameter
  const [r] = (await sql`INSERT INTO telegram_link_codes (code_hash, user_id, org_id, bot_id, expires_at) VALUES (${sha(code)}, ${userId}, ${orgId}, ${botId}, now() + make_interval(mins => ${CODE_TTL_MIN})) RETURNING expires_at`) as any[]
  return { code, expiresAt: new Date(r.expires_at).toISOString() }
}

export type StartResult = { ok: true; link: LinkRow } | { ok: false; reason: "invalid" | "expired" | "used" | "already_linked" }

/** The person pressed Start with a code: records a pending link for that Telegram account. The code is consumed exactly once. */
export async function consumeLinkCode(code: string, tg: { userId: number; chatId: number; username?: string | null }, mode: "write" | "read" = "read", botId = "platform"): Promise<StartResult> {
  if (!/^[\w-]{16,64}$/.test(code)) return { ok: false, reason: "invalid" }
  const [c] = (await sql`SELECT code_hash, user_id, org_id, bot_id, expires_at, used_at FROM telegram_link_codes WHERE code_hash = ${sha(code)}`) as any[]
  if (!c || c.bot_id !== botId) return { ok: false, reason: "invalid" }       // a code works only on the bot it was made for
  if (c.used_at) return { ok: false, reason: "used" }
  if (new Date(c.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" }
  const [live] = (await sql`SELECT id FROM telegram_links WHERE bot_id = ${botId} AND telegram_user_id = ${tg.userId} AND status IN ('pending', 'active', 'suspended')`) as any[]
  if (live) return { ok: false, reason: "already_linked" }
  const [claimed] = (await sql`UPDATE telegram_link_codes SET used_at = now() WHERE code_hash = ${sha(code)} AND used_at IS NULL RETURNING code_hash`) as any[]
  if (!claimed) return { ok: false, reason: "used" }                    // someone else used it a moment ago
  const id = randomUUID()
  const [row] = (await sql`INSERT INTO telegram_links (id, user_id, org_id, bot_id, telegram_user_id, chat_id, telegram_username, mode, status) VALUES (${id}, ${c.user_id}, ${c.org_id}, ${botId}, ${tg.userId}, ${tg.chatId}, ${tg.username ?? null}, ${mode}, 'pending') RETURNING *`) as any[]
  return { ok: true, link: row }
}

export async function linkByTelegramUser(telegramUserId: number, botId = "platform"): Promise<LinkRow | null> {
  const [r] = (await sql`SELECT * FROM telegram_links WHERE bot_id = ${botId} AND telegram_user_id = ${telegramUserId} AND status IN ('pending', 'active', 'suspended') ORDER BY created_at DESC LIMIT 1`) as any[]
  return r ?? null
}

/** The person approves a pending device inside Anker. Only the user the code was made for can approve it. */
export async function confirmLink(linkId: string, userId: string): Promise<LinkRow | null> {
  const [r] = (await sql`UPDATE telegram_links SET status = 'active', confirmed_in_app_at = now(), last_seen_at = now() WHERE id = ${linkId} AND user_id = ${userId} AND status = 'pending' RETURNING *`) as any[]
  return r ?? null
}

export async function revokeLink(linkId: string, by: string, ownerOrUser: { userId: string; orgId?: string | null; isOwnerOrAdmin?: boolean }): Promise<LinkRow | null> {
  const [r] = (await sql`UPDATE telegram_links SET status = 'revoked', revoked_at = now(), revoked_by = ${by}
    WHERE id = ${linkId} AND status <> 'revoked' AND (user_id = ${ownerOrUser.userId} OR (${!!ownerOrUser.isOwnerOrAdmin} AND org_id = ${ownerOrUser.orgId ?? ""})) RETURNING *`) as any[]
  if (r) await sql`UPDATE telegram_updates SET status = 'dropped', payload_enc = NULL, finished_at = now() WHERE link_id = ${linkId} AND status IN ('queued', 'running')`
  return r ?? null
}

export async function revokeByTelegramUser(telegramUserId: number, botId = "platform"): Promise<LinkRow | null> {
  const [r] = (await sql`UPDATE telegram_links SET status = 'revoked', revoked_at = now(), revoked_by = 'telegram' WHERE bot_id = ${botId} AND telegram_user_id = ${telegramUserId} AND status IN ('pending', 'active', 'suspended') RETURNING *`) as any[]
  if (r) await sql`UPDATE telegram_updates SET status = 'dropped', payload_enc = NULL, finished_at = now() WHERE link_id = ${r.id} AND status IN ('queued', 'running')`
  return r ?? null
}

export async function listLinks(userId: string, orgId: string, all = false): Promise<LinkRow[]> {
  return (all
    ? await sql`SELECT * FROM telegram_links WHERE org_id = ${orgId} AND status <> 'revoked' ORDER BY created_at DESC`
    : await sql`SELECT * FROM telegram_links WHERE user_id = ${userId} AND org_id = ${orgId} AND status <> 'revoked' ORDER BY created_at DESC`) as any[]
}

/** Records activity and suspends a link idle for 90 days (it must be approved again in Anker). Returns the link's current state. */
export async function touchLink(link: LinkRow): Promise<"active" | "suspended"> {
  const idle = link.last_seen_at ? Date.now() - new Date(link.last_seen_at).getTime() > IDLE_SUSPEND_DAYS * 86_400_000 : false
  if (idle) { await sql`UPDATE telegram_links SET status = 'suspended' WHERE id = ${link.id}`; return "suspended" }
  await sql`UPDATE telegram_links SET last_seen_at = now() WHERE id = ${link.id}`
  return "active"
}

/** An owner or admin re-approves a suspended device, or the person does it themselves. */
export async function reactivateLink(linkId: string, userId: string): Promise<LinkRow | null> {
  const [r] = (await sql`UPDATE telegram_links SET status = 'active', confirmed_in_app_at = now(), last_seen_at = now() WHERE id = ${linkId} AND user_id = ${userId} AND status = 'suspended' RETURNING *`) as any[]
  return r ?? null
}

export interface Prefs { approvals: boolean; replies: boolean; deadlines: boolean; voiceReplies: boolean; dailyBrief: boolean }
/** Switches a device between read-only and "may propose changes". Only the person who owns the device; the person must be able to write in the workspace (checked by the caller). */
export async function setMode(linkId: string, userId: string, mode: "read" | "write"): Promise<LinkRow | null> {
  const [r] = (await sql`UPDATE telegram_links SET mode = ${mode} WHERE id = ${linkId} AND user_id = ${userId} AND status = 'active' RETURNING *`) as any[]
  return r ?? null
}
/** Notification and reply preferences for one device. The watermarks start now, so turning a switch on never floods the chat with old items. */
export async function setPrefs(linkId: string, userId: string, orgId: string, p: Prefs): Promise<boolean> {
  const [l] = (await sql`SELECT id FROM telegram_links WHERE id = ${linkId} AND user_id = ${userId} AND org_id = ${orgId} AND status = 'active'`) as any[]
  if (!l) return false
  await sql`INSERT INTO telegram_prefs (link_id, org_id, approvals, replies, deadlines, voice_replies, daily_brief) VALUES (${linkId}, ${orgId}, ${p.approvals}, ${p.replies}, ${p.deadlines}, ${!!p.voiceReplies}, ${!!p.dailyBrief})
    ON CONFLICT (link_id) DO UPDATE SET approvals = EXCLUDED.approvals, replies = EXCLUDED.replies, deadlines = EXCLUDED.deadlines, voice_replies = EXCLUDED.voice_replies, daily_brief = EXCLUDED.daily_brief, updated_at = now(),
      last_approvals_at = CASE WHEN telegram_prefs.approvals THEN telegram_prefs.last_approvals_at ELSE now() END,
      last_replies_at = CASE WHEN telegram_prefs.replies THEN telegram_prefs.last_replies_at ELSE now() END`
  return true
}
export async function getPrefs(linkIds: string[]): Promise<Record<string, Prefs>> {
  if (!linkIds.length) return {}
  const rows = (await sql`SELECT link_id, approvals, replies, deadlines, voice_replies, daily_brief FROM telegram_prefs WHERE link_id = ANY(${linkIds}::text[])`) as any[]
  return Object.fromEntries(rows.map((r) => [r.link_id, { approvals: !!r.approvals, replies: !!r.replies, deadlines: !!r.deadlines, voiceReplies: !!r.voice_replies, dailyBrief: !!r.daily_brief }]))
}
