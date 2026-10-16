/** The Telegram channel against a real Postgres (PGlite) with the real migration: linking, the handler's rules, and the update queue. */
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
const state = vi.hoisted(() => ({ q: null as any }))
vi.mock("@/lib/db", () => { const f: any = (s: TemplateStringsArray, ...v: unknown[]) => state.q(s.reduce((q, t, i) => q + (i ? `$${i}` : "") + t, ""), v); f.unsafe = (t: string, v: unknown[] = []) => state.q(t, v); return { sql: f } })
// The heavy parts of the product are replaced; what is under test is the channel's own logic.
vi.mock("@/lib/entitlements", () => ({ isFlagOn: async () => true, getEffective: async () => ({ features: { channel_telegram: true }, state: "active" }) }))
vi.mock("@/lib/ai/data-policy", () => ({ presetFor: async () => "standard" }))
vi.mock("@/lib/assistant/principal", () => ({ resolveAiPrincipal: async () => ({}) }))
vi.mock("@/lib/assistant/context", () => ({ withAiContext: async (_p: unknown, f: () => unknown) => f() }))
vi.mock("@/lib/assistant/agent", () => ({ runAssistant: async () => ({ provider: "ok", answer: "x" }) }))
vi.mock("@/lib/ai/runtime-config", () => ({ readRouterConfig: async () => null }))
vi.mock("@/lib/ai/model-router", () => ({ maxRunCostFor: () => null }))
process.env.SECRET_KEY = "telegram-test-secret"
import { createLinkCode, consumeLinkCode, confirmLink, revokeLink, revokeByTelegramUser, linkByTelegramUser, listLinks, touchLink, reactivateLink, CODE_TTL_MIN, IDLE_SUSPEND_DAYS } from "./links"
import { handleUpdate, MSG, type Deps, type TgUpdate } from "./handler"
import { enqueue, processUpdate, sweep, MAX_ATTEMPTS } from "./runtime"

let db: PGlite
const rows = async (q: string, p: unknown[] = []) => (await db.query(q, p)).rows as any[]
const TG = 1810594739, CHAT = 1810594739

const sent: Array<{ chat: number; html: string }> = []
const left: number[] = []
const deps = (o: Partial<Deps> = {}): Deps => ({
  api: { sendMessage: async (c, h) => { sent.push({ chat: c, html: h }) }, editMessage: async () => {}, answerCallback: async () => {}, sendChatAction: async () => {}, leaveChat: async (c) => { left.push(c) } },
  gate: async () => null, ask: async () => ({ answer: "Here is your answer." }), newProposals: async () => [], pending: async () => [], decide: async () => { throw new Error("not used") }, today: async () => ({ pending: 0, tasksToday: 0, overdue: 0, replies24h: 0 }), shown: async () => {}, appUrl: "https://app.test", ...o,
})
let uid = 1000
const msg = (text: string | undefined, o: Record<string, unknown> = {}, from = TG, chat = CHAT, type = "private"): TgUpdate => ({ update_id: ++uid, message: { message_id: uid, from: { id: from, username: "rick" }, chat: { id: chat, type }, text, ...o } })
const activeLink = async (mode: "read" | "write" = "read") => {
  const { code } = await createLinkCode("u1", "o1")
  const r = await consumeLinkCode(code, { userId: TG, chatId: CHAT, username: "rick" }, mode)
  if (!r.ok) throw new Error("setup")
  await confirmLink(r.link.id, "u1"); return r.link.id
}

beforeAll(async () => {
  db = new PGlite()
  state.q = async (q: string, v: unknown[] = []) => (await db.query(q, v)).rows
  await db.exec(`CREATE TABLE organizations (id text PRIMARY KEY, name text);
    CREATE TABLE anker_chats (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, user_id text NOT NULL, scope_key text, title text, model text, messages jsonb NOT NULL DEFAULT '[]', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE ai_subprocessors (slug text PRIMARY KEY, provider text, role text NOT NULL, purpose text, region text DEFAULT 'unknown', region_basis text DEFAULT 'inferred', data_classes text[] DEFAULT '{}', active boolean DEFAULT true, public boolean DEFAULT true, notes text);
    CREATE TABLE platform_flags (key text PRIMARY KEY, enabled boolean DEFAULT false, rollout_pct int DEFAULT 100, description text);
    CREATE TABLE plan_catalog (plan text PRIMARY KEY, features jsonb DEFAULT '{}');
    INSERT INTO organizations VALUES ('o1', 'Acme Fund');`)
  await db.exec(readFileSync("scripts/migrations/2026-10-16i-telegram-channel.sql", "utf8"))
}, 30000)
afterAll(async () => db.close())
beforeEach(async () => { sent.length = 0; left.length = 0; await db.exec("DELETE FROM telegram_updates; DELETE FROM telegram_links; DELETE FROM telegram_link_codes; DELETE FROM anker_chats") })

describe("migration", () => {
  it("registers Telegram as a sub-processor that is not in use yet, and ships with the channel off", async () => {
    expect((await rows("SELECT role, active, public FROM ai_subprocessors WHERE slug = 'telegram'"))[0]).toEqual({ role: "messaging", active: false, public: true })
    expect((await rows("SELECT enabled FROM platform_flags WHERE key = 'telegram_channel'"))[0].enabled).toBe(false)
  })
})

describe("link codes", () => {
  it("a code is single-use, stored hashed, valid for ten minutes, and creates a PENDING link", async () => {
    const { code } = await createLinkCode("u1", "o1")
    expect(code).toMatch(/^[\w-]{24}$/); expect(JSON.stringify(await rows("SELECT * FROM telegram_link_codes"))).not.toContain(code); expect(CODE_TTL_MIN).toBe(10)
    const r = await consumeLinkCode(code, { userId: TG, chatId: CHAT, username: "rick" })
    expect(r.ok && r.link).toMatchObject({ user_id: "u1", org_id: "o1", status: "pending", mode: "read", telegram_username: "rick" })
    expect(await consumeLinkCode(code, { userId: 777, chatId: 777 })).toEqual({ ok: false, reason: "used" })
  })
  it("refuses an unknown or malformed code, an expired one, and an account that is already linked", async () => {
    expect(await consumeLinkCode("not-a-real-code-at-all-0", { userId: TG, chatId: CHAT })).toEqual({ ok: false, reason: "invalid" })
    expect(await consumeLinkCode("x", { userId: TG, chatId: CHAT })).toEqual({ ok: false, reason: "invalid" })
    const a = await createLinkCode("u1", "o1"); await db.exec("UPDATE telegram_link_codes SET expires_at = now() - interval '1 minute'")
    expect(await consumeLinkCode(a.code, { userId: TG, chatId: CHAT })).toEqual({ ok: false, reason: "expired" })
    await activeLink()
    const b = await createLinkCode("u2", "o2")
    expect(await consumeLinkCode(b.code, { userId: TG, chatId: CHAT })).toEqual({ ok: false, reason: "already_linked" })
    expect((await rows("SELECT used_at FROM telegram_link_codes WHERE user_id = 'u2'"))[0].used_at).toBeNull()   // a refused attempt does not burn the code
  })
  it("two accounts racing for one code: exactly one wins", async () => {
    const { code } = await createLinkCode("u1", "o1")
    const [a, b] = await Promise.all([consumeLinkCode(code, { userId: 11, chatId: 11 }), consumeLinkCode(code, { userId: 22, chatId: 22 })])
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1)
    expect(Number((await rows("SELECT count(*)::int n FROM telegram_links"))[0].n)).toBe(1)
  })
})

describe("approving, revoking, idle", () => {
  it("only the person the code was made for can approve the device", async () => {
    const { code } = await createLinkCode("u1", "o1"); const r = await consumeLinkCode(code, { userId: TG, chatId: CHAT }); if (!r.ok) throw new Error("x")
    expect(await confirmLink(r.link.id, "someone-else")).toBeNull(); expect((await rows("SELECT status FROM telegram_links"))[0].status).toBe("pending")
    expect(await confirmLink(r.link.id, "u1")).toMatchObject({ status: "active" })
    expect(await confirmLink(r.link.id, "u1")).toBeNull()      // already active
  })
  it("the person or an owner or admin of the workspace can revoke; a stranger cannot; queued work is dropped", async () => {
    const id = await activeLink()
    await enqueue(msg("hello")); expect(Number((await rows("SELECT count(*)::int n FROM telegram_updates WHERE link_id = $1", [id]))[0].n)).toBe(1)
    expect(await revokeLink(id, "x", { userId: "stranger", orgId: "other", isOwnerOrAdmin: true })).toBeNull()
    expect(await revokeLink(id, "x", { userId: "colleague", orgId: "o1", isOwnerOrAdmin: false })).toBeNull()
    expect(await revokeLink(id, "admin", { userId: "colleague", orgId: "o1", isOwnerOrAdmin: true })).toMatchObject({ status: "revoked", revoked_by: "admin" })
    expect((await rows("SELECT status, payload_enc FROM telegram_updates"))[0]).toEqual({ status: "dropped", payload_enc: null })
    expect(await linkByTelegramUser(TG)).toBeNull()
  })
  it("a revoked account can be linked again with a new code", async () => {
    const id = await activeLink(); await revokeLink(id, "u1", { userId: "u1" })
    const { code } = await createLinkCode("u1", "o1"); expect((await consumeLinkCode(code, { userId: TG, chatId: CHAT })).ok).toBe(true)
  })
  it("a link idle for 90 days is suspended and needs approving again; activity updates last-seen", async () => {
    const id = await activeLink()
    const link = (await linkByTelegramUser(TG))!
    expect(await touchLink(link)).toBe("active")
    await db.query(`UPDATE telegram_links SET last_seen_at = now() - interval '${IDLE_SUSPEND_DAYS + 1} days' WHERE id = $1`, [id])
    expect(await touchLink((await linkByTelegramUser(TG))!)).toBe("suspended")
    expect((await rows("SELECT status FROM telegram_links"))[0].status).toBe("suspended")
    expect(await reactivateLink(id, "stranger")).toBeNull(); expect(await reactivateLink(id, "u1")).toMatchObject({ status: "active" })
  })
  it("lists a person's own devices, and every device in the workspace for a manager", async () => {
    await activeLink(); const { code } = await createLinkCode("u2", "o1"); await consumeLinkCode(code, { userId: 55, chatId: 55 })
    expect(await listLinks("u1", "o1")).toHaveLength(1); expect(await listLinks("u1", "o1", true)).toHaveLength(2); expect(await listLinks("u1", "o2", true)).toHaveLength(0)
  })
})

describe("what the bot does with a message", () => {
  it("an unknown account gets one fixed message, and nothing is run", async () => {
    let asked = false
    await handleUpdate(msg("how is my pipeline?"), deps({ ask: async () => { asked = true; return { answer: "x" } } }))
    expect(sent).toEqual([{ chat: CHAT, html: expect.stringContaining("I don't know this Telegram account") }]); expect(asked).toBe(false)
  })
  it("Start with a good code creates a pending link and says to approve in Anker; a bad code says it expired", async () => {
    const { code } = await createLinkCode("u1", "o1")
    await handleUpdate(msg(`/start ${code}`), deps()); expect(sent[0].html).toContain("approve this device"); expect((await rows("SELECT status FROM telegram_links"))[0].status).toBe("pending")
    await handleUpdate(msg("/start AAAAAAAAAAAAAAAAAAAAAAAA", {}, 99, 99), deps()); expect(sent[1].html).toContain("expired or was already used")
  })
  it("a pending device is not served until it is approved in the app", async () => {
    const { code } = await createLinkCode("u1", "o1"); await consumeLinkCode(code, { userId: TG, chatId: CHAT })
    let asked = false
    await handleUpdate(msg("show me my contacts"), deps({ ask: async () => { asked = true; return { answer: "x" } } }))
    expect(sent[0].html).toContain("approve this device"); expect(asked).toBe(false)
  })
  it("an active account's question is answered, and the exchange is kept in the workspace's own chat", async () => {
    const id = await activeLink()
    const asks: any[] = []
    await handleUpdate(msg("who replied today?"), deps({ ask: async (l, t, h) => { asks.push({ t, h, mode: l.mode }); return { answer: "Two people replied: **Katja** and Ben." } } }))
    expect(sent.map((s) => s.html)).toEqual(["Two people replied: <b>Katja</b> and Ben."]); expect(asks[0]).toEqual({ t: "who replied today?", h: [], mode: "read" })
    const chat = (await rows("SELECT c.title, c.scope_key, c.messages FROM anker_chats c JOIN telegram_links l ON l.anker_chat_id = c.id WHERE l.id = $1", [id]))[0]
    expect(chat).toMatchObject({ title: "Telegram", scope_key: "org:o1" }); expect(chat.messages).toEqual([{ role: "user", content: "who replied today?" }, { role: "assistant", content: "Two people replied: **Katja** and Ben." }])
    await handleUpdate(msg("and yesterday?"), deps({ ask: async (_l, _t, h) => { asks.push({ h }); return { answer: "Nobody." } } }))
    expect(asks[1].h).toEqual([{ role: "user", content: "who replied today?" }, { role: "assistant", content: "Two people replied: **Katja** and Ben." }])
  })
  it("a group chat is refused and left; a bot added to a group leaves", async () => {
    await handleUpdate(msg("hello", {}, TG, -100123, "supergroup"), deps()); expect(sent[0].html).toContain("private chat"); expect(left).toEqual([-100123])
    await handleUpdate({ update_id: 1, my_chat_member: { chat: { id: -555, type: "group" } } }, deps()); expect(left).toEqual([-100123, -555])
  })
  it("/unlink disconnects at once, even for a pending device", async () => {
    await activeLink(); await handleUpdate(msg("/unlink"), deps())
    expect(sent[0].html).toContain("Disconnected"); expect(await linkByTelegramUser(TG)).toBeNull()
    await handleUpdate(msg("hello again"), deps()); expect(sent[1].html).toContain("I don't know this Telegram account")
  })
  it("/help and /whoami work for an active account, and voice notes, photos and files are declined for now", async () => {
    await activeLink()
    await handleUpdate(msg("/help"), deps()); expect(sent[0].html).toContain("Approve and Reject")
    await handleUpdate(msg("/whoami"), deps()); expect(sent[1].html).toBe("Connected to Acme Fund in read-only mode.")
    await handleUpdate(msg(undefined, { voice: { file_id: "x" } }), deps()); expect(sent[2].html).toContain("next release")
    await handleUpdate(msg(undefined, { document: { file_id: "x" } }), deps()); expect(sent[3].html).toContain("next release")
  })
  it("a workspace whose gate refuses (flag, plan, data policy) gets the reason and nothing is run", async () => {
    await activeLink(); let asked = false
    await handleUpdate(msg("hi there"), deps({ gate: async () => "Your workspace's data policy does not allow this.", ask: async () => { asked = true; return { answer: "x" } } }))
    expect(sent[0].html).toBe("Your workspace&#39;s data policy does not allow this.".replace("&#39;", "'")); expect(asked).toBe(false)
  })
  it("a failure is one plain sentence; a plain-words error from the assistant is passed on; the raw error never is", async () => {
    await activeLink()
    await handleUpdate(msg("a"), deps({ ask: async () => { throw new Error("ECONNRESET secret-host:5432") } })); expect(sent[0].html).toBe(MSG.failed)
    const plain: any = new Error("Your AI allowance for this month is used up."); plain.plain = true
    await handleUpdate(msg("b"), deps({ ask: async () => { throw plain } })); expect(sent[1].html).toContain("allowance")
    const t = new Error("x"); t.name = "TimeoutError"
    await handleUpdate(msg("c"), deps({ ask: async () => { throw t } })); expect(sent[2].html).toBe(MSG.tooLong)
    expect(JSON.stringify(sent)).not.toContain("secret-host")
  })
  it("a flood from one chat is slowed down, not answered", async () => {
    await activeLink()
    for (let i = 0; i < 10; i++) await db.query("INSERT INTO telegram_updates (update_id, chat_id, status) VALUES ($1, $2, 'done')", [500 + i, CHAT])
    let asked = false
    await handleUpdate(msg("one more"), deps({ ask: async () => { asked = true; return { answer: "x" } } })); expect(sent[0].html).toBe(MSG.slow); expect(asked).toBe(false)
  })
  it("a long answer is sent in parts with a pointer to the app, and the answer is escaped", async () => {
    await activeLink()
    await handleUpdate(msg("long"), deps({ ask: async () => ({ answer: "<script>alert(1)</script> " + ("word ".repeat(600) + "\n\n").repeat(10) }) }))
    expect(sent.length).toBe(4); expect(sent[0].html).toContain("&lt;script&gt;"); expect(sent[3].html).toContain("https://app.test/dashboard/anker-ai")
  })
  it("an edited message, a callback with nothing to act on, or a message with no sender sends nothing", async () => {
    await activeLink()
    await handleUpdate({ update_id: 3, edited_message: { message_id: 1, from: { id: TG }, chat: { id: CHAT, type: "private" }, text: "x" } }, deps())
    await handleUpdate({ update_id: 4, callback_query: { id: "cb", from: { id: TG }, data: "x", message: undefined } }, deps()); await handleUpdate({ update_id: 5, message: { message_id: 1, chat: { id: CHAT, type: "private" }, text: "hi" } }, deps())
    expect(sent).toHaveLength(0)
  })
})

describe("the update queue", () => {
  it("stores an update once (Telegram's retry is harmless), encrypted, and ties it to the link and workspace", async () => {
    await activeLink(); const u = msg("a very private question about LP Müller")
    expect(await enqueue(u)).toBe(true); expect(await enqueue(u)).toBe(false)
    const r = (await rows("SELECT * FROM telegram_updates"))[0]
    expect(r).toMatchObject({ status: "queued", org_id: "o1", kind: "text" }); expect(JSON.stringify(r)).not.toContain("private question"); expect(JSON.stringify(r)).not.toContain("Müller")
  })
  it("processing runs the handler once, marks it done and wipes the stored update", async () => {
    await activeLink(); const u = msg("hello"); await enqueue(u)
    expect(await processUpdate(u.update_id, deps())).toBe("done"); expect(sent).toHaveLength(1)
    expect((await rows("SELECT status, payload_enc, attempts FROM telegram_updates"))[0]).toEqual({ status: "done", payload_enc: null, attempts: 1 })
    expect(await processUpdate(u.update_id, deps())).toBe("skipped"); expect(sent).toHaveLength(1)    // never answered twice
  })
  it("a chat's messages are answered in order: a later one waits for an earlier one still being worked on", async () => {
    await activeLink(); const a = msg("first"), b = msg("second"); await enqueue(a); await enqueue(b)
    await db.query("UPDATE telegram_updates SET status = 'running', started_at = now() WHERE update_id = $1", [a.update_id])
    expect(await processUpdate(b.update_id, deps())).toBe("skipped")
    await db.query("UPDATE telegram_updates SET status = 'done' WHERE update_id = $1", [a.update_id])
    expect(await processUpdate(b.update_id, deps())).toBe("done")
  })
  it("a failure is retried up to three times and then given up on, with the content wiped and no content in the error", async () => {
    await activeLink(); const u = msg("hello"); await enqueue(u)
    const boom = deps({ api: { sendMessage: async () => { throw new Error("telegram down") }, editMessage: async () => {}, answerCallback: async () => {}, sendChatAction: async () => {}, leaveChat: async () => {} } })
    for (let i = 1; i < MAX_ATTEMPTS; i++) { expect(await processUpdate(u.update_id, boom)).toBe("failed"); expect((await rows("SELECT status FROM telegram_updates"))[0].status).toBe("queued") }
    expect(await processUpdate(u.update_id, boom)).toBe("failed")
    expect((await rows("SELECT status, payload_enc, error, attempts FROM telegram_updates"))[0]).toEqual({ status: "failed", payload_enc: null, error: "telegram down", attempts: MAX_ATTEMPTS })
    expect(await processUpdate(u.update_id, deps())).toBe("skipped")
  })
  it("the sweep picks up waiting updates and updates left 'running' by a killed function, oldest first, and leaves fresh running ones alone", async () => {
    await activeLink()
    const a = msg("one"), b = msg("two"), c = msg("three"); for (const u of [a, b, c]) await enqueue(u)
    await db.query("UPDATE telegram_updates SET status = 'running', started_at = now() - interval '10 minutes' WHERE update_id = $1", [a.update_id])
    const r = await sweep(deps())
    expect(r).toEqual({ processed: 3, failed: 0 }); expect(sent).toHaveLength(3)
    await enqueue(msg("fresh")); const fresh = uid
    await db.query("UPDATE telegram_updates SET status = 'running', started_at = now() WHERE update_id = $1", [fresh])
    expect(await sweep(deps())).toEqual({ processed: 0, failed: 0 })
  })
  it("an update from a revoked device is dropped, not answered", async () => {
    const id = await activeLink(); const u = msg("hello"); await enqueue(u)
    await revokeByTelegramUser(TG)
    expect(await processUpdate(u.update_id, deps())).toBe("skipped"); expect(sent).toHaveLength(0)
    expect((await rows("SELECT status FROM telegram_updates"))[0].status).toBe("dropped"); expect(id).toBeTruthy()
  })
})
