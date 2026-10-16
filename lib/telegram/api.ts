import { createHmac } from "node:crypto"

/**
 * The Telegram Bot API for the customer channel (docs/architecture/57). This is the PRODUCT bot (TELEGRAM_PRODUCT_BOT_TOKEN), not the operator alert bot of doc 56.
 * The token never appears in an error, a log line or a return value. The webhook secret is derived from the platform secret, so no second secret needs to be entered anywhere.
 */
export interface ProductBot { token: string; secret: string }

export function productBot(env: Record<string, string | undefined> = process.env): ProductBot | null {
  const token = (env.TELEGRAM_PRODUCT_BOT_TOKEN ?? "").trim()
  const key = env.SECRET_KEY
  if (!/^\d{5,}:[\w-]{20,}$/.test(token) || !key) return null
  return { token, secret: createHmac("sha256", key).update("telegram-webhook-v1").digest("hex") }
}

/** True when the request carries the secret Telegram was told to send. Constant-time. */
export function secretOk(presented: string | null | undefined, bot: ProductBot | null): boolean {
  if (!bot || !presented || presented.length !== bot.secret.length) return false
  let d = 0
  for (let i = 0; i < presented.length; i++) d |= presented.charCodeAt(i) ^ bot.secret.charCodeAt(i)
  return d === 0
}

export class TelegramError extends Error { constructor(message: string, readonly status: number | null = null) { super(message); this.name = "TelegramError" } }
type Fetch = typeof fetch

async function call<T = any>(bot: ProductBot, method: string, body: Record<string, unknown> = {}, f: Fetch = fetch, timeoutMs = 10_000): Promise<T> {
  let res: Response
  try {
    res = await f(`https://api.telegram.org/bot${bot.token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) })
  } catch (e) { throw new TelegramError(`telegram unreachable: ${String((e as Error)?.message ?? e).split(bot.token).join("[token]")}`.slice(0, 200)) }
  const json: any = await res.json().catch(() => ({}))
  if (!res.ok || json?.ok === false) throw new TelegramError(`telegram ${method} refused (${res.status})${json?.description ? `: ${String(json.description).split(bot.token).join("[token]")}` : ""}`.slice(0, 200), res.status)
  return json.result as T
}

export const getMe = (bot: ProductBot, f?: Fetch) => call<{ id: number; username?: string; first_name?: string }>(bot, "getMe", {}, f)
export const getWebhookInfo = (bot: ProductBot, f?: Fetch) => call<{ url: string; pending_update_count: number; last_error_date?: number; last_error_message?: string }>(bot, "getWebhookInfo", {}, f)
export const setWebhook = (bot: ProductBot, url: string, f?: Fetch) => call(bot, "setWebhook", { url, secret_token: bot.secret, allowed_updates: ["message", "callback_query", "my_chat_member"], drop_pending_updates: false, max_connections: 10 }, f)
export const deleteWebhook = (bot: ProductBot, f?: Fetch) => call(bot, "deleteWebhook", { drop_pending_updates: false }, f)
export const sendChatAction = (bot: ProductBot, chatId: number, action = "typing", f?: Fetch) => call(bot, "sendChatAction", { chat_id: chatId, action }, f, 5_000).catch(() => {})
export const leaveChat = (bot: ProductBot, chatId: number, f?: Fetch) => call(bot, "leaveChat", { chat_id: chatId }, f).catch(() => {})
/** Inline buttons under a message: `callback_data` comes back as a callback query; `url` opens a page. */
export interface Markup { inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> }
export const sendMessage = (bot: ProductBot, chatId: number, html: string, markup?: Markup | null, f?: Fetch) =>
  call<{ message_id: number }>(bot, "sendMessage", { chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true, ...(markup ? { reply_markup: markup } : {}) }, f)
export const editMessage = (bot: ProductBot, chatId: number, messageId: number, html: string, markup?: Markup | null, f?: Fetch) =>
  call(bot, "editMessageText", { chat_id: chatId, message_id: messageId, text: html, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: markup ?? { inline_keyboard: [] } }, f)
export const answerCallback = (bot: ProductBot, callbackId: string, text?: string, alert = false, f?: Fetch) =>
  call(bot, "answerCallbackQuery", { callback_query_id: callbackId, ...(text ? { text: text.slice(0, 190), show_alert: alert } : {}) }, f, 5_000).catch(() => {})
