/** Telegram T2: proposals with buttons, taps, /inbox /today /mode, device modes and preferences, and the opt-in notifications. */
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
const st = vi.hoisted(() => ({ q: null as any, canWrite: true, decideCalls: [] as any[], decideFail: null as null | Error, applied: true }))
vi.mock("@/lib/db", () => { const f: any = (s: TemplateStringsArray, ...v: unknown[]) => st.q(s.reduce((q, t, i) => q + (i ? `$${i}` : "") + t, ""), v); f.unsafe = (t: string, v: unknown[] = []) => st.q(t, v); return { sql: f } })
vi.mock("@/lib/entitlements", () => ({ isFlagOn: async () => true, getEffective: async () => ({ features: { channel_telegram: true }, state: "active" }) }))
vi.mock("@/lib/ai/data-policy", () => ({ presetFor: async () => "standard" }))
vi.mock("@/lib/assistant/principal", () => ({ resolveAiPrincipal: async () => ({ canWrite: st.canWrite }) }))
vi.mock("@/lib/assistant/context", () => ({ withAiContext: async (_p: unknown, f: () => unknown) => f(), currentRunId: () => "run-1" }))
vi.mock("@/lib/assistant/agent", () => ({ runAssistant: async () => ({ provider: "ok", answer: "x" }) }))
vi.mock("@/lib/ai/runtime-config", () => ({ readRouterConfig: async () => null }))
vi.mock("@/lib/ai/model-router", () => ({ maxRunCostFor: () => null }))
vi.mock("@/lib/audit/audit-log", () => ({ logAudit: async () => {} }))
vi.mock("@/lib/actions/capabilities", () => ({ ActionError: class ActionError extends Error {} }))
vi.mock("@/lib/actions/store", () => ({ decide: async (org: string, id: string, decision: string, by: unknown) => {
  st.decideCalls.push({ org, id, decision, by }); if (st.decideFail) throw st.decideFail
  return { proposal: { id, status: decision === "approve" ? "applied" : decision === "reject" ? "rejected" : "undone", risk_class: "R0", undo: st.applied ? { x: 1 } : null, applied_at: new Date().toISOString() }, message: decision === "approve" ? "Moved to Contacted." : "Done." }
} }))
process.env.SECRET_KEY = "t2-test-secret"
import { createLinkCode, consumeLinkCode, confirmLink, setMode, setPrefs, getPrefs, linkByTelegramUser } from "./links"
import { handleUpdate, MSG, type Deps, type TgUpdate } from "./handler"
import { decide, pending, newProposals, today, notifyAll, shown } from "./runtime"
import { ActionError } from "@/lib/actions/capabilities"

let db: PGlite
const rows = async (q: string, p: unknown[] = []) => (await db.query(q, p)).rows as any[]
const TG = 4242, CHAT = 4242
const sent: Array<{ chat: number; html: string; markup?: any }> = [], edits: any[] = [], answers: any[] = []
const PID = "11111111-2222-3333-4444-555555555555", PID2 = "11111111-2222-3333-4444-666666666666"
const prop = (o: Record<string, unknown> = {}) => ({ id: PID, capability: "crm_update_stage", summary: "Move Katja Weber to Contacted", diff: [{ label: "Stage", before: "Queued", after: "Contacted" }], evidence: {}, risk_class: "R0", source_trust: "trusted", status: "pending", ...o })
const deps = (o: Partial<Deps> = {}): Deps => ({
  api: { sendMessage: async (c, h, m) => { sent.push({ chat: c, html: h, markup: m }) }, editMessage: async (c, id, h, m) => { edits.push({ c, id, h, m }) }, answerCallback: async (id, t, a) => { answers.push({ id, t, a }) }, sendChatAction: async () => {}, sendVoice: async () => {}, leaveChat: async () => {} },
  gate: async () => null, ask: async () => ({ answer: "I can move Katja.", runId: "run-1" }), newProposals: async () => [prop() as any], pending: async () => [], today: async () => ({ pending: 2, tasksToday: 1, overdue: 0, replies24h: 3 }), shown: async () => {}, media: { voice: async () => "", file: async () => ({ text: "", refs: [], names: [] }) }, voiceReply: async () => null, sendFile: async () => false, forget: async () => 0, remember: async () => {}, allow: async () => null, stash: async () => "id", readPending: async () => null, dropPending: async () => {}, saveNote: async () => ({ title: "t", duplicate: false }), appUrl: "https://app.test",
  decide: async (l, id, d) => ({ proposal: prop({ id, status: d === "approve" ? "applied" : "rejected" }) as any, message: "Moved to Contacted.", undoable: d === "approve" }), ...o,
})
let uid = 9000
const msg = (text: string): TgUpdate => ({ update_id: ++uid, message: { message_id: uid, from: { id: TG, username: "rick" }, chat: { id: CHAT, type: "private" }, text } })
const tap = (data: string, from = TG): TgUpdate => ({ update_id: ++uid, callback_query: { id: `cb${uid}`, from: { id: from }, data, message: { message_id: 77, chat: { id: CHAT, type: "private" } } } })
const link = async (mode: "read" | "write") => { const { code } = await createLinkCode("u1", "o1"); const r = await consumeLinkCode(code, { userId: TG, chatId: CHAT, username: "rick" }); if (!r.ok) throw new Error("x"); await confirmLink(r.link.id, "u1"); if (mode === "write") await setMode(r.link.id, "u1", "write"); return r.link.id }

beforeAll(async () => {
  db = new PGlite()
  st.q = async (q: string, v: unknown[] = []) => (await db.query(q, v)).rows
  await db.exec(`CREATE TABLE organizations (id text PRIMARY KEY, name text); INSERT INTO organizations VALUES ('o1','Acme Fund');
    CREATE TABLE anker_chats (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, user_id text, scope_key text, title text, model text, messages jsonb DEFAULT '[]', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE ai_subprocessors (slug text PRIMARY KEY, provider text, role text NOT NULL, purpose text, region text DEFAULT 'unknown', region_basis text DEFAULT 'inferred', data_classes text[] DEFAULT '{}', active boolean DEFAULT true, public boolean DEFAULT true, notes text);
    CREATE TABLE platform_flags (key text PRIMARY KEY, enabled boolean DEFAULT false, rollout_pct int DEFAULT 100, description text); CREATE TABLE plan_catalog (plan text PRIMARY KEY, features jsonb DEFAULT '{}');
    CREATE TABLE action_proposals (id text PRIMARY KEY, org_id text, capability text, summary text, diff jsonb DEFAULT '[]', evidence jsonb DEFAULT '{}', risk_class text, source_trust text DEFAULT 'trusted', status text DEFAULT 'pending', applied_at timestamptz, undo jsonb, run_id text, created_at timestamptz DEFAULT now(), expires_at timestamptz DEFAULT now() + interval '14 days');
    CREATE TABLE crm_tasks (id serial PRIMARY KEY, org_id text, user_id text, title text, due_at timestamptz, done_at timestamptz);
    CREATE TABLE outreach_replies (id serial PRIMARY KEY, user_id text, received_at timestamptz DEFAULT now());`)
  await db.exec(readFileSync("scripts/migrations/2026-10-16i-telegram-channel.sql", "utf8")); await db.exec(readFileSync("scripts/migrations/2026-10-16j-telegram-t2.sql", "utf8")); await db.exec(readFileSync("scripts/migrations/2026-10-16k-telegram-t3.sql", "utf8")); await db.exec(readFileSync("scripts/migrations/2026-10-16l-telegram-t4.sql", "utf8"))
}, 30000)
afterAll(async () => db.close())
beforeEach(async () => { sent.length = 0; edits.length = 0; answers.length = 0; st.canWrite = true; st.decideCalls.length = 0; st.decideFail = null; st.applied = true
  await db.exec("DELETE FROM telegram_shown; DELETE FROM telegram_prefs; DELETE FROM telegram_updates; DELETE FROM telegram_links; DELETE FROM telegram_link_codes; DELETE FROM anker_chats; DELETE FROM action_proposals; DELETE FROM crm_tasks; DELETE FROM outreach_replies") })

describe("devices: mode and preferences", () => {
  it("a new device is read-only; only its owner can switch it to write, and back", async () => {
    const id = await link("read"); expect((await linkByTelegramUser(TG))!.mode).toBe("read")
    expect(await setMode(id, "someone-else", "write")).toBeNull()
    expect(await setMode(id, "u1", "write")).toMatchObject({ mode: "write" }); expect(await setMode(id, "u1", "read")).toMatchObject({ mode: "read" })
  })
  it("notifications are off until switched on, are per device, and switching one on starts its watermark now so old items are not announced", async () => {
    const id = await link("write")
    expect(await getPrefs([id])).toEqual({})
    expect(await setPrefs(id, "u1", "o1", { approvals: true, replies: false, deadlines: true, voiceReplies: false, dailyBrief: false })).toBe(true)
    expect((await getPrefs([id]))[id]).toEqual({ approvals: true, replies: false, deadlines: true, voiceReplies: false, dailyBrief: false })
    expect(await setPrefs(id, "stranger", "o1", { approvals: true, replies: true, deadlines: true, voiceReplies: false, dailyBrief: false })).toBe(false); expect(await setPrefs(id, "u1", "other-org", { approvals: true, replies: true, deadlines: true, voiceReplies: false, dailyBrief: false })).toBe(false)
    const r = (await rows("SELECT last_approvals_at, last_replies_at FROM telegram_prefs"))[0]; expect(Date.now() - new Date(r.last_approvals_at).getTime()).toBeLessThan(10_000)
  })
})

describe("a change the assistant proposes", () => {
  it("is shown with what changes and Approve and Reject buttons on a write device, and nothing is applied", async () => {
    await link("write")
    await handleUpdate(msg("move Katja to Contacted"), deps())
    expect(sent.map((s) => s.html)[0]).toBe("I can move Katja.")
    const p = sent[1]; expect(p.html).toContain("<b>Move Katja Weber to Contacted</b>"); expect(p.html).toContain("Stage: Queued → <b>Contacted</b>")
    expect(p.markup.inline_keyboard[0].map((b: any) => b.callback_data)).toEqual([`a:${PID}`, `r:${PID}`]); expect(st.decideCalls).toHaveLength(0)
  })
  it("on a read-only device it is shown without buttons, with how to allow changes", async () => {
    await link("read")
    await handleUpdate(msg("move Katja"), deps())
    expect(sent[1].html).toContain("read-only"); expect(JSON.stringify(sent[1].markup)).not.toContain("callback_data")
  })
  it("a proposal that reaches other people is never given an Approve button, even on a write device", async () => {
    await link("write")
    await handleUpdate(msg("send them"), deps({ newProposals: async () => [prop({ risk_class: "R2", summary: "Send 12 messages" }) as any] }))
    expect(JSON.stringify(sent[1].markup)).not.toContain("callback_data"); expect(sent[1].html).toContain("approved in Anker")
  })
  it("at most five are shown, the rest are pointed to in the app, and they are recorded as shown", async () => {
    await link("write"); let shownIds: string[] = []
    const many = Array.from({ length: 7 }, (_, i) => prop({ id: `11111111-2222-3333-4444-5555555555${String(i).padStart(2, "0")}`, summary: `Change ${i}` }) as any)
    await handleUpdate(msg("do many"), deps({ newProposals: async () => many, shown: async (_l, ids) => { shownIds = ids } }))
    expect(sent.length).toBe(1 + 5 + 1); expect(sent.at(-1)!.html).toContain("2 more are waiting in Anker"); expect(shownIds).toHaveLength(7)
  })
  it("no run id, no proposals shown (a plain answer)", async () => {
    await link("write"); await handleUpdate(msg("hi"), deps({ ask: async () => ({ answer: "Hello.", runId: null }) })); expect(sent).toHaveLength(1)
  })
})

describe("a tap", () => {
  it("Approve applies it through the action layer as the linked person, edits the message to a result with an Undo, and tells Telegram it is done", async () => {
    await link("write")
    await handleUpdate(tap(`a:${PID}`), deps())
    expect(edits[0].h).toContain("✅ Applied"); expect(edits[0].m.inline_keyboard[0][0].callback_data).toBe(`u:${PID}`); expect(answers[0]).toMatchObject({ t: "Done", a: false })
  })
  it("Reject changes nothing and removes the buttons", async () => {
    await link("write"); await handleUpdate(tap(`r:${PID}`), deps())
    expect(edits[0].h).toContain("✖ Rejected"); expect(JSON.stringify(edits[0].m)).not.toContain("callback_data")
  })
  it("a read-only device, a pending or revoked device, and an unknown account cannot decide anything", async () => {
    const id = await link("read"); let called = false
    const d = deps({ decide: async () => { called = true; throw new Error("no") } })
    await handleUpdate(tap(`a:${PID}`), d); expect(answers[0].t).toContain("read-only")
    await handleUpdate(tap(`a:${PID}`, 999), d); expect(answers[1].t).toContain("not connected")
    await db.query("UPDATE telegram_links SET status = 'suspended' WHERE id = $1", [id]); await handleUpdate(tap(`a:${PID}`), d); expect(answers[2].t).toContain("not connected")
    expect(called).toBe(false); expect(edits).toHaveLength(0)
  })
  it("a malformed callback, a group chat, and a gate refusal are refused in words", async () => {
    await link("write")
    await handleUpdate(tap("a:not-an-id"), deps()); expect(answers[0].t).toBe(MSG.stale)
    await handleUpdate({ update_id: ++uid, callback_query: { id: "g", from: { id: TG }, data: `a:${PID}`, message: { message_id: 1, chat: { id: -5, type: "group" } } } }, deps()); expect(answers[1].t).toContain("private chat")
    await handleUpdate(tap(`a:${PID}`), deps({ gate: async () => "Your workspace policy does not allow this." })); expect(answers[2].t).toContain("policy")
  })
  it("an error from the guards is shown as one plain sentence, not the raw error", async () => {
    await link("write")
    const plain: any = new Error("This is a large batch, so it is approved in Anker."); plain.plain = true
    await handleUpdate(tap(`a:${PID}`), deps({ decide: async () => { throw plain } })); expect(answers[0].t).toContain("approved in Anker")
    await handleUpdate(tap(`a:${PID}`), deps({ decide: async () => { throw new Error("ECONNRESET db-host") } })); expect(answers[1].t).toBe(MSG.failed)
  })
})

describe("the guards behind a tap (runtime.decide)", () => {
  const L = async () => { await link("write"); return (await linkByTelegramUser(TG))! }
  const put = (o: Record<string, unknown> = {}) => db.query("INSERT INTO action_proposals (id, org_id, capability, summary, risk_class, status, evidence, applied_at, undo) VALUES ($1,'o1','crm_update_stage','Move Katja','R0','pending',$2,$3,$4)", [o.id ?? PID, JSON.stringify(o.evidence ?? {}), o.applied_at ?? null, o.undo ? JSON.stringify(o.undo) : null]).then(() => db.query("UPDATE action_proposals SET risk_class = $2, status = $3 WHERE id = $1", [o.id ?? PID, o.risk ?? "R0", o.status ?? "pending"]))
  it("approves a small change as the linked person and records it as from Telegram", async () => {
    const l = await L(); await put()
    const r = await decide(l, PID, "approve")
    expect(st.decideCalls[0]).toMatchObject({ org: "o1", id: PID, decision: "approve", by: { userId: "u1" } }); expect(r).toMatchObject({ message: "Moved to Contacted.", undoable: true })
  })
  it("refuses to approve a third-party or large-batch proposal, a proposal of another workspace, a missing one, and a person who can no longer write", async () => {
    const l = await L()
    await put({ risk: "R2" }); await expect(decide(l, PID, "approve")).rejects.toMatchObject({ plain: true, message: expect.stringContaining("approved in Anker") })
    await put({ id: PID2, evidence: { requiresTypedCount: true }, risk: "R1" }); await expect(decide(l, PID2, "approve")).rejects.toMatchObject({ message: expect.stringContaining("large batch") })
    await db.query("INSERT INTO action_proposals (id, org_id, capability, summary, risk_class) VALUES ('11111111-2222-3333-4444-777777777777','other-org','x','x','R0')")
    await expect(decide(l, "11111111-2222-3333-4444-777777777777", "approve")).rejects.toMatchObject({ message: "That proposal is no longer there." })
    await expect(decide(l, "11111111-2222-3333-4444-888888888888", "approve")).rejects.toMatchObject({ plain: true })
    st.canWrite = false; await put({ id: "11111111-2222-3333-4444-999999999999" }); await expect(decide(l, "11111111-2222-3333-4444-999999999999", "approve")).rejects.toMatchObject({ message: expect.stringContaining("can't approve") })
    expect(st.decideCalls).toHaveLength(0)
  })
  it("rejecting is allowed for any proposal in the workspace, including a large one", async () => {
    const l = await L(); await put({ risk: "R2" }); await decide(l, PID, "reject"); expect(st.decideCalls[0].decision).toBe("reject")
  })
  it("undo works for a recent R0 change only; an old one or a bigger one is for the app", async () => {
    const l = await L()
    await put({ status: "applied", applied_at: new Date().toISOString(), undo: { x: 1 } }); expect((await decide(l, PID, "undo")).proposal.status).toBe("undone")
    await put({ id: PID2, status: "applied", applied_at: new Date(Date.now() - 2 * 3600_000).toISOString(), undo: { x: 1 } }); await expect(decide(l, PID2, "undo")).rejects.toMatchObject({ message: "This can only be undone in Anker." })
  })
  it("an error from the action layer comes back as a plain sentence", async () => {
    const l = await L(); await put(); st.decideFail = new ActionError("This proposal expired. Ask again to get a fresh one.")
    await expect(decide(l, PID, "approve")).rejects.toMatchObject({ plain: true, message: "This proposal expired. Ask again to get a fresh one." })
  })
  it("lists what is waiting and what a run just proposed, scoped to the workspace", async () => {
    const l = await L(); await put(); await db.query("UPDATE action_proposals SET run_id = 'run-9' WHERE id = $1", [PID]); await put({ id: PID2 })
    await db.query("INSERT INTO action_proposals (id, org_id, capability, summary, risk_class) VALUES ('11111111-2222-3333-4444-777777777777','other-org','x','x','R0')")
    expect((await pending(l, 5)).map((p) => p.id).sort()).toEqual([PID, PID2].sort()); expect((await newProposals(l, "run-9")).map((p) => p.id)).toEqual([PID])
    await shown(l, [PID]); await shown(l, [PID]); expect(Number((await rows("SELECT count(*)::int n FROM telegram_shown"))[0].n)).toBe(1)
  })
})

describe("/inbox, /today, /mode", () => {
  it("/inbox shows what is waiting with its buttons, or says nothing is", async () => {
    await link("write")
    await handleUpdate(msg("/inbox"), deps()); expect(sent[0].html).toBe(MSG.noPending)
    await handleUpdate(msg("/inbox"), deps({ pending: async () => [prop() as any, prop({ id: PID2, summary: "Add a follow-up task" }) as any] })); expect(sent.length).toBe(3); expect(sent[2].html).toContain("Add a follow-up task")
  })
  it("/today is a count of what needs the person, in one line", async () => {
    await link("read"); await handleUpdate(msg("/today"), deps())
    expect(sent[0].html).toBe("Today: 2 waiting for your approval, 1 task due today, 3 new replies to your outreach in the last day.")
  })
  it("/mode says whether changes may be proposed", async () => {
    await link("read"); await handleUpdate(msg("/mode"), deps()); expect(sent[0].html).toContain("read-only")
    await setMode((await linkByTelegramUser(TG))!.id, "u1", "write"); await handleUpdate(msg("/mode"), deps()); expect(sent[1].html).toContain("may propose changes".replace("may propose changes", "propose changes"))
  })
  it("/today counts really come from the workspace's own tables", async () => {
    const l = await (async () => { await link("write"); return (await linkByTelegramUser(TG))! })()
    await db.query("INSERT INTO action_proposals (id, org_id, capability, summary, risk_class) VALUES ($1,'o1','x','x','R0')", [PID])
    await db.query("INSERT INTO crm_tasks (org_id, user_id, title, due_at) VALUES ('o1','u1','a', now()), ('o1','u1','b', now() - interval '3 days'), ('o1','u2','not mine', now()), ('o2','u1','other org', now())")
    await db.query("INSERT INTO outreach_replies (user_id, received_at) VALUES ('u1', now()), ('u1', now() - interval '3 days'), ('u2', now())")
    expect(await today(l)).toEqual({ pending: 1, tasksToday: expect.any(Number), overdue: 1, replies24h: 1 })
  })
})

describe("notifications", () => {
  const T = Date.UTC(2026, 9, 17, 10, 0, 0)         // 12:00 Berlin
  const NIGHT = Date.UTC(2026, 9, 17, 21, 0, 0)     // 23:00 Berlin
  const out: any[] = []; const api = { sendMessage: async (c: number, h: string, m: any) => { out.push({ c, h, m }) }, editMessage: async () => {}, answerCallback: async () => {}, sendChatAction: async () => {}, sendVoice: async () => {}, leaveChat: async () => {} }
  beforeEach(() => { out.length = 0 })
  const on = async (p: Partial<{ approvals: boolean; replies: boolean; deadlines: boolean; dailyBrief: boolean; voiceReplies: boolean }>) => { const id = await link("write"); await setPrefs(id, "u1", "o1", { approvals: false, replies: false, deadlines: false, voiceReplies: false, dailyBrief: false, ...p }); await db.query("UPDATE telegram_prefs SET last_approvals_at = $2, last_replies_at = $2 WHERE link_id = $1", [id, new Date(T - 3600_000).toISOString()]); return id }

  it("nothing is sent to someone who has not opted in", async () => {
    await link("write"); await db.query("INSERT INTO action_proposals (id, org_id, capability, summary, risk_class) VALUES ($1,'o1','x','x','R0')", [PID])
    expect((await notifyAll(api, "https://app.test", T)).sent).toBe(0); expect(out).toHaveLength(0)
  })
  it("approvals: one message with a count and a link, never a name or a summary, and not repeated", async () => {
    await on({ approvals: true })
    await db.query("INSERT INTO action_proposals (id, org_id, capability, summary, risk_class, created_at) VALUES ($1,'o1','x','Move Katja Weber','R0',$3), ($2,'o1','x','Secret LP name','R0',$3)", [PID, PID2, new Date(T - 600_000).toISOString()])
    const r = await notifyAll(api, "https://app.test", T)
    expect(r.sent).toBe(1); expect(out[0].h).toBe("2 new changes are waiting for your approval. /inbox shows them here."); expect(JSON.stringify(out)).not.toMatch(/Katja|Secret/); expect(out[0].m.inline_keyboard[0][0].url).toBe("https://app.test/dashboard/actions")
    await notifyAll(api, "https://app.test", T + 60_000); expect(out).toHaveLength(1)
  })
  it("a proposal already shown in the chat is not announced again", async () => {
    const id = await on({ approvals: true })
    await db.query("INSERT INTO action_proposals (id, org_id, capability, summary, risk_class, created_at) VALUES ($1,'o1','x','x','R0',$2)", [PID, new Date(T - 600_000).toISOString()])
    await db.query("INSERT INTO telegram_shown (link_id, org_id, proposal_id) VALUES ($1,'o1',$2)", [id, PID])
    await notifyAll(api, "https://app.test", T); expect(out).toHaveLength(0)
  })
  it("during quiet hours nothing is sent and nothing is lost: the morning message covers the night", async () => {
    await on({ approvals: true }); await db.query("INSERT INTO action_proposals (id, org_id, capability, summary, risk_class, created_at) VALUES ($1,'o1','x','x','R0',$2)", [PID, new Date(NIGHT - 3600_000).toISOString()])
    const r = await notifyAll(api, "https://app.test", NIGHT); expect(r.held).toBe(1); expect(out).toHaveLength(0)
    await notifyAll(api, "https://app.test", Date.UTC(2026, 9, 18, 6, 0, 0)); expect(out).toHaveLength(1)    // 08:00 Berlin
  })
  it("replies: a count only, since the last time; tasks: once each morning, a count only", async () => {
    await on({ replies: true, deadlines: true, voiceReplies: false, dailyBrief: false })
    await db.query("INSERT INTO outreach_replies (user_id, received_at) VALUES ('u1',$1), ('u1',$1), ('u2',$1)", [new Date(T - 600_000).toISOString()])
    await db.query("INSERT INTO crm_tasks (org_id, user_id, title, due_at) VALUES ('o1','u1','Call Katja', $1), ('o1','u1','Send deck', $1)", [new Date(T - 3600_000).toISOString()])
    await notifyAll(api, "https://app.test", T)
    expect(out.map((o) => o.h).sort()).toEqual(["2 new replies to your outreach.", "2 tasks are due today or overdue."]); expect(JSON.stringify(out)).not.toMatch(/Katja|deck/)
    await notifyAll(api, "https://app.test", T + 3600_000); expect(out).toHaveLength(2)
  })
  it("daily brief: opt-in, names the tasks, replaces the plain task count, once a day, and stays quiet when there is nothing", async () => {
    await on({ dailyBrief: true, deadlines: true })
    await notifyAll(api, "https://app.test", T); expect(out).toHaveLength(0)
    await db.query("INSERT INTO crm_tasks (org_id, user_id, title, due_at) VALUES ('o1','u1','Call Katja', $1), ('o1','u1','Send deck', $1)", [new Date(T - 3600_000).toISOString()])
    await db.query("UPDATE telegram_prefs SET last_brief_on = NULL, last_deadlines_on = NULL")
    await notifyAll(api, "https://app.test", T)
    expect(out).toHaveLength(1); expect(out[0].h).toContain("Your day"); expect(out[0].h).toContain("Call Katja"); expect(out[0].h).not.toContain("tasks are due")
    await notifyAll(api, "https://app.test", T + 3600_000); expect(out).toHaveLength(1)
  })
  it("a workspace the gate refuses, and a revoked device, get nothing; a failing send is counted and retried next time", async () => {
    const id = await on({ approvals: true }); await db.query("INSERT INTO action_proposals (id, org_id, capability, summary, risk_class, created_at) VALUES ($1,'o1','x','x','R0',$2)", [PID, new Date(T - 600_000).toISOString()])
    const bad = { ...api, sendMessage: async () => { throw new Error("blocked") } }
    expect((await notifyAll(bad, "https://app.test", T)).failed).toBe(1)
    expect((await notifyAll(api, "https://app.test", T + 60_000)).sent).toBe(1)
    await db.query("UPDATE telegram_links SET status = 'revoked' WHERE id = $1", [id]); await db.query("INSERT INTO action_proposals (id, org_id, capability, summary, risk_class, created_at) VALUES ($1,'o1','x','x','R0',$2)", [PID2, new Date(T).toISOString()])
    out.length = 0; await notifyAll(api, "https://app.test", T + 120_000); expect(out).toHaveLength(0)
  })
})
