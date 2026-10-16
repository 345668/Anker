/** A workspace's own Telegram bot (docs/architecture/57 section 19): connect, isolation between bots, webhook, disconnect. */
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
const st = vi.hoisted(() => ({ q: null as any, afterFns: [] as Array<() => unknown> }))
vi.mock("@/lib/db", () => { const f: any = (s: TemplateStringsArray, ...v: unknown[]) => st.q(s.reduce((q, t, i) => q + (i ? `$${i}` : "") + t, ""), v); f.unsafe = (t: string, v: unknown[] = []) => st.q(t, v); return { sql: f } })
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => { st.afterFns.push(fn) } }))
process.env.SECRET_KEY = "own-bot-test-secret"; process.env.TELEGRAM_PRODUCT_BOT_TOKEN = "8615616511:AAFX1VFIA4eoTmIKAr7Y5Evap_FZncGSjak"
import { connectBot, disconnectBot, loadBot, botForOrg, ownBotOf, BotError, webhookUrlFor } from "./bots"
import { createLinkCode, consumeLinkCode, linkByTelegramUser } from "./links"
import { enqueue } from "./runtime"
import { receive } from "./webhook"
import { webhookSecretFor } from "./api"

let db: PGlite
const rows = async (q: string, p: unknown[] = []) => (await db.query(q, p)).rows as any[]
const TOKEN_A = "1111111111:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", TOKEN_B = "2222222222:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
const calls: Array<{ method: string; token: string; body: any }> = []
/** A fake Telegram: getMe answers per token, everything else succeeds. */
const fake = (opts: { bad?: string[]; hookFails?: boolean } = {}): typeof fetch => (async (url: any, init: any) => {
  const m = /bot([^/]+)\/(\w+)/.exec(String(url))!; const token = m[1], method = m[2]
  const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : {}
  calls.push({ method, token, body })
  if (opts.bad?.includes(token)) return new Response(JSON.stringify({ ok: false, description: "Unauthorized" }), { status: 401 })
  if (method === "setWebhook" && opts.hookFails) return new Response(JSON.stringify({ ok: false, description: "bad webhook url" }), { status: 400 })
  if (method === "getMe") return new Response(JSON.stringify({ ok: true, result: { id: Number(token.split(":")[0]), username: `bot_${token.slice(0, 4)}`, is_bot: true } }), { status: 200 })
  return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
}) as any

beforeAll(async () => {
  db = new PGlite()
  st.q = async (q: string, v: unknown[] = []) => (await db.query(q, v)).rows
  await db.exec(`CREATE TABLE organizations (id text PRIMARY KEY, name text);
    CREATE TABLE anker_chats (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, user_id text NOT NULL, scope_key text, title text, model text, messages jsonb NOT NULL DEFAULT '[]', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE ai_subprocessors (slug text PRIMARY KEY, provider text, role text NOT NULL, purpose text, region text DEFAULT 'unknown', region_basis text DEFAULT 'inferred', data_classes text[] DEFAULT '{}', active boolean DEFAULT true, public boolean DEFAULT true, notes text);
    CREATE TABLE platform_flags (key text PRIMARY KEY, enabled boolean DEFAULT false, rollout_pct int DEFAULT 100, description text);
    CREATE TABLE plan_catalog (plan text PRIMARY KEY, features jsonb DEFAULT '{}');`)
  for (const f of ["2026-10-16i-telegram-channel", "2026-10-16j-telegram-t2", "2026-10-16k-telegram-t3", "2026-10-16l-telegram-t4", "2026-10-16n-telegram-own-bot"]) await db.exec(readFileSync(`scripts/migrations/${f}.sql`, "utf8"))
}, 30000)
afterAll(async () => db.close())
beforeEach(async () => { calls.length = 0; st.afterFns.length = 0; await db.exec("DELETE FROM telegram_bots; DELETE FROM telegram_updates; DELETE FROM telegram_links; DELETE FROM telegram_link_codes") })

describe("connecting a bot", () => {
  it("checks the token with Telegram, saves it encrypted, and registers a webhook with the bot's own derived secret", async () => {
    const b = await connectBot("o1", "u1", ` ${TOKEN_A} `, fake())
    expect(b.username).toBe("bot_1111")
    const [row] = await rows("SELECT * FROM telegram_bots WHERE org_id = 'o1'")
    expect(row.token_enc).toBeTruthy(); expect(row.token_enc).not.toContain(TOKEN_A); expect(JSON.stringify(b)).not.toContain(TOKEN_A)
    const hook = calls.find((c) => c.method === "setWebhook")!
    expect(hook.token).toBe(TOKEN_A); expect(hook.body.url).toBe(webhookUrlFor(b.id)); expect(hook.body.url).toContain(`/api/telegram/webhook/${b.id}`)
    expect(hook.body.secret_token).toBe(webhookSecretFor(b.id, "own-bot-test-secret")); expect(hook.body.secret_token).not.toBe(webhookSecretFor("platform", "own-bot-test-secret"))
  })
  it("the saved token is readable only through loadBot, which gives the app a bot to call Telegram with", async () => {
    const b = await connectBot("o1", "u1", TOKEN_A, fake())
    const l = await loadBot(b.id); expect(l!.bot.token).toBe(TOKEN_A); expect(l!.orgId).toBe("o1"); expect(l!.bot.id).toBe(b.id)
    expect(JSON.stringify(await ownBotOf("o1"))).not.toContain(TOKEN_A)
    const route = await botForOrg("o1"); expect(route).toMatchObject({ own: true, username: "bot_1111" })
    expect(await botForOrg("o2")).toMatchObject({ own: false })       // falls back to the shared bot
  })
  it("refuses a malformed token, a token Telegram rejects, and never leaves a row behind", async () => {
    await expect(connectBot("o1", "u1", "nope", fake())).rejects.toBeInstanceOf(BotError)
    await expect(connectBot("o1", "u1", TOKEN_A, fake({ bad: [TOKEN_A] }))).rejects.toThrow(/does not accept/)
    await expect(connectBot("o1", "u1", TOKEN_A, fake({ hookFails: true }))).rejects.toThrow(/webhook/)
    expect(await rows("SELECT * FROM telegram_bots")).toHaveLength(0)
  })
  it("an error never contains the token", async () => {
    try { await connectBot("o1", "u1", TOKEN_A, fake({ hookFails: true })) } catch (e) { expect(String((e as Error).message)).not.toContain(TOKEN_A) }
  })
  it("one bot serves one workspace; a workspace has one bot; the shared platform bot cannot be claimed", async () => {
    await connectBot("o1", "u1", TOKEN_A, fake())
    await expect(connectBot("o2", "u2", TOKEN_A, fake())).rejects.toThrow(/already connected/)
    await expect(connectBot("o1", "u1", TOKEN_B, fake())).rejects.toThrow(/already has a bot/)
    await expect(connectBot("o3", "u3", process.env.TELEGRAM_PRODUCT_BOT_TOKEN!, fake())).rejects.toThrow(/shared bot/)
    expect(calls.filter((c) => c.method === "setWebhook")).toHaveLength(1)      // the refused attempts registered nothing
  })
})

describe("isolation between bots", () => {
  const tg = { userId: 777, chatId: 777, username: "rick" }
  it("a link code works only on the bot it was made for", async () => {
    const a = await connectBot("o1", "u1", TOKEN_A, fake()); const b = await connectBot("o2", "u2", TOKEN_B, fake())
    const { code } = await createLinkCode("u1", "o1", a.id)
    expect(await consumeLinkCode(code, tg, "read", b.id)).toEqual({ ok: false, reason: "invalid" })
    expect(await consumeLinkCode(code, tg, "read", "platform")).toEqual({ ok: false, reason: "invalid" })
    const ok = await consumeLinkCode(code, tg, "read", a.id); expect(ok.ok).toBe(true)
  })
  it("the same Telegram account can be linked once per bot, and each bot sees only its own link", async () => {
    const a = await connectBot("o1", "u1", TOKEN_A, fake()); const b = await connectBot("o2", "u2", TOKEN_B, fake())
    expect((await consumeLinkCode((await createLinkCode("u1", "o1", a.id)).code, tg, "read", a.id)).ok).toBe(true)
    expect((await consumeLinkCode((await createLinkCode("u2", "o2", b.id)).code, tg, "read", b.id)).ok).toBe(true)
    expect((await linkByTelegramUser(777, a.id))!.org_id).toBe("o1"); expect((await linkByTelegramUser(777, b.id))!.org_id).toBe("o2"); expect(await linkByTelegramUser(777)).toBeNull()
    const again = await consumeLinkCode((await createLinkCode("u1", "o1", a.id)).code, tg, "read", a.id); expect(again).toEqual({ ok: false, reason: "already_linked" })
  })
  it("update ids are only unique per bot: the same id on two bots is two updates", async () => {
    const a = await connectBot("o1", "u1", TOKEN_A, fake()); const b = await connectBot("o2", "u2", TOKEN_B, fake())
    const u = { update_id: 5, message: { message_id: 1, chat: { id: 9, type: "private" }, from: { id: 9 }, text: "hi" } } as any
    expect(await enqueue(u, a.id)).toBe(true); expect(await enqueue(u, b.id)).toBe(true); expect(await enqueue(u, a.id)).toBe(false)
    expect((await rows("SELECT bot_id FROM telegram_updates ORDER BY bot_id")).map((r) => r.bot_id).sort()).toEqual([a.id, b.id].sort())
  })
})

describe("the webhook", () => {
  const req = (secret: string | null, body: unknown) => new Request("https://x.test/api/telegram/webhook/x", { method: "POST", headers: { "content-type": "application/json", ...(secret ? { "x-telegram-bot-api-secret-token": secret } : {}) }, body: JSON.stringify(body) }) as any
  it("accepts the bot's own secret and nobody else's, and queues on that bot", async () => {
    const a = await connectBot("o1", "u1", TOKEN_A, fake()); const l = (await loadBot(a.id))!
    expect((await receive(req(null, { update_id: 1 }), l.bot)).status).toBe(401)
    expect((await receive(req(webhookSecretFor("platform", "own-bot-test-secret"), { update_id: 1 }), l.bot)).status).toBe(401)      // the shared bot's secret does not open a workspace bot
    expect((await receive(req(l.bot.secret, { update_id: 1, message: { message_id: 1, chat: { id: 9, type: "private" }, from: { id: 9 }, text: "hi" } }), l.bot)).status).toBe(200)
    expect((await rows("SELECT bot_id FROM telegram_updates"))[0].bot_id).toBe(a.id)
    expect((await receive(req("whatever", { update_id: 2 }), null)).status).toBe(401)      // an unknown or removed bot
  })
})

describe("disconnecting", () => {
  it("removes the webhook, disconnects every device on that bot, deletes the token, and leaves other bots alone", async () => {
    const a = await connectBot("o1", "u1", TOKEN_A, fake()); const b = await connectBot("o2", "u2", TOKEN_B, fake())
    const tgA = { userId: 1, chatId: 1 }, tgB = { userId: 2, chatId: 2 }
    await consumeLinkCode((await createLinkCode("u1", "o1", a.id)).code, tgA, "read", a.id); await consumeLinkCode((await createLinkCode("u2", "o2", b.id)).code, tgB, "read", b.id)
    await enqueue({ update_id: 3, message: { message_id: 1, chat: { id: 1, type: "private" }, from: { id: 1 }, text: "x" } } as any, a.id)
    calls.length = 0
    expect(await disconnectBot("o1", "u1", fake())).toBe(true)
    expect(calls.map((c) => c.method)).toContain("deleteWebhook")
    expect(await rows("SELECT * FROM telegram_bots WHERE org_id = 'o1'")).toHaveLength(0)
    expect((await rows("SELECT status FROM telegram_links WHERE bot_id = $1", [a.id]))[0].status).toBe("revoked")
    expect((await rows("SELECT status, payload_enc FROM telegram_updates WHERE bot_id = $1", [a.id]))[0]).toMatchObject({ status: "dropped", payload_enc: null })
    expect((await rows("SELECT status FROM telegram_links WHERE bot_id = $1", [b.id]))[0].status).toBe("pending")
    expect(await loadBot(a.id)).toBeNull(); expect(await disconnectBot("o1", "u1", fake())).toBe(false)
  })
})
