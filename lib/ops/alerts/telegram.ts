/**
 * Telegram delivery for alerts (docs/architecture/56, A2). A bot the founder creates with @BotFather posts a short message to one chat. Configuration is two environment variables,
 * TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID; without both the channel is simply off. The token is a secret: it never appears in an error, a log line or an event.
 */
export interface TelegramConfig { token: string; chatId: string }

const CHAT_OK = /^-?\d{3,}$|^@\w{4,}$/
/** Every configured chat: TELEGRAM_CHAT_ID, then TELEGRAM_CHAT_ID_2 to _9. Malformed or repeated ids are ignored. */
export function telegramChats(env: Record<string, string | undefined> = process.env): string[] {
  const ids = [env.TELEGRAM_CHAT_ID, ...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => env[`TELEGRAM_CHAT_ID_${n}`])].map((x) => (x ?? "").trim()).filter((x) => CHAT_OK.test(x))
  return [...new Set(ids)]
}

/** The first configured chat (the original single-chat form). */
export function telegramConfig(env: Record<string, string | undefined> = process.env): TelegramConfig | null {
  const token = (env.TELEGRAM_BOT_TOKEN ?? "").trim(), chats = telegramChats(env)
  return /^\d{5,}:[\w-]{20,}$/.test(token) && chats.length ? { token, chatId: chats[0] } : null
}

/** One config per chat, all with the same bot. */
export function telegramConfigs(env: Record<string, string | undefined> = process.env): TelegramConfig[] {
  const token = (env.TELEGRAM_BOT_TOKEN ?? "").trim()
  return /^\d{5,}:[\w-]{20,}$/.test(token) ? telegramChats(env).map((chatId) => ({ token, chatId })) : []
}

/** A message short enough to read on a lock screen: the subject, the summary, and the first thing to do. */
export function telegramText(subject: string, body: string): string {
  const lines = body.split("\n")
  const summary = lines[0] === "This problem has cleared." ? "This problem has cleared." : lines[0]
  const fix = lines.find((l) => l.startsWith("Fix: "))
  const link = lines.find((l) => l.startsWith("Incident: "))
  return [subject, "", summary, ...(fix ? ["", fix.length > 600 ? fix.slice(0, 597) + "..." : fix] : []), ...(link ? ["", link] : [])].join("\n").slice(0, 4000)
}

const redact = (s: string, token: string) => s.split(token).join("[token]")

export async function sendTelegram(cfg: TelegramConfig, text: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  let res: Response
  try {
    res = await fetchImpl(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ chat_id: cfg.chatId, text, disable_web_page_preview: true }),
    })
  } catch (e) { throw new Error(redact(`telegram unreachable: ${(e as Error)?.message ?? e}`, cfg.token).slice(0, 200)) }
  if (!res.ok) {
    let why = ""
    try { why = String(((await res.json()) as any)?.description ?? "") } catch { /* no body */ }
    throw new Error(redact(`telegram refused (${res.status})${why ? `: ${why}` : ""}`, cfg.token).slice(0, 200))
  }
}
