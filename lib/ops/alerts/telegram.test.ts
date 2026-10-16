import { describe, it, expect } from "vitest"
import { telegramConfig, telegramConfigs, telegramChats, telegramText, sendTelegram } from "./telegram"

const TOKEN = "1234567890:AAH-abcdefghijklmnopqrstuvwxyz012345"
describe("telegramConfig", () => {
  it("needs both a well-formed token and a chat id; anything else leaves the channel off", () => {
    expect(telegramConfig({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: "123456789" })).toEqual({ token: TOKEN, chatId: "123456789" })
    expect(telegramConfig({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: "-1001234567890" })?.chatId).toBe("-1001234567890")
    expect(telegramConfig({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: "@anker_alerts" })?.chatId).toBe("@anker_alerts")
    for (const env of [{}, { TELEGRAM_BOT_TOKEN: TOKEN }, { TELEGRAM_CHAT_ID: "123456789" }, { TELEGRAM_BOT_TOKEN: "not-a-token", TELEGRAM_CHAT_ID: "123456789" }, { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: "me" }]) expect(telegramConfig(env)).toBeNull()
  })
})
describe("more than one chat", () => {
  const base = { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: "123456789" }
  it("reads TELEGRAM_CHAT_ID and TELEGRAM_CHAT_ID_2 to _9, ignoring repeats and malformed ids", () => {
    expect(telegramChats({ ...base, TELEGRAM_CHAT_ID_2: "987654321", TELEGRAM_CHAT_ID_3: "123456789", TELEGRAM_CHAT_ID_4: "nope", TELEGRAM_CHAT_ID_5: " -1001234567890 " })).toEqual(["123456789", "987654321", "-1001234567890"])
    expect(telegramChats({})).toEqual([])
  })
  it("one config per chat with the same bot, none without a valid token, and the single-chat form still works", () => {
    expect(telegramConfigs({ ...base, TELEGRAM_CHAT_ID_2: "987654321" }).map((c) => c.chatId)).toEqual(["123456789", "987654321"])
    expect(telegramConfigs({ TELEGRAM_CHAT_ID: "123456789" })).toEqual([])
    expect(telegramConfigs({ ...base, TELEGRAM_BOT_TOKEN: "bad" })).toEqual([])
    expect(telegramConfig({ ...base, TELEGRAM_CHAT_ID_2: "987654321" })?.chatId).toBe("123456789")
    expect(telegramConfig({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID_2: "987654321" })?.chatId).toBe("987654321")
  })
})
describe("telegramText", () => {
  const body = ["Stripe billing is down: no webhook secret", "", "Since: 2026-10-16 13:00 UTC", "Evidence:", "  check: Stripe billing", "", "What it means: x", "Check: y", "Fix: Create the webhook and set STRIPE_WEBHOOK_SECRET.", "", "Incident: https://sail.example/alerts#incident-3"].join("\n")
  it("is the subject, the summary, the fix and the link, without the evidence block", () => {
    const t = telegramText("[Anker SEV2] dependency_down: Stripe billing", body)
    expect(t).toContain("[Anker SEV2] dependency_down: Stripe billing"); expect(t).toContain("Stripe billing is down"); expect(t).toContain("Fix: Create the webhook"); expect(t).toContain("Incident: https://sail.example")
    expect(t).not.toContain("Evidence:"); expect(t).not.toContain("What it means")
  })
  it("a resolved message is short and has no fix", () => {
    expect(telegramText("[Anker resolved] x: y", "This problem has cleared.\n\nS")).toBe("[Anker resolved] x: y\n\nThis problem has cleared.")
  })
  it("never exceeds Telegram's limit", () => { expect(telegramText("s", "a".repeat(9000)).length).toBeLessThanOrEqual(4000) })
})
describe("sendTelegram", () => {
  const cfg = { token: TOKEN, chatId: "123456789" }
  it("posts the chat id and the text to the bot's sendMessage and succeeds on 200", async () => {
    let seen: any
    await sendTelegram(cfg, "hello", (async (url: string, init: any) => { seen = { url, body: JSON.parse(init.body), method: init.method }; return new Response("{\"ok\":true}", { status: 200 }) }) as any)
    expect(seen.url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`); expect(seen.method).toBe("POST"); expect(seen.body).toMatchObject({ chat_id: "123456789", text: "hello", disable_web_page_preview: true })
  })
  it("reports Telegram's reason on a refusal, and the token is never in the error", async () => {
    const err = await sendTelegram(cfg, "x", (async () => new Response(JSON.stringify({ ok: false, description: `Unauthorized for ${TOKEN}` }), { status: 401 })) as any).then(() => null, (e) => e as Error)
    expect(err!.message).toContain("telegram refused (401)"); expect(err!.message).not.toContain(TOKEN)
  })
  it("a network failure is an error without the token", async () => {
    const err = await sendTelegram(cfg, "x", (async () => { throw new Error(`connect failed to https://api.telegram.org/bot${TOKEN}/sendMessage`) }) as any).then(() => null, (e) => e as Error)
    expect(err!.message).toContain("telegram unreachable"); expect(err!.message).not.toContain(TOKEN)
  })
})
