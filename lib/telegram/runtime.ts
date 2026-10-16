import "server-only"
import { sql } from "@/lib/db"
import { decryptSecret, encryptSecret } from "@/lib/db/secrets"
import { isFlagOn, getEffective } from "@/lib/entitlements"
import { presetFor } from "@/lib/ai/data-policy"
import { resolveAiPrincipal } from "@/lib/assistant/principal"
import { withAiContext } from "@/lib/assistant/context"
import { runAssistant } from "@/lib/assistant/agent"
import { readRouterConfig } from "@/lib/ai/runtime-config"
import { maxRunCostFor } from "@/lib/ai/model-router"
import * as bot from "./api"
import { handleUpdate, ensureChat, type Api, type Deps, type TgUpdate } from "./handler"
import { getMe } from "./api"
import type { LinkRow } from "./links"

/** The real dependencies of the channel: the Bot API, the workspace gate, and the assistant itself (docs/architecture/57). */
const appUrl = () => (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.an-ker.de").replace(/\/$/, "")
export const RUN_BUDGET_MS = 240_000

export function realApi(b: bot.ProductBot): Api {
  return { sendMessage: (c, h) => bot.sendMessage(b, c, h), sendChatAction: (c) => bot.sendChatAction(b, c), leaveChat: (c) => bot.leaveChat(b, c) }
}

/** Whether this workspace may use the channel, in words. Null means yes. The data policy comes first: Telegram is an external processor. */
export async function gate(link: Pick<LinkRow, "org_id">): Promise<string | null> {
  if (!(await isFlagOn("telegram_channel", link.org_id))) return "Telegram access is not switched on for your workspace yet."
  const eff = await getEffective(link.org_id)
  if (!eff.features.channel_telegram) return "Your plan does not include the Telegram channel."
  if (eff.state === "paused" || eff.state === "offboarding") return "Your workspace is paused, so I can't answer right now."
  if ((await presetFor(link.org_id)) !== "standard") return "Your workspace's data policy does not allow content to pass through Telegram, so I can't answer here. Use Anker AI in the app."
  return null
}

export async function ask(link: LinkRow, text: string, history: Array<{ role: "user" | "assistant"; content: string }>): Promise<{ answer: string }> {
  const principal = await resolveAiPrincipal(link.user_id, { orgId: link.org_id, readonly: link.mode !== "write" })
  const chatId = await ensureChat(link)
  const ctx = history.length ? `Conversation so far (for context only):\n${history.map((h) => `${h.role === "user" ? "Person" : "Anker"}: ${h.content}`).join("\n")}\n\n` : ""
  const task = `${ctx}The person is writing from their phone on Telegram, so keep the answer short and plain. Their message:\n${text}`
  const cfg = await readRouterConfig().catch(() => null)
  const deadlineAt = Date.now() + RUN_BUDGET_MS
  const result = await withAiContext(principal, () => runAssistant(task, { maxSteps: 6, userId: principal.userId, chatId, surface: "assistant" }), AbortSignal.timeout(RUN_BUDGET_MS), maxRunCostFor("assistant", cfg), deadlineAt)
  if (result.provider === "no-ai") { const e: any = new Error(result.failure?.message ?? "I couldn't reach an AI provider just now. Please try again in a moment."); e.plain = true; throw e }
  return { answer: result.answer }
}

export function realDeps(b: bot.ProductBot): Deps { return { api: realApi(b), gate, ask, appUrl: appUrl() } }

// ───────────── the queue: received updates are stored, acknowledged, then processed ─────────────
const STALE_RUNNING_MS = 5 * 60_000
export const MAX_ATTEMPTS = 3

/** Stores a received update (once: the unique update id makes Telegram's retries harmless). Returns true when it is new. */
export async function enqueue(update: TgUpdate): Promise<boolean> {
  const key = process.env.SECRET_KEY
  if (!key) throw new Error("SECRET_KEY is required to queue a Telegram update")
  const chatId = update.message?.chat.id ?? update.my_chat_member?.chat.id ?? null
  const kind = update.message ? (update.message.text ? "text" : "other") : update.my_chat_member ? "member" : "other"
  const fromId = update.message?.from?.id ?? null
  const [l] = fromId == null ? [] : ((await sql`SELECT id, org_id FROM telegram_links WHERE telegram_user_id = ${fromId} AND status <> 'revoked' ORDER BY created_at DESC LIMIT 1`) as any[])
  const rows = (await sql`INSERT INTO telegram_updates (update_id, link_id, org_id, chat_id, kind, payload_enc) VALUES (${update.update_id}, ${l?.id ?? null}, ${l?.org_id ?? null}, ${chatId}, ${kind}, ${encryptSecret(JSON.stringify(update))}) ON CONFLICT (update_id) DO NOTHING RETURNING update_id`) as any[]
  return rows.length > 0
}

/** Claims an update for processing: not while an earlier update of the same chat is still being worked on, so a chat's messages are answered in order. */
async function claim(updateId: number): Promise<{ payload: TgUpdate; attempts: number } | null> {
  const [r] = (await sql`UPDATE telegram_updates u SET status = 'running', started_at = now(), attempts = attempts + 1
    WHERE u.update_id = ${updateId} AND (u.status = 'queued' OR (u.status = 'running' AND u.started_at < now() - make_interval(secs => ${STALE_RUNNING_MS / 1000})))
      AND u.attempts < ${MAX_ATTEMPTS}
      AND NOT EXISTS (SELECT 1 FROM telegram_updates e WHERE e.chat_id = u.chat_id AND e.update_id < u.update_id AND (e.status = 'queued' OR (e.status = 'running' AND e.started_at > now() - make_interval(secs => ${STALE_RUNNING_MS / 1000}))) AND e.attempts < ${MAX_ATTEMPTS})
    RETURNING payload_enc, attempts`) as any[]
  if (!r?.payload_enc) return null
  const plain = decryptSecret(r.payload_enc)
  if (!plain) return null
  return { payload: JSON.parse(plain) as TgUpdate, attempts: Number(r.attempts) }
}

export async function processUpdate(updateId: number, deps: Deps): Promise<"done" | "failed" | "skipped"> {
  const c = await claim(updateId)
  if (!c) return "skipped"
  try {
    await handleUpdate(c.payload, deps)
    await sql`UPDATE telegram_updates SET status = 'done', finished_at = now(), payload_enc = NULL, error = NULL WHERE update_id = ${updateId}`
    return "done"
  } catch (e) {
    const last = c.attempts >= MAX_ATTEMPTS
    const err = String((e as Error)?.message ?? e).slice(0, 200)
    if (last) await sql`UPDATE telegram_updates SET status = 'failed', error = ${err}, payload_enc = NULL, finished_at = now() WHERE update_id = ${updateId}`.catch(() => {})
    else await sql`UPDATE telegram_updates SET status = 'queued', error = ${err} WHERE update_id = ${updateId}`.catch(() => {})
    return "failed"
  }
}

/** Every update that is waiting: new ones the webhook could not start, or ones left behind by a killed function. Oldest first, one chat at a time (the claim enforces the order). */
export async function sweep(deps: Deps, limit = 10): Promise<{ processed: number; failed: number }> {
  const rows = (await sql`SELECT update_id FROM telegram_updates WHERE attempts < ${MAX_ATTEMPTS} AND (status = 'queued' OR (status = 'running' AND started_at < now() - make_interval(secs => ${STALE_RUNNING_MS / 1000}))) ORDER BY update_id LIMIT ${limit}`) as any[]
  let processed = 0, failed = 0
  for (const r of rows) { const o = await processUpdate(Number(r.update_id), deps); if (o === "done") processed++; else if (o === "failed") failed++ }
  return { processed, failed }
}

let me: { at: number; username: string | null } | null = null
/** The bot's @username for the deep link, read once from Telegram and remembered for ten minutes. */
export async function botUsername(b: bot.ProductBot): Promise<string | null> {
  if (me && Date.now() - me.at < 600_000) return me.username
  try { const r = await getMe(b); me = { at: Date.now(), username: r.username ?? null } } catch { me = { at: Date.now() - 540_000, username: null } }
  return me.username
}
