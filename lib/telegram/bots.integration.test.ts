/** A workspace's own Telegram bot (docs/architecture/57 section 19): connect, isolation between bots, webhook, disconnect. */
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
const st = vi.hoisted(() => ({ q: null as any, afterFns: [] as Array<() => unknown>, notes: [] as any[] }))
vi.mock("@/lib/db", () => { const f: any = (s: TemplateStringsArray, ...v: unknown[]) => st.q(s.reduce((q, t, i) => q + (i ? `$${i}` : "") + t, ""), v); f.unsafe = (t: string, v: unknown[] = []) => st.q(t, v); return { sql: f } })
vi.mock("@/lib/notifications/store", () => ({ createNotification: async (n: any) => { st.notes.push(n); return { created: true } } }))
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => { st.afterFns.push(fn) } }))
process.env.SECRET_KEY = "own-bot-test-secret"; process.env.TELEGRAM_PRODUCT_BOT_TOKEN = "8615616511:AAFX1VFIA4eoTmIKAr7Y5Evap_FZncGSjak"
import { connectBot, disconnectBot, loadBot, botForUser, ownBotOf, personalBotOf, botsOfOrg, listConnections, devicesOnBot, operatorDisconnect, operatorRevokeLink, markTelegramInUse, BotError, webhookUrlFor } from "./bots"
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
  for (const f of ["2026-10-16i-telegram-channel", "2026-10-16j-telegram-t2", "2026-10-16k-telegram-t3", "2026-10-16l-telegram-t4", "2026-10-16n-telegram-own-bot", "2026-10-16p-telegram-personal-bots"]) await db.exec(readFileSync(`scripts/migrations/${f}.sql`, "utf8"))
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
    const route = await botForUser("o1", "u1"); expect(route).toMatchObject({ kind: "workspace", username: "bot_1111" })
    expect(await botForUser("o2", "u2")).toMatchObject({ kind: "shared" })       // falls back to the shared bot
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
    expect(await disconnectBot("o1", "u1", { scope: "workspace" }, fake())).toBe(true)
    expect(calls.map((c) => c.method)).toContain("deleteWebhook")
    expect(await rows("SELECT * FROM telegram_bots WHERE org_id = 'o1'")).toHaveLength(0)
    expect((await rows("SELECT status FROM telegram_links WHERE bot_id = $1", [a.id]))[0].status).toBe("revoked")
    expect((await rows("SELECT status, payload_enc FROM telegram_updates WHERE bot_id = $1", [a.id]))[0]).toMatchObject({ status: "dropped", payload_enc: null })
    expect((await rows("SELECT status FROM telegram_links WHERE bot_id = $1", [b.id]))[0].status).toBe("pending")
    expect(await loadBot(a.id)).toBeNull(); expect(await disconnectBot("o1", "u1", { scope: "workspace" }, fake())).toBe(false)
  })
})

describe("a member's own bot (docs/architecture/57 section 20)", () => {
  const tgRick = { userId: 11, chatId: 11 }, tgAnna = { userId: 22, chatId: 22 }
  it("a workspace has one workspace bot and one personal bot per member, side by side", async () => {
    await connectBot("o1", "u1", TOKEN_A, fake())                                   // the workspace bot
    const rick = await connectBot("o1", "rick", TOKEN_B, fake(), "personal")
    expect(rick.userId).toBe("rick"); expect((await ownBotOf("o1"))!.userId).toBeNull(); expect((await personalBotOf("o1", "rick"))!.id).toBe(rick.id); expect(await personalBotOf("o1", "anna")).toBeNull()
    await expect(connectBot("o1", "rick", "3333333333:CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC", fake(), "personal")).rejects.toThrow(/already have a bot/)
    const anna = await connectBot("o1", "anna", "3333333333:CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC", fake(), "personal"); expect(anna.userId).toBe("anna")
    expect((await botsOfOrg("o1")).map((b) => b.userId).sort((a, b) => String(a).localeCompare(String(b)))).toEqual([null, "anna", "rick"].sort((a, b) => String(a).localeCompare(String(b))))
  })
  it("a member's route is their own bot, then the workspace's, then the shared one", async () => {
    expect((await botForUser("o1", "rick"))!.kind).toBe("shared")
    const ws = await connectBot("o1", "boss", TOKEN_A, fake()); expect(await botForUser("o1", "rick")).toMatchObject({ kind: "workspace", bot: { id: ws.id } })
    const mine = await connectBot("o1", "rick", TOKEN_B, fake(), "personal"); expect(await botForUser("o1", "rick")).toMatchObject({ kind: "personal", bot: { id: mine.id } })
    expect(await botForUser("o1", "anna")).toMatchObject({ kind: "workspace" })      // a colleague is unaffected
  })
  it("only the owner can link a phone through a personal bot; the workspace bot takes anyone in the workspace", async () => {
    const mine = await connectBot("o1", "rick", TOKEN_A, fake(), "personal"); const ws = await connectBot("o1", "boss", TOKEN_B, fake())
    const annasCode = (await createLinkCode("anna", "o1", mine.id)).code
    expect(await consumeLinkCode(annasCode, tgAnna, "read", mine.id)).toEqual({ ok: false, reason: "invalid" })      // made by Anna, used on Rick's bot
    expect((await consumeLinkCode((await createLinkCode("rick", "o1", mine.id)).code, tgRick, "read", mine.id)).ok).toBe(true)
    expect((await consumeLinkCode((await createLinkCode("anna", "o1", ws.id)).code, tgAnna, "read", ws.id)).ok).toBe(true)
    expect((await linkByTelegramUser(22, ws.id))!.user_id).toBe("anna"); expect(await linkByTelegramUser(22, mine.id)).toBeNull()
  })
  it("a code made for another workspace's bot is refused even with the right bot id", async () => {
    const mine = await connectBot("o1", "rick", TOKEN_A, fake(), "personal")
    const foreign = (await createLinkCode("rick", "o2", mine.id)).code
    expect(await consumeLinkCode(foreign, tgRick, "read", mine.id)).toEqual({ ok: false, reason: "invalid" })
  })
  it("disconnecting one member's bot leaves the workspace bot and the others, and an owner can remove any by id", async () => {
    const ws = await connectBot("o1", "boss", TOKEN_A, fake()); const mine = await connectBot("o1", "rick", TOKEN_B, fake(), "personal")
    await consumeLinkCode((await createLinkCode("rick", "o1", mine.id)).code, tgRick, "read", mine.id)
    expect(await disconnectBot("o1", "rick", { scope: "personal", userId: "rick" }, fake())).toBe(true)
    expect(await personalBotOf("o1", "rick")).toBeNull(); expect(await ownBotOf("o1")).not.toBeNull()
    expect((await rows("SELECT status FROM telegram_links WHERE bot_id = $1", [mine.id]))[0].status).toBe("revoked")
    const anna = await connectBot("o1", "anna", "3333333333:CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC", fake(), "personal")
    expect(await disconnectBot("o1", "boss", { botId: anna.id }, fake())).toBe(true); expect(await disconnectBot("o2", "boss", { botId: ws.id }, fake())).toBe(false)      // not another workspace's bot
  })
})

describe("a member who leaves (docs/architecture/57 section 20)", () => {
  beforeAll(async () => { await db.exec("CREATE TABLE IF NOT EXISTS memberships (id serial PRIMARY KEY, user_id text, org_id text, org_role text)") })
  beforeEach(() => { vi.stubGlobal("fetch", fake()) })      // no real network: the webhook removal goes through the fake Telegram
  afterAll(() => { vi.unstubAllGlobals() })
  beforeEach(async () => { await db.exec("DELETE FROM memberships; INSERT INTO memberships (user_id, org_id, org_role) VALUES ('boss','o1','workspace_owner'), ('rick','o1','member'), ('anna','o1','member')") })
  const link = async (user: string, bot: string, tgId: number) => { const r = await consumeLinkCode((await createLinkCode(user, "o1", bot)).code, { userId: tgId, chatId: tgId }, "read", bot); expect(r.ok).toBe(true) }
  it("their phones are disconnected and their personal bot is removed; colleagues and the workspace bot are untouched", async () => {
    const ws = await connectBot("o1", "boss", TOKEN_A, fake()); const mine = await connectBot("o1", "rick", TOKEN_B, fake(), "personal")
    await link("rick", mine.id, 11); await link("rick", ws.id, 12); await link("anna", ws.id, 22)
    await enqueue({ update_id: 9, message: { message_id: 1, chat: { id: 12, type: "private" }, from: { id: 12 }, text: "x" } } as any, ws.id)
    await db.exec("DELETE FROM memberships WHERE user_id = 'rick'")
    const { purgeFormerMembers } = await import("./membership")
    calls.length = 0
    const r = await purgeFormerMembers(); expect(r).toMatchObject({ members: 1, links: 2, bots: 1 })
    expect((await rows("SELECT user_id, status FROM telegram_links ORDER BY user_id")).map((l) => `${l.user_id}:${l.status}`)).toEqual(["anna:pending", "rick:revoked", "rick:revoked"])
    expect(await personalBotOf("o1", "rick")).toBeNull(); expect(await ownBotOf("o1")).not.toBeNull()
    expect((await rows("SELECT status, payload_enc FROM telegram_updates"))[0]).toMatchObject({ status: "dropped", payload_enc: null })
    expect(calls.filter((c) => c.method === "deleteWebhook").map((c) => c.token)).toEqual([TOKEN_B])      // only the leaver's own bot loses its webhook
  })
  it("a member who is still in the workspace is left alone, and a second pass finds nothing", async () => {
    const mine = await connectBot("o1", "rick", TOKEN_B, fake(), "personal"); await link("rick", mine.id, 11)
    const { purgeFormerMembers, forgetMember, isMember } = await import("./membership")
    expect(await purgeFormerMembers()).toMatchObject({ members: 0 }); expect(await isMember("o1", "rick")).toBe(true); expect(await isMember("o2", "rick")).toBe(false)
    expect(await forgetMember("o1", "rick")).toEqual({ links: 1, bot: true }); expect(await purgeFormerMembers()).toMatchObject({ members: 0 })
  })
})

describe("the operator's supervision (docs/architecture/57 section 22)", () => {
  beforeAll(async () => { await db.exec("CREATE TABLE IF NOT EXISTS profiles (id text PRIMARY KEY, email text); CREATE TABLE IF NOT EXISTS memberships (id serial PRIMARY KEY, user_id text, org_id text, org_role text); INSERT INTO organizations VALUES ('o1','Acme Fund') ON CONFLICT DO NOTHING; INSERT INTO profiles VALUES ('rick','rick@acme.test'), ('boss','boss@acme.test') ON CONFLICT DO NOTHING") })
  beforeEach(async () => { st.notes.length = 0; await db.exec("DELETE FROM memberships; INSERT INTO memberships (user_id, org_id, org_role) VALUES ('boss','o1','workspace_owner'), ('rick','o1','member'); UPDATE ai_subprocessors SET active = false") ; vi.stubGlobal("fetch", fake()) })
  afterAll(() => { vi.unstubAllGlobals() })
  const tg = { userId: 11, chatId: 11 }
  const link = async (user: string, bot: string, tgId: number, confirm = true) => { const r = await consumeLinkCode((await createLinkCode(user, "o1", bot)).code, { userId: tgId, chatId: tgId, username: `u${tgId}` }, "read", bot); expect(r.ok).toBe(true); if (confirm && r.ok) await db.query("UPDATE telegram_links SET status = 'active', last_seen_at = now() WHERE id = $1", [r.link.id]) }

  it("lists every workspace and personal bot with owner, device counts and recent failures, and nothing secret", async () => {
    const ws = await connectBot("o1", "boss", TOKEN_A, fake()); const mine = await connectBot("o1", "rick", TOKEN_B, fake(), "personal")
    await link("boss", ws.id, 1); await link("boss", ws.id, 2, false); await link("rick", mine.id, 3)
    await db.query("INSERT INTO telegram_updates (bot_id, update_id, status, finished_at, payload_enc) VALUES ($1, 1, 'failed', now(), NULL)", [ws.id])
    const list = await listConnections(); const w = list.find((c) => c.botId === ws.id)!, p = list.find((c) => c.botId === mine.id)!
    expect(w).toMatchObject({ scope: "workspace", orgName: "Acme Fund", ownerEmail: null, username: "bot_1111", devices: { active: 1, pending: 1, suspended: 0 }, failed24h: 1 }); expect(p).toMatchObject({ scope: "personal", ownerEmail: "rick@acme.test", devices: { active: 1 } })
    const raw = JSON.stringify(list); for (const secret of [TOKEN_A, TOKEN_B, "token_enc", "chat_id"]) expect(raw).not.toContain(secret)
    const devs = await devicesOnBot(ws.id); expect(devs).toHaveLength(2); expect(devs[0]).toMatchObject({ orgName: "Acme Fund" }); expect(JSON.stringify(devs)).not.toMatch(/chat_id|chatId/)
  })
  it("removing a connection tells every phone, removes the webhook, disconnects the devices, deletes the token and tells the owners with the reason", async () => {
    const mine = await connectBot("o1", "rick", TOKEN_A, fake(), "personal"); await link("rick", mine.id, 11); await link("rick", mine.id, 12)
    calls.length = 0
    expect(await operatorDisconnect(mine.id, "Misuse reported by a customer", "ops@an-ker.de", fake())).toEqual({ devices: 2 })
    expect(calls.filter((c) => c.method === "sendMessage")).toHaveLength(2); expect(calls.find((c) => c.method === "sendMessage")!.body.text).toContain("platform operator removed")
    const order = calls.map((c) => c.method); expect(order.indexOf("sendMessage")).toBeLessThan(order.indexOf("deleteWebhook"))      // told before the token goes
    expect(order).toContain("deleteWebhook"); expect(await personalBotOf("o1", "rick")).toBeNull(); expect((await rows("SELECT status FROM telegram_links WHERE bot_id = $1", [mine.id])).every((l) => l.status === "revoked")).toBe(true)
    expect(st.notes.map((n) => n.userId)).toEqual(["rick"]); expect(st.notes[0]).toMatchObject({ kind: "telegram_removed", href: "/dashboard/channels" }); expect(st.notes[0].body).toContain("Misuse reported by a customer")
    expect(await operatorDisconnect(mine.id, "again please", "ops", fake())).toBeNull()
  })
  it("removing the workspace bot tells the workspace's owners and admins, not every member", async () => {
    const ws = await connectBot("o1", "boss", TOKEN_B, fake()); await link("boss", ws.id, 21)
    await operatorDisconnect(ws.id, "Customer asked support to remove it", "ops", fake()); expect(st.notes.map((n) => n.userId)).toEqual(["boss"])
  })
  it("the operator can disconnect one phone; it is told, queued work is dropped, the owner of the device is notified, and a repeat does nothing", async () => {
    const ws = await connectBot("o1", "boss", TOKEN_A, fake()); await link("boss", ws.id, 31)
    const id = (await rows("SELECT id FROM telegram_links WHERE bot_id = $1", [ws.id]))[0].id
    await db.query("INSERT INTO telegram_updates (bot_id, update_id, link_id, status, payload_enc) VALUES ($1, 77, $2, 'queued', 'x')", [ws.id, id]); calls.length = 0
    expect(await operatorRevokeLink(id, "Lost phone reported", "ops", fake())).toBe(true)
    expect((await rows("SELECT status, revoked_by FROM telegram_links WHERE id = $1", [id]))[0]).toMatchObject({ status: "revoked", revoked_by: "operator:ops" }); expect((await rows("SELECT status, payload_enc FROM telegram_updates WHERE update_id = 77"))[0]).toMatchObject({ status: "dropped", payload_enc: null })
    expect(calls.some((c) => c.method === "sendMessage")).toBe(true); expect(st.notes[0]).toMatchObject({ userId: "boss", kind: "telegram_removed" }); expect(await operatorRevokeLink(id, "again please", "ops", fake())).toBe(false)
  })
  it("the public list marks Telegram in use by itself when a bot is connected or a phone linked, and never switches it off", async () => {
    await db.exec("INSERT INTO ai_subprocessors (slug, role, purpose, active, public) VALUES ('telegram', 'messaging', 'x', false, true) ON CONFLICT (slug) DO UPDATE SET active = false")
    await connectBot("o1", "boss", TOKEN_A, fake()); expect((await rows("SELECT active FROM ai_subprocessors WHERE slug = 'telegram'"))[0].active).toBe(true)
    await db.exec("UPDATE ai_subprocessors SET active = false WHERE slug = 'telegram'"); await link("boss", "platform", 41, false); expect((await rows("SELECT active FROM ai_subprocessors WHERE slug = 'telegram'"))[0].active).toBe(true)
    await markTelegramInUse(); expect((await rows("SELECT active FROM ai_subprocessors WHERE slug = 'telegram'"))[0].active).toBe(true)
  })
})
