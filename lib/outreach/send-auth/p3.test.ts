/** P3: the click-to-send paths are recorded under a send authorization before they send, and enforcement can refuse a send that has none. docs/architecture/46 §17. Provider stubbed. */
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
const h = vi.hoisted(() => ({ sql: vi.fn() as any, audit: vi.fn(), fetch: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: h.sql }))
vi.mock("@/lib/audit/record-change", () => ({ recordChange: h.audit }))
vi.mock("@/lib/outreach/deliverability", () => ({ isEmailSuppressed: async () => false }))
vi.mock("@/lib/auth/acting-user", () => ({ resolveActingUser: async () => ({ id: "u1", email: "u1@x.test" }) }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1", email: "u1@x.test" } } }) } }) }))
vi.mock("@/lib/crm/workspace", () => ({ crmWorkspaceResponse: async () => ({ orgId: "org-a", userId: "u1", canWrite: true, canSendOutreach: true, role: "workspace_owner" }) }))
process.env.SECRET_KEY = "p3-test"
import { sendUnderAuthorization, openAuthorization, markSending, settleItem, closeAuthorization } from "./inline"
import { checkSendAuthorization, enforcementOn, UnauthorizedSendError, _resetEnforcementCache, ENFORCE_FLAG } from "./enforce"
import { withSendAuthorization, currentSendAuthorization, _resetShadowLogForTests } from "./context"
import { runExecutor, EXECUTOR_SOURCES, type ExecDeps } from "./executor"
import { sendEmail } from "@/lib/email/resend"
import { suppressGlobally, SuppressedRecipientError } from "@/lib/email/unsubscribe"
import { CountryGateError } from "@/lib/email/send-gate"
import { POST as sendOne } from "@/app/api/outreach/lp-campaign/send-one/route"

let db: PGlite
const one = async (q: string, p: unknown[] = []) => (await db.query(q, p)).rows[0] as any
const all = async (q: string, p: unknown[] = []) => (await db.query(q, p)).rows as any[]
const flag = (enabled: boolean, pct = 100) => db.query("UPDATE platform_flags SET enabled = $1, rollout_pct = $2 WHERE key = $3", [enabled, pct, ENFORCE_FLAG]).then(() => _resetEnforcementCache())
const item = (ref = "direct:1", to = "a@fund.com") => ({ ref, to, subject: "Hi", body: "A real message body for the recipient." })
const base = { orgId: "org-a", senderUserId: "u1", approvedBy: "u1", source: "direct" as const }

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE platform_flags (key text PRIMARY KEY, enabled boolean DEFAULT false, rollout_pct int DEFAULT 100, description text);
    CREATE TABLE email_suppressions (id bigserial PRIMARY KEY, user_id text, email text NOT NULL, reason text, source text, created_at timestamptz DEFAULT now());
    CREATE TABLE investors (email text, norm_country text, investor_country text);
    CREATE TABLE outreach_messages (id text PRIMARY KEY, user_id text, crm_entry_id text, status text, sent_at timestamptz, scheduled_for timestamptz, updated_at timestamptz);
    CREATE TABLE audit_events (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, actor_id text, actor_email text, action text NOT NULL, target_type text, target_id text, target_label text, metadata jsonb DEFAULT '{}'::jsonb, ip text, user_agent text, created_at timestamptz DEFAULT now());`)
  for (const f of ["2026-10-03-outreach-consents", "2026-10-06-send-authorizations", "2026-10-06b-send-auth-sources"]) await db.exec(readFileSync(`scripts/migrations/${f}.sql`, "utf8"))
  h.sql.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => (await db.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values)).rows)
}, 30000)
afterAll(async () => db.close())
beforeEach(async () => {
  await db.exec("DELETE FROM send_items; DELETE FROM send_authorizations; DELETE FROM email_suppressions; DELETE FROM audit_events; DELETE FROM outreach_consents")
  await flag(false); _resetShadowLogForTests(); h.audit.mockReset(); h.audit.mockResolvedValue(undefined); h.fetch.mockReset()
  h.fetch.mockResolvedValue({ ok: true, json: async () => ({ id: "re_1" }), text: async () => "" }); vi.stubGlobal("fetch", h.fetch); process.env.RESEND_API_KEY = "re_test"
})

describe("sending under an authorization", () => {
  it("is recorded BEFORE the send, the send runs under it, and the item settles as sent", async () => {
    let seen: any = null
    const r = await sendUnderAuthorization({ ...base, actor: { userId: "u1" }, items: [item()], send: async (i, authId) => {
      seen = { auth: await one("SELECT status, source, approved_by FROM send_authorizations WHERE id = $1", [authId]), item: await one("SELECT status, content_hash FROM send_items WHERE authorization_id = $1", [authId]), inContext: currentSendAuthorization() === authId }
      return { providerId: "re_9", providerMessageId: "<m@x>" }
    } })
    expect(seen.auth).toMatchObject({ status: "active", source: "direct", approved_by: "u1" }); expect(seen.item.status).toBe("sending"); expect(seen.item.content_hash).toMatch(/^[0-9a-f]{40}$/); expect(seen.inContext).toBe(true)
    expect(r.outcomes[0].status).toBe("sent")
    expect(await one("SELECT status, provider_id, provider_message_id FROM send_items")).toMatchObject({ status: "sent", provider_id: "re_9", provider_message_id: "<m@x>" })
    expect((await one("SELECT status FROM send_authorizations")).status).toBe("completed"); expect(currentSendAuthorization()).toBeNull()
    expect(h.audit.mock.calls[0][0]).toMatchObject({ action: "send_authorization.approved" })
  })
  it("a failed send keeps its original error for the caller and is recorded as failed; a gate refusal is blocked", async () => {
    const boom = new Error("Resend 500")
    const r = await sendUnderAuthorization({ ...base, items: [item("direct:a"), item("direct:b"), item("direct:c")], send: async (i) => {
      if (i.ref === "direct:a") throw boom
      if (i.ref === "direct:b") throw new SuppressedRecipientError("a@fund.com")
      return {}
    } })
    expect(r.outcomes.map((o) => o.status)).toEqual(["failed", "blocked", "sent"]); expect(r.outcomes[0].error).toBe(boom)
    expect((await all("SELECT message_id, status, reason FROM send_items ORDER BY message_id")).map((x) => `${x.message_id}:${x.status}`)).toEqual(["direct:a:failed", "direct:b:blocked", "direct:c:sent"])
    expect((await one("SELECT reason FROM send_items WHERE message_id = 'direct:b'")).reason).toMatch(/Opted out/)
  })
  it("if the approval cannot be recorded, nothing is sent", async () => {
    await db.exec("ALTER TABLE send_items RENAME TO send_items_x")
    const send = vi.fn(async () => ({}))
    await expect(sendUnderAuthorization({ ...base, items: [item()], send })).rejects.toThrow(); expect(send).not.toHaveBeenCalled()
    await db.exec("ALTER TABLE send_items_x RENAME TO send_items")
  })
  it("the content hash binds recipient, copies and text, so a different text is a different approval", async () => {
    const a = await openAuthorization({ ...base, items: [item("r1")], itemStatus: "approved" }), b = await openAuthorization({ ...base, items: [{ ...item("r2"), body: "A different body for the recipient." }], itemStatus: "approved" })
    const [ha, hb] = [await one("SELECT content_hash FROM send_items WHERE authorization_id = $1", [a.id]), await one("SELECT content_hash FROM send_items WHERE authorization_id = $1", [b.id])]
    expect(ha.content_hash).not.toBe(hb.content_hash)
  })
  it("a reusable key keeps one authorization across retries; items move approved to sending to failed and back", async () => {
    const o = { ...base, source: "investor_update" as const, key: "update:1", items: [item("u:1"), item("u:2")], itemStatus: "approved" as const }
    const first = await openAuthorization(o), again = await openAuthorization(o); expect(again).toEqual({ id: first.id, reused: true })
    expect(await markSending(first.id, "u:1")).toBe(true); await settleItem(first.id, "u:1", { status: "failed", reason: "x" })
    expect(await markSending(first.id, "u:1")).toBe(true) // a failed item may be retried
    await settleItem(first.id, "u:1", { status: "sent" }); expect(await markSending(first.id, "u:1")).toBe(false) // a sent one may not
    await closeAuthorization(first.id); expect((await one("SELECT status FROM send_authorizations")).status).toBe("active") // u:2 still waiting
    await settleItem(first.id, "u:2", { status: "blocked" }); await closeAuthorization(first.id); expect((await one("SELECT status FROM send_authorizations")).status).toBe("completed")
  })
  it("a message is in at most one live authorization", async () => {
    await openAuthorization({ ...base, items: [item("same")], itemStatus: "approved" })
    await expect(openAuthorization({ ...base, items: [item("same")], itemStatus: "approved" })).rejects.toThrow()
  })
})

describe("the executor leaves inline authorizations alone", () => {
  const deps: ExecDeps = { now: () => new Date(), paused: async () => false, waveRemaining: async () => 50, assertAllowed: async () => {}, resend: vi.fn(async () => ({})), gmail: vi.fn(), loadGmail: vi.fn(), syncCrm: vi.fn() }
  it("only message-backed sources are the executor's", () => { expect(EXECUTOR_SOURCES.sort()).toEqual(["manual_batch", "manual_single", "proposal"]) })
  it("an approved item of an investor update or a platform wave is never sent by the cron, and an interrupted inline send becomes unknown, never a retry", async () => {
    const u = await openAuthorization({ ...base, source: "investor_update", items: [item("u:1")], itemStatus: "approved" })
    const w = await openAuthorization({ ...base, orgId: "platform:pitch-us", senderUserId: "platform:pitch-us", approvedBy: "platform:setting:autoSend", source: "platform_wave", items: [item("wave:1")], itemStatus: "approved" })
    expect((await runExecutor(deps)).sent).toBe(0); expect(deps.resend).not.toHaveBeenCalled()
    const d = await openAuthorization({ ...base, items: [item("direct:stuck")], itemStatus: "sending" }); await db.query("UPDATE send_items SET claimed_at = now() - interval '30 minutes' WHERE message_id = 'direct:stuck'")
    const s = await runExecutor(deps); expect(s.unknown).toBe(1); expect((await one("SELECT status FROM send_items WHERE message_id = 'direct:stuck'")).status).toBe("unknown")
    expect(u.id && w.id).toBeTruthy()
  })
})

describe("enforcement", () => {
  it("off: a send with no authorization is only logged", async () => {
    await checkSendAuthorization("lp-send-one", "u1")
    expect((await all("SELECT target_label FROM audit_events WHERE action = 'send.unauthorized_path'")).map((r) => r.target_label)).toEqual(["lp-send-one"])
  })
  it("on: it is refused, and under an authorization it is allowed", async () => {
    await flag(true)
    await expect(checkSendAuthorization("lp-send-one", "u1")).rejects.toBeInstanceOf(UnauthorizedSendError)
    await withSendAuthorization("auth-1", async () => { await expect(checkSendAuthorization("x", "u1")).resolves.toBeUndefined() })
  })
  it("a rollout percentage applies per sender by a stable hash; 0 enforces nobody, 100 everybody", async () => {
    await flag(true, 0); expect(await enforcementOn("u1")).toBe(false)
    await flag(true, 100); expect(await enforcementOn("u1")).toBe(true)
    await flag(true, 50); const a = await enforcementOn("u1"); _resetEnforcementCache(); expect(await enforcementOn("u1")).toBe(a)
    const some = await Promise.all(Array.from({ length: 40 }, async (_, i) => { _resetEnforcementCache(); return enforcementOn(`sender-${i}`) })); expect(some.some(Boolean)).toBe(true); expect(some.some((x) => !x)).toBe(true)
  })
  it("a failed flag read never blocks sending", async () => {
    await flag(true); h.sql.mockRejectedValueOnce(new Error("db down")); _resetEnforcementCache()
    expect(await enforcementOn("u1")).toBe(false)
  })
  it("sendEmail refuses an outreach send with no authorization before it reaches the provider, and sends under one; transactional mail is unaffected", async () => {
    await flag(true)
    await expect(sendEmail({ purpose: "outreach", via: "unmoved-path", senderUserId: "u1", to: "a@fund.com", subject: "Hi", text: "Body" })).rejects.toMatchObject({ code: "send_unauthorized" })
    expect(h.fetch).not.toHaveBeenCalled()
    await withSendAuthorization("auth-1", () => sendEmail({ purpose: "outreach", via: "x", senderUserId: "u1", to: "a@fund.com", subject: "Hi", text: "Body" })); expect(h.fetch).toHaveBeenCalledTimes(1)
    await sendEmail({ purpose: "transactional", to: "a@fund.com", subject: "Receipt", text: "x" }); expect(h.fetch).toHaveBeenCalledTimes(2)
  })
  it("the gates still apply inside an authorization: an opted-out recipient is refused", async () => {
    await suppressGlobally("gone@fund.com", "unsubscribed", "recipient")
    const r = await sendUnderAuthorization({ ...base, items: [item("direct:g", "gone@fund.com")], send: async (i) => sendEmail({ purpose: "outreach", via: "x", senderUserId: "u1", to: i.to, subject: i.subject, text: i.body }) as any })
    expect(r.outcomes[0].status).toBe("blocked"); expect(h.fetch).not.toHaveBeenCalled(); expect(new CountryGateError("a@b.de", "DE").code).toBe("country_gated")
  })
})

describe("POST /api/outreach/lp-campaign/send-one", () => {
  const req = (b: unknown) => new Request("http://x.test/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }) as any
  it("sends under a recorded authorization and answers as before", async () => {
    const r = await sendOne(req({ to: "ann@fund.com", subject: "Hello", body: "A real message body for the recipient." })); const j = await r.json()
    expect(r.status).toBe(200); expect(j).toMatchObject({ ok: true, resendId: "re_1" }); expect(h.fetch).toHaveBeenCalledTimes(1)
    expect(await one("SELECT source, approved_by, org_id, status FROM send_authorizations")).toMatchObject({ source: "direct", approved_by: "u1", org_id: "org-a", status: "completed" })
    expect((await one("SELECT status FROM send_items")).status).toBe("sent")
  })
  it("refuses an opted-out address, records it as blocked, and sends nothing", async () => {
    await suppressGlobally("gone@fund.com", "unsubscribed", "recipient")
    const r = await sendOne(req({ to: "gone@fund.com", subject: "Hello", body: "A real message body for the recipient." }))
    expect(r.status).toBe(500); expect(h.fetch).not.toHaveBeenCalled(); expect((await one("SELECT status FROM send_items")).status).toBe("blocked")
  })
  it("with enforcement on it still sends, because it runs under its authorization", async () => {
    await flag(true); expect((await sendOne(req({ to: "ann@fund.com", subject: "Hello", body: "A real message body for the recipient." }))).status).toBe(200)
  })
})
