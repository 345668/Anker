import "server-only"
import { randomBytes } from "node:crypto"
import { sql } from "@/lib/db"
import { decryptSecret, encryptSecret } from "@/lib/db/secrets"
import * as bot from "./api"
import { createNotification } from "@/lib/notifications/store"

/**
 * A workspace's own Telegram bot (docs/architecture/57 section 19). The token is saved encrypted under the workspace; the webhook is registered by the app itself.
 * The token is never returned, logged or put in an error.
 */
export interface OwnBot { id: string; orgId: string; /** null for the workspace bot, the member's id for a personal bot */ userId: string | null; username: string; botUserId: string; createdAt: string }
export class BotError extends Error { constructor(message: string, readonly status = 400) { super(message); this.name = "BotError" } }

const appUrl = () => (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.an-ker.de").replace(/\/$/, "")
export const webhookUrlFor = (id: string) => `${appUrl()}/api/telegram/webhook/${id}`

const view = (r: any): OwnBot => ({ id: String(r.id), orgId: String(r.org_id), userId: r.user_id ? String(r.user_id) : null, username: String(r.username), botUserId: String(r.bot_user_id), createdAt: new Date(r.created_at).toISOString() })

const COLS = "id, org_id, user_id, bot_user_id, username, created_at"
/** The workspace bot (shared by its members), without its token. */
export async function ownBotOf(orgId: string): Promise<OwnBot | null> {
  const [r] = (await sql`SELECT id, org_id, user_id, bot_user_id, username, created_at FROM telegram_bots WHERE org_id = ${orgId} AND user_id IS NULL`) as any[]
  return r ? view(r) : null
}
/** One member's personal bot in a workspace. */
export async function personalBotOf(orgId: string, userId: string): Promise<OwnBot | null> {
  const [r] = (await sql`SELECT id, org_id, user_id, bot_user_id, username, created_at FROM telegram_bots WHERE org_id = ${orgId} AND user_id = ${userId}`) as any[]
  return r ? view(r) : null
}
/** Every bot of a workspace, for owners and admins. */
export async function botsOfOrg(orgId: string): Promise<OwnBot[]> {
  return ((await sql`SELECT id, org_id, user_id, bot_user_id, username, created_at FROM telegram_bots WHERE org_id = ${orgId} ORDER BY created_at`) as any[]).map(view)
}

/** A bot ready to call Telegram with: the shared platform bot, or a workspace's own (its token decrypted for this call only). Null when it is not there. */
export async function loadBot(id: string): Promise<{ bot: bot.ProductBot; orgId: string | null; username: string | null } | null> {
  if (id === "platform") { const b = bot.productBot(); return b ? { bot: b, orgId: null, username: null } : null }
  const [r] = (await sql`SELECT org_id, username, token_enc FROM telegram_bots WHERE id = ${id}`) as any[]
  if (!r) return null
  const token = decryptSecret(r.token_enc)
  const b = token ? bot.makeBot(token, id) : null
  return b ? { bot: b, orgId: String(r.org_id), username: String(r.username) } : null
}

/** Which bot a member talks through: their personal bot, else the workspace bot, else the shared bot if that is set up (docs/architecture/57 section 20). */
export async function botForUser(orgId: string, userId: string): Promise<{ bot: bot.ProductBot; kind: "personal" | "workspace" | "shared"; username: string | null } | null> {
  for (const [kind, b] of [["personal", await personalBotOf(orgId, userId)], ["workspace", await ownBotOf(orgId)]] as const) {
    if (!b) continue
    const l = await loadBot(b.id); if (l) return { bot: l.bot, kind, username: b.username }
  }
  const shared = bot.productBot()
  return shared ? { bot: shared, kind: "shared", username: null } : null
}

/** Ids of every workspace bot, for the sweep and the notifier. */
export async function ownBotIds(): Promise<string[]> {
  return ((await sql`SELECT id FROM telegram_bots`) as any[]).map((r) => String(r.id))
}

/**
 * Connects a bot to a workspace: checks the token with Telegram, saves it encrypted, registers the webhook. Nothing stays behind if a step fails.
 * Refuses a bot that is already connected anywhere, and the shared platform bot.
 */
export async function connectBot(orgId: string, userId: string, rawToken: string, f?: typeof fetch, scope: "workspace" | "personal" = "workspace"): Promise<OwnBot> {
  const token = String(rawToken ?? "").trim()
  if (!bot.TOKEN_SHAPE.test(token)) throw new BotError("That does not look like a bot token. BotFather gives it as numbers, a colon, then letters and digits.")
  if (!process.env.SECRET_KEY) throw new BotError("The platform key is not set, so a token cannot be stored safely.", 503)
  if (await (scope === "personal" ? personalBotOf(orgId, userId) : ownBotOf(orgId))) throw new BotError(scope === "personal" ? "You already have a bot of your own here. Disconnect it first to connect another." : "This workspace already has a bot. Disconnect it first to connect another.", 409)
  const id = randomBytes(9).toString("base64url")
  const b = bot.makeBot(token, id)!
  let me: Awaited<ReturnType<typeof bot.getMe>>
  try { me = await bot.getMe(b, f) } catch (e) { throw new BotError((e as { status?: number })?.status === 401 ? "Telegram does not accept this token. Copy it again from BotFather." : "Telegram could not be reached to check the token. Try again in a moment.", 400) }
  if (!me?.username) throw new BotError("Telegram did not say who this bot is. Check the token.")
  const shared = bot.productBot()
  if (shared && shared.token.split(":")[0] === token.split(":")[0]) throw new BotError("This is Anker's own shared bot. Create a new bot of your own in BotFather.")
  try {
    await sql`INSERT INTO telegram_bots (id, org_id, user_id, bot_user_id, username, token_enc, created_by) VALUES (${id}, ${orgId}, ${scope === "personal" ? userId : null}, ${me.id}, ${me.username}, ${encryptSecret(token)}, ${userId})`
  } catch (e) {
    if (/unique|duplicate/i.test(String((e as Error)?.message))) throw new BotError("This bot is already connected to a workspace. Each bot can serve one workspace; create another in BotFather.", 409)
    throw e
  }
  try { await bot.setWebhook(b, webhookUrlFor(id), f) }
  catch (e) {
    await sql`DELETE FROM telegram_bots WHERE id = ${id}`.catch(() => {})
    throw new BotError(`Telegram would not accept the webhook: ${String((e as Error)?.message ?? "unknown error").replace(token, "[token]").slice(0, 160)}`, 502)
  }
  await markTelegramInUse()
  const [r] = (await sql`SELECT id, org_id, user_id, bot_user_id, username, created_at FROM telegram_bots WHERE id = ${id}`) as any[]
  return view(r)
}

/** Removes the webhook, disconnects every device that used this bot, and deletes the token. */
export async function disconnectBot(orgId: string, by: string, target: { botId: string } | { scope: "workspace" } | { scope: "personal"; userId: string }, f?: typeof fetch): Promise<boolean> {
  const own = "botId" in target ? (await botsOfOrg(orgId)).find((b) => b.id === target.botId) ?? null : target.scope === "personal" ? await personalBotOf(orgId, target.userId) : await ownBotOf(orgId)
  if (!own) return false
  const l = await loadBot(own.id)
  if (l) await bot.deleteWebhook(l.bot, f).catch(() => {})
  await sql`UPDATE telegram_links SET status = 'revoked', revoked_at = now(), revoked_by = ${by} WHERE bot_id = ${own.id} AND status <> 'revoked'`
  await sql`UPDATE telegram_updates SET status = 'dropped', payload_enc = NULL, finished_at = now() WHERE bot_id = ${own.id} AND status IN ('queued', 'running')`
  await sql`DELETE FROM telegram_link_codes WHERE bot_id = ${own.id}`
  await sql`DELETE FROM telegram_bots WHERE id = ${own.id}`
  return true
}

/** The webhook status of a workspace's bot, for the page. */
export async function botStatus(own: OwnBot | null): Promise<{ bot: OwnBot; webhookOk: boolean; pending: number; lastError: string | null } | null> {
  if (!own) return null
  const l = await loadBot(own.id); if (!l) return { bot: own, webhookOk: false, pending: 0, lastError: "The saved token could not be read. Disconnect and connect the bot again." }
  try {
    const h = await bot.getWebhookInfo(l.bot)
    return { bot: own, webhookOk: h.url === webhookUrlFor(own.id), pending: h.pending_update_count, lastError: h.last_error_message ?? null }
  } catch { return { bot: own, webhookOk: false, pending: 0, lastError: "Telegram could not be reached." } }
}

/**
 * The public list of services that see customer data says whether Telegram is in use. It becomes true by itself the first time anyone connects a bot or links a phone, so
 * nobody has to remember to switch it (docs/architecture/57 section 22). It is never switched off automatically: an operator decides that.
 */
export async function markTelegramInUse(): Promise<void> {
  await sql`UPDATE ai_subprocessors SET active = true WHERE slug = 'telegram' AND active = false`.catch(() => {})
}

// ───────────── the operator's view (SAIL): supervise and remove, never read ─────────────
export interface ConnectionView {
  botId: string; orgId: string; orgName: string | null; scope: "workspace" | "personal"; ownerEmail: string | null; username: string; connectedAt: string
  devices: { active: number; pending: number; suspended: number }; lastActivity: string | null; failed24h: number
}
/** Every workspace and personal bot, with counts only. No token, no message, no chat id. */
export async function listConnections(): Promise<ConnectionView[]> {
  const bots = (await sql`SELECT b.id, b.org_id, b.user_id, b.username, b.created_at, o.name AS org_name, p.email AS owner_email FROM telegram_bots b
    LEFT JOIN organizations o ON o.id::text = b.org_id LEFT JOIN profiles p ON p.id::text = b.user_id ORDER BY b.created_at DESC`) as any[]
  if (!bots.length) return []
  const ids = bots.map((b) => String(b.id))
  const devs = (await sql`SELECT bot_id, status, count(*)::int AS n, max(last_seen_at) AS seen FROM telegram_links WHERE bot_id = ANY(${ids}::text[]) AND status <> 'revoked' GROUP BY bot_id, status`) as any[]
  const fails = (await sql`SELECT bot_id, count(*)::int AS n FROM telegram_updates WHERE bot_id = ANY(${ids}::text[]) AND status = 'failed' AND finished_at > now() - interval '24 hours' GROUP BY bot_id`) as any[]
  return bots.map((b) => {
    const mine = devs.filter((d) => d.bot_id === b.id), n = (st: string) => Number(mine.find((d) => d.status === st)?.n ?? 0)
    const seen = mine.map((d) => d.seen).filter(Boolean).map((x) => new Date(x).getTime())
    return { botId: String(b.id), orgId: String(b.org_id), orgName: b.org_name ?? null, scope: b.user_id ? "personal" as const : "workspace" as const, ownerEmail: b.owner_email ?? null, username: String(b.username), connectedAt: new Date(b.created_at).toISOString(),
      devices: { active: n("active"), pending: n("pending"), suspended: n("suspended") }, lastActivity: seen.length ? new Date(Math.max(...seen)).toISOString() : null, failed24h: Number(fails.find((f) => f.bot_id === b.id)?.n ?? 0) }
  })
}

export interface OperatorDevice { id: string; orgId: string; orgName: string | null; userEmail: string | null; telegramUsername: string | null; status: string; mode: string; linkedAt: string; lastSeenAt: string | null }
/** The devices on one bot, or on the shared bot ('platform'). Who they belong to, never what they said. */
export async function devicesOnBot(botId: string): Promise<OperatorDevice[]> {
  const rows = (await sql`SELECT l.id, l.org_id, o.name AS org_name, p.email, l.telegram_username, l.status, l.mode, l.linked_at, l.last_seen_at FROM telegram_links l
    LEFT JOIN organizations o ON o.id::text = l.org_id LEFT JOIN profiles p ON p.id::text = l.user_id WHERE l.bot_id = ${botId} AND l.status <> 'revoked' ORDER BY l.linked_at DESC LIMIT 200`) as any[]
  return rows.map((r) => ({ id: String(r.id), orgId: String(r.org_id), orgName: r.org_name ?? null, userEmail: r.email ?? null, telegramUsername: r.telegram_username ?? null, status: r.status, mode: r.mode, linkedAt: new Date(r.linked_at).toISOString(), lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at).toISOString() : null }))
}

const owners = async (orgId: string, userId: string | null): Promise<string[]> =>
  userId ? [userId] : ((await sql`SELECT user_id FROM memberships WHERE org_id::text = ${orgId} AND org_role IN ('workspace_owner', 'admin')`) as any[]).map((r) => String(r.user_id))

/**
 * The operator removes a connection: every phone on it is told, the webhook goes, the devices are disconnected, the token is deleted, and the workspace's owners are told in the app.
 * A reason is required and is shown to the owners. Nothing the customer said is read.
 */
export async function operatorDisconnect(botId: string, reason: string, by: string, f?: typeof fetch): Promise<{ devices: number } | null> {
  const [b] = (await sql`SELECT id, org_id, user_id, username FROM telegram_bots WHERE id = ${botId}`) as any[]
  if (!b) return null
  const devices = (await sql`SELECT chat_id FROM telegram_links WHERE bot_id = ${botId} AND status <> 'revoked'`) as any[]
  const loaded = await loadBot(botId)
  if (loaded) for (const d of devices) await bot.sendMessage(loaded.bot, Number(d.chat_id), "The platform operator removed this Telegram connection. This chat is no longer connected to Anker.", null, f).catch(() => {})
  await disconnectBot(String(b.org_id), by, { botId }, f)
  for (const uid of await owners(String(b.org_id), b.user_id ?? null)) {
    await createNotification({ userId: uid, orgId: String(b.org_id), kind: "telegram_removed", severity: "warning", title: "Your Telegram connection was removed by the platform", body: `The connection through @${b.username} was removed. Reason: ${reason}. You can connect again under Connected channels.`, href: "/dashboard/channels", dedupeKey: `tg-removed:${botId}` }).catch(() => {})
  }
  return { devices: devices.length }
}

/** The operator disconnects one phone (on any bot, including the shared one). */
export async function operatorRevokeLink(linkId: string, reason: string, by: string, f?: typeof fetch): Promise<boolean> {
  const [l] = (await sql`UPDATE telegram_links SET status = 'revoked', revoked_at = now(), revoked_by = ${`operator:${by}`.slice(0, 80)} WHERE id = ${linkId} AND status <> 'revoked' RETURNING id, org_id, user_id, bot_id, chat_id`) as any[]
  if (!l) return false
  await sql`UPDATE telegram_updates SET status = 'dropped', payload_enc = NULL, finished_at = now() WHERE link_id = ${linkId} AND status IN ('queued', 'running')`
  const loaded = await loadBot(String(l.bot_id))
  if (loaded) await bot.sendMessage(loaded.bot, Number(l.chat_id), "The platform operator disconnected this device from Anker.", null, f).catch(() => {})
  await createNotification({ userId: String(l.user_id), orgId: String(l.org_id), kind: "telegram_removed", severity: "info", title: "A Telegram device was disconnected by the platform", body: `Reason: ${reason}. You can connect it again under Connected channels.`, href: "/dashboard/channels" }).catch(() => {})
  return true
}
