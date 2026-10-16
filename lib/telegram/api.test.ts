import { describe, it, expect } from "vitest"
import { productBot, secretOk, setWebhook, sendMessage, getMe, TelegramError } from "./api"

const TOKEN = "8615616511:AAFX1VFIA4eoTmIKAr7Y5Evap_FZncGSjak"
const env = { TELEGRAM_PRODUCT_BOT_TOKEN: TOKEN, SECRET_KEY: "platform-secret" }
describe("productBot", () => {
  it("needs a well-formed token and the platform secret; the webhook secret is derived from it, stable and hex", () => {
    const b = productBot(env)!
    expect(b.token).toBe(TOKEN); expect(b.secret).toMatch(/^[0-9a-f]{64}$/); expect(productBot(env)!.secret).toBe(b.secret)
    expect(productBot({ ...env, SECRET_KEY: "other" })!.secret).not.toBe(b.secret)
    for (const bad of [{}, { SECRET_KEY: "x" }, { TELEGRAM_PRODUCT_BOT_TOKEN: TOKEN }, { ...env, TELEGRAM_PRODUCT_BOT_TOKEN: "nope" }]) expect(productBot(bad)).toBeNull()
  })
  it("never reads the operator alert bot's token", () => {
    expect(productBot({ TELEGRAM_BOT_TOKEN: TOKEN, SECRET_KEY: "x" })).toBeNull()
  })
})
describe("secretOk", () => {
  const b = productBot(env)!
  it("accepts exactly the derived secret", () => {
    expect(secretOk(b.secret, b)).toBe(true)
    for (const bad of [null, undefined, "", b.secret.slice(1), b.secret + "0", b.secret.replace(/.$/, "x"), "x".repeat(64)]) expect(secretOk(bad as any, b)).toBe(false)
    expect(secretOk(b.secret, null)).toBe(false)
  })
})
describe("the client", () => {
  const b = productBot(env)!
  it("registers the webhook with the secret token and the update kinds it needs", async () => {
    let seen: any
    await setWebhook(b, "https://www.an-ker.de/api/telegram/webhook", (async (url: string, init: any) => { seen = { url, body: JSON.parse(init.body) }; return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 }) }) as any)
    expect(seen.url).toBe(`https://api.telegram.org/bot${TOKEN}/setWebhook`)
    expect(seen.body).toMatchObject({ url: "https://www.an-ker.de/api/telegram/webhook", secret_token: b.secret, drop_pending_updates: false }); expect(seen.body.allowed_updates).toEqual(["message", "callback_query", "my_chat_member"])
  })
  it("sends HTML with previews off", async () => {
    let body: any
    await sendMessage(b, 42, "<b>hi</b>", (async (_u: string, init: any) => { body = JSON.parse(init.body); return new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }), { status: 200 }) }) as any)
    expect(body).toMatchObject({ chat_id: 42, text: "<b>hi</b>", parse_mode: "HTML", disable_web_page_preview: true })
  })
  it("a refusal and a network failure are TelegramErrors that never contain the token", async () => {
    const e1 = await getMe(b, (async () => new Response(JSON.stringify({ ok: false, description: `Unauthorized ${TOKEN}` }), { status: 401 })) as any).then(() => null, (e) => e)
    expect(e1).toBeInstanceOf(TelegramError); expect(e1.status).toBe(401); expect(e1.message).not.toContain(TOKEN)
    const e2 = await getMe(b, (async () => { throw new Error(`failed https://api.telegram.org/bot${TOKEN}/getMe`) }) as any).then(() => null, (e) => e)
    expect(e2.message).toContain("unreachable"); expect(e2.message).not.toContain(TOKEN)
  })
})
