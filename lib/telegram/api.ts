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

async function call<T = any>(bot: ProductBot, method: string, body: Record<string, unknown> | FormData = {}, f: Fetch = fetch, timeoutMs = 10_000): Promise<T> {
  let res: Response
  try {
    res = await f(`https://api.telegram.org/bot${bot.token}/${method}`, body instanceof FormData
      ? { method: "POST", body, signal: AbortSignal.timeout(timeoutMs) }
      : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) })
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

export const getFile = (bot: ProductBot, fileId: string, f?: Fetch) => call<{ file_id: string; file_size?: number; file_path?: string }>(bot, "getFile", { file_id: fileId }, f)

/** Telegram lets a bot download files up to 20 MB. The size is checked before and while downloading, and the token never appears in an error. */
export const BOT_DOWNLOAD_MAX = 20 * 1024 * 1024
export async function downloadFile(bot: ProductBot, fileId: string, maxBytes = BOT_DOWNLOAD_MAX, f: Fetch = fetch): Promise<Buffer> {
  const info = await getFile(bot, fileId, f)
  if (!info.file_path) throw new TelegramError("telegram gave no file path")
  if ((info.file_size ?? 0) > maxBytes) throw new TelegramError("file too large")
  let res: Response
  try { res = await f(`https://api.telegram.org/file/bot${bot.token}/${info.file_path}`, { signal: AbortSignal.timeout(30_000) }) }
  catch (e) { throw new TelegramError(`telegram download failed: ${String((e as Error)?.message ?? e).split(bot.token).join("[token]")}`.slice(0, 200)) }
  if (!res.ok || !res.body) throw new TelegramError(`telegram download refused (${res.status})`, res.status)
  const reader = res.body.getReader(), chunks: Uint8Array[] = []
  let n = 0
  for (;;) { const { value, done } = await reader.read(); if (done) break; n += value.byteLength; if (n > maxBytes) { await reader.cancel(); throw new TelegramError("file too large") } chunks.push(value) }
  return Buffer.concat(chunks)
}

/** Telegram accepts uploads from a bot up to 50 MB; we send at most 20 MB. MP3 plays as a voice message. */
const upload = (bot: ProductBot, method: string, field: string, chatId: number, bytes: Buffer, filename: string, mime: string, extra: Record<string, string> = {}, f?: Fetch) => {
  const form = new FormData()
  form.set("chat_id", String(chatId))
  for (const [k, v] of Object.entries(extra)) form.set(k, v)
  form.set(field, new Blob([new Uint8Array(bytes)], { type: mime }), filename)
  return call<{ message_id: number }>(bot, method, form, f, 60_000)
}
export const sendVoice = (bot: ProductBot, chatId: number, mp3: Buffer, f?: Fetch) => upload(bot, "sendVoice", "voice", chatId, mp3, "reply.mp3", "audio/mpeg", {}, f)
export const sendDocument = (bot: ProductBot, chatId: number, bytes: Buffer, filename: string, mime: string, caption?: string, f?: Fetch) =>
  upload(bot, "sendDocument", "document", chatId, bytes, filename, mime, caption ? { caption: caption.slice(0, 900) } : {}, f)
/** Deletes up to 100 messages at once; Telegram allows it for messages younger than 48 hours. */
export const deleteMessages = (bot: ProductBot, chatId: number, ids: number[], f?: Fetch) => call(bot, "deleteMessages", { chat_id: chatId, message_ids: ids.slice(0, 100) }, f)
