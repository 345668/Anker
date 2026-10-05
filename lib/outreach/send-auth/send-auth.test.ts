/** Send authorizations end to end against a real Postgres (PGlite) with the real migrations. docs/architecture/46 §8. The provider is always a stub: nothing here sends mail. */
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
const h = vi.hoisted(() => ({ sql: vi.fn() as any, audit: vi.fn(), suppressed: new Set<string>() }))
vi.mock("@/lib/db", () => ({ sql: h.sql }))
vi.mock("@/lib/audit/record-change", () => ({ recordChange: h.audit }))
vi.mock("@/lib/outreach/deliverability", () => ({ isEmailSuppressed: async (_u: string, e: string) => h.suppressed.has(e.toLowerCase()) }))
process.env.SECRET_KEY = "send-auth-test"
import { buildPreview } from "./preview"
import { confirmAuthorization, revokeAuthorization, listAuthorizations, AuthorizationError } from "./store"
import { runExecutor, type ExecDeps } from "./executor"
import { contentHash, digestOf, daysNeeded, stopReason, needsTypedCount, TYPED_COUNT_ABOVE } from "./model"
import { shadowLogUnauthorized, withSendAuthorization, currentSendAuthorization, _resetShadowLogForTests } from "./context"
import { recordConsent, assertOutreachAllowed } from "@/lib/email/send-gate"
import { suppressGlobally } from "@/lib/email/unsubscribe"
import { EntitlementRefusal } from "@/lib/entitlements"

let db: PGlite
let clock = new Date("2026-10-06T09:00:00Z")
let remaining = 50, paused = false, syncs: string[] = []
const sent: any[] = []
let resendImpl: (i: any) => Promise<any> = async (i) => ({ resendId: `re_${sent.length}`, messageId: i.messageId ?? "<m>", finalFrom: "me@summit.test", finalSubject: i.subject, droppedRecipients: [] })
let gateImpl: (to: string, u: string) => Promise<void> = (to, u) => assertOutreachAllowed({ to, senderUserId: u })
const deps: ExecDeps = { now: () => clock, paused: async () => paused, waveRemaining: async () => remaining, assertAllowed: (to, u) => gateImpl(to, u),
  resend: (i) => { sent.push(i); return resendImpl(i) }, gmail: async (i) => { sent.push(i); return { ok: true, result: { gmailId: "g1", messageId: i.messageId, finalFrom: "me@gmail.test", finalSubject: i.subject, droppedRecipients: [] } } },
  loadGmail: async (id) => (await db.query("SELECT * FROM email_oauth_accounts WHERE id = $1", [id])).rows[0] ?? null, syncCrm: async (id) => { syncs.push(id) } }
const U = "u1", ORG = "org-a"
const one = async (q: string, p: unknown[] = []) => (await db.query(q, p)).rows[0] as any
const all = async (q: string, p: unknown[] = []) => (await db.query(q, p)).rows as any[]
const entry = (id: string, name: string, email: string | null, over: Record<string, unknown> = {}) => db.query("INSERT INTO crm_entries (id, org_id, display_name, display_email, stage) VALUES ($1,$2,$3,$4,$5)", [id, over.org ?? ORG, name, email, over.stage ?? "queued"])
const msg = async (id: string, entryId: string, over: Record<string, unknown> = {}) => db.query(
  "INSERT INTO outreach_messages (id, user_id, crm_entry_id, kind, step_number, channel, body, subject, status, email_to) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
  [id, over.user ?? U, entryId, over.kind ?? "email_intro", over.step ?? 0, over.channel ?? "email", over.body === undefined ? "Hello there, a real message body." : over.body, over.subject === undefined ? "Hi" : over.subject, over.status ?? "draft", over.to ?? null])
const seed = async (n: number, prefix = "p") => { for (let i = 0; i < n; i++) { await entry(`${prefix}e${i}`, `Person ${i}`, `${prefix}${i}@fund.com`); await msg(`${prefix}m${i}`, `${prefix}e${i}`) } }
const ids = (n: number, prefix = "p") => Array.from({ length: n }, (_, i) => `${prefix}m${i}`)
const approve = async (messageIds: string[], over: Record<string, unknown> = {}) => {
  const p = await buildPreview({ orgId: ORG, userId: U, messageIds, ...over })
  return confirmAuthorization({ orgId: ORG, userId: U, messageIds, digest: p.digest, typedCount: p.count, ...over }, { userId: U, email: "u1@x.test" })
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE crm_entries (id text PRIMARY KEY, org_id text, display_name text, display_email text, stage text, last_contacted_at timestamptz, updated_at timestamptz DEFAULT now());
    CREATE TABLE outreach_messages (id text PRIMARY KEY, user_id text, crm_entry_id text, kind text, step_number int DEFAULT 0, channel text, body text, subject text, email_to text, status text DEFAULT 'draft', scheduled_for timestamptz, sent_at timestamptz,
      bounced_at timestamptz, complained_at timestamptz, tracking_id text, resend_id text, email_message_id text, email_from text, generated_by text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE organizations (id text PRIMARY KEY, name text);
    CREATE TABLE outreach_replies (id serial PRIMARY KEY, crm_entry_id text);
    CREATE TABLE outreach_campaigns (id text PRIMARY KEY, cc_emails jsonb, bcc_emails jsonb, default_send_provider text, default_send_account_id text);
    CREATE TABLE outreach_campaign_members (id serial PRIMARY KEY, campaign_id text, user_id text, crm_entry_id text, status text, sent_at timestamptz, updated_at timestamptz);
    CREATE TABLE email_oauth_accounts (id text PRIMARY KEY, user_id text, email text, status text, is_default boolean DEFAULT false);
    CREATE TABLE email_suppressions (id bigserial PRIMARY KEY, user_id text, email text NOT NULL, reason text, source text, created_at timestamptz DEFAULT now());
    CREATE TABLE investors (email text, norm_country text, investor_country text);
    CREATE TABLE platform_flags (key text PRIMARY KEY, enabled boolean DEFAULT false, rollout_pct int DEFAULT 100, description text);
    CREATE TABLE audit_events (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, actor_id text, actor_email text, action text NOT NULL, target_type text, target_id text, target_label text, metadata jsonb DEFAULT '{}'::jsonb, ip text, user_agent text, created_at timestamptz DEFAULT now());`)
  await db.exec("CREATE TABLE entity_memory (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, org_id text, entity_type text, entity_id text, key text, value text, valid_until timestamptz)")
  for (const f of ["2026-10-03-outreach-consents", "2026-10-06-send-authorizations"]) await db.exec(readFileSync(`scripts/migrations/${f}.sql`, "utf8"))
  h.sql.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => (await db.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values)).rows)
}, 30000)
afterAll(async () => db.close())
beforeEach(async () => {
  await db.exec("DELETE FROM send_items; DELETE FROM send_authorizations; DELETE FROM outreach_messages; DELETE FROM crm_entries; DELETE FROM outreach_replies; DELETE FROM organizations; DELETE FROM outreach_campaign_members; DELETE FROM outreach_campaigns; DELETE FROM email_oauth_accounts; DELETE FROM email_suppressions; DELETE FROM investors; DELETE FROM outreach_consents; DELETE FROM entity_memory; DELETE FROM audit_events; UPDATE platform_flags SET enabled = false")
  clock = new Date("2026-10-06T09:00:00Z"); remaining = 50; paused = false; syncs = []; sent.length = 0; h.suppressed.clear(); h.audit.mockReset(); h.audit.mockResolvedValue(undefined); delete process.env.OUTREACH_COUNTRY_GATE
  resendImpl = async (i) => ({ resendId: `re_${sent.length}`, messageId: i.messageId ?? "<m>", finalFrom: "me@summit.test", finalSubject: i.subject, droppedRecipients: [] })
  gateImpl = (to, u) => assertOutreachAllowed({ to, senderUserId: u }); _resetShadowLogForTests()
})

describe("the rules", () => {
  it("hashes what was approved and a different text is a different hash", () => {
    const base = { to: "A@x.com", cc: ["c@x.com"], bcc: [], subject: "Hi", body: "Body", provider: "resend" as const, accountId: null, senderUserId: "u1" }
    expect(contentHash(base)).toBe(contentHash({ ...base, to: "a@x.com", cc: ["C@x.com", "c@x.com"] }))
    for (const change of [{ body: "Body!" }, { subject: "Hi!" }, { to: "b@x.com" }, { cc: [] }, { provider: "gmail" as const }, { senderUserId: "u2" }]) expect(contentHash({ ...base, ...change })).not.toBe(contentHash(base))
  })
  it("a digest names exactly the set and mailbox", () => {
    const a = [{ messageId: "1", contentHash: "x" }, { messageId: "2", contentHash: "y" }], o = { provider: "resend" as const, accountId: null, mode: "send" as const, sendAfter: null }
    expect(digestOf(a, o)).toBe(digestOf([...a].reverse(), o)); expect(digestOf(a, o)).not.toBe(digestOf(a.slice(0, 1), o)); expect(digestOf(a, o)).not.toBe(digestOf(a, { ...o, provider: "gmail" }))
  })
  it("days, typed count and stop conditions", () => {
    expect(daysNeeded(0, 50, 50)).toBe(0); expect(daysNeeded(10, 50, 50)).toBe(1); expect(daysNeeded(60, 20, 50)).toBe(2); expect(daysNeeded(10, 0, 50)).toBe(2)
    expect(needsTypedCount(TYPED_COUNT_ABOVE)).toBe(false); expect(needsTypedCount(TYPED_COUNT_ABOVE + 1)).toBe(true)
    const f = { entryMissing: false, replied: false, bouncedOrComplained: false, stagePassed: false, followUpsPaused: false, duplicateRecent: false, kind: "follow_up" }
    expect(stopReason(f)).toBeNull(); expect(stopReason({ ...f, replied: true })?.code).toBe("already_replied"); expect(stopReason({ ...f, replied: true, kind: "reply" })).toBeNull()
    expect(stopReason({ ...f, stagePassed: true })?.code).toBe("stage_passed")
  })
})

describe("preview", () => {
  it("evaluates every recipient through the gates and says why each is refused", async () => {
    await seed(1)
    await entry("e-sup", "Sup", "sup@fund.com"); await msg("m-sup", "e-sup"); await suppressGlobally("sup@fund.com", "unsubscribed", "recipient")
    await entry("e-de", "Gated", "x@fund.de"); await msg("m-de", "e-de")
    await entry("e-bad", "Bad", "noreply@fund.com"); await msg("m-bad", "e-bad")
    await entry("e-nosub", "NoSub", "n@fund.com"); await msg("m-nosub", "e-nosub", { subject: "" })
    await entry("e-sent", "Sent", "s@fund.com"); await msg("m-sent", "e-sent", { status: "sent" })
    await entry("e-rep", "Replied", "r@fund.com"); await msg("m-rep", "e-rep"); await db.query("INSERT INTO outreach_replies (crm_entry_id) VALUES ('e-rep')")
    await entry("e-pass", "Passed", "pa@fund.com", { stage: "passed" }); await msg("m-pass", "e-pass")
    await entry("e-pause", "Paused", "pz@fund.com"); await msg("m-pause", "e-pause")
    await db.query("INSERT INTO entity_memory (org_id, entity_type, entity_id, key, value) VALUES ($1,'crm_entry','e-pause','follow_up_paused','until March')", [ORG])
    await msg("m-other", "pe0", { user: "u2" })
    const p = await buildPreview({ orgId: ORG, userId: U, messageIds: ["pm0", "m-sup", "m-de", "m-bad", "m-nosub", "m-sent", "m-rep", "m-pass", "m-pause", "m-other", "nope"] })
    const v = Object.fromEntries(p.items.map((i) => [i.messageId, i.verdict.code]))
    expect(v).toEqual({ pm0: "ok", "m-sup": "suppressed", "m-de": "country_gated", "m-bad": "bad_address", "m-nosub": "no_subject", "m-sent": "already_sent", "m-rep": "already_replied", "m-pass": "stage_passed", "m-pause": "follow_ups_paused", "m-other": "wrong_sender", nope: "not_found" })
    expect(p.count).toBe(1); expect(p.blocked).toHaveLength(10); expect(p.digest).toMatch(/^[0-9a-f]{40}$/)
  })
  it("recorded consent lifts the country gate for that sender only", async () => {
    await entry("e-de", "Gated", "x@fund.de"); await msg("m-de", "e-de"); await recordConsent(U, "x@fund.de", "prior_express_consent")
    expect((await buildPreview({ orgId: ORG, userId: U, messageIds: ["m-de"] })).items[0].verdict.code).toBe("ok")
  })
  it("shows cc and bcc that will be left out, and takes the copies from the contact's campaigns", async () => {
    await seed(1); await suppressGlobally("gone@fund.com", "unsubscribed", "recipient")
    await db.query("INSERT INTO outreach_campaigns (id, cc_emails, bcc_emails) VALUES ('c1', $1, $2)", [JSON.stringify(["gone@fund.com", "ok@fund.com"]), JSON.stringify(["me@summit.test"])])
    await db.query("INSERT INTO outreach_campaign_members (campaign_id, user_id, crm_entry_id, status) VALUES ('c1', $1, 'pe0', 'drafted')", [U])
    const i = (await buildPreview({ orgId: ORG, userId: U, messageIds: ["pm0"] })).items[0]
    expect(i.cc).toEqual(["gone@fund.com", "ok@fund.com"]); expect(i.droppedSecondary).toEqual([{ email: "gone@fund.com", field: "cc", reason: "suppressed" }])
  })
  it("one message per address per batch: the first step goes, the rest wait", async () => {
    await entry("e1", "Ann", "ann@fund.com"); await msg("a0", "e1", { step: 0, kind: "connection_request" }); await msg("a3", "e1", { step: 3, kind: "follow_up" }); await msg("a7", "e1", { step: 7, kind: "different_angle" })
    const p = await buildPreview({ orgId: ORG, userId: U, messageIds: ["a7", "a3", "a0"] })
    expect(Object.fromEntries(p.items.map((x) => [x.messageId, x.verdict.code]))).toEqual({ a7: "duplicate_in_batch", a3: "duplicate_in_batch", a0: "ok" })
  })
  it("tells how many days a large batch takes, and refuses an empty or oversized one", async () => {
    await seed(60); remaining = 20
    const p = await buildPreview({ orgId: ORG, userId: U, messageIds: ids(60) })
    expect(p.count).toBe(60); expect(p.requiresTypedCount).toBe(true); expect(p.cap.days).toBeGreaterThanOrEqual(2)
    expect((await buildPreview({ orgId: ORG, userId: U, messageIds: [] })).error).toMatch(/at least one/)
    expect((await buildPreview({ orgId: ORG, userId: U, messageIds: Array.from({ length: 501 }, (_, i) => `x${i}`) })).error).toMatch(/At most 500/)
  })
  it("a Gmail batch needs a connected, active mailbox of the sender's own", async () => {
    await seed(1)
    expect((await buildPreview({ orgId: ORG, userId: U, messageIds: ["pm0"], provider: "gmail" })).error).toMatch(/No Gmail account/)
    await db.query("INSERT INTO email_oauth_accounts (id, user_id, email, status, is_default) VALUES ('g1', 'u2', 'x@gmail.test', 'active', true), ('g2', $1, 'me@gmail.test', 'error', false)", [U])
    expect((await buildPreview({ orgId: ORG, userId: U, messageIds: ["pm0"], provider: "gmail", accountId: "g1" })).error).toMatch(/another user/)
    expect((await buildPreview({ orgId: ORG, userId: U, messageIds: ["pm0"], provider: "gmail", accountId: "g2" })).error).toMatch(/reconnecting/)
  })
})

describe("confirm", () => {
  it("authorizes exactly the previewed set, queues the messages and records what was left out", async () => {
    await seed(2); await entry("e-sup", "Sup", "sup@fund.com"); await msg("m-sup", "e-sup"); await suppressGlobally("sup@fund.com", "unsubscribed", "recipient")
    const r = await approve(["pm0", "pm1", "m-sup"])
    expect(r.authorized).toBe(2); expect(r.blocked).toBe(1)
    expect((await all("SELECT message_id, status FROM send_items ORDER BY message_id")).map((x) => `${x.message_id}:${x.status}`)).toEqual(["m-sup:blocked", "pm0:approved", "pm1:approved"])
    expect((await all("SELECT status FROM outreach_messages WHERE id IN ('pm0','pm1')")).every((x) => x.status === "queued")).toBe(true)
    expect((await one("SELECT status FROM outreach_messages WHERE id = 'm-sup'")).status).toBe("draft")
    expect(h.audit.mock.calls.map((c) => c[0].action)).toContain("send_authorization.approved")
    const a = await one("SELECT expires_at, approved_at, sender_user_id, approved_by FROM send_authorizations")
    expect(a.sender_user_id).toBe(U); expect(a.approved_by).toBe(U); expect(new Date(a.expires_at).getTime() - new Date(a.approved_at).getTime()).toBeGreaterThan(6.9 * 86_400_000)
  })
  it("refuses when the batch changed since it was shown", async () => {
    await seed(2)
    const p = await buildPreview({ orgId: ORG, userId: U, messageIds: ["pm0", "pm1"] })
    await db.query("UPDATE outreach_messages SET body = 'edited after the preview, long enough' WHERE id = 'pm1'")
    await expect(confirmAuthorization({ orgId: ORG, userId: U, messageIds: ["pm0", "pm1"], digest: p.digest }, { userId: U })).rejects.toThrow(/changed since you looked/)
    expect((await one("SELECT count(*)::int n FROM send_authorizations")).n).toBe(0)
  })
  it("only the sender can approve, and a batch over 25 needs the typed count", async () => {
    await seed(30); const p = await buildPreview({ orgId: ORG, userId: U, messageIds: ids(30) })
    await expect(confirmAuthorization({ orgId: ORG, userId: U, messageIds: ids(30), digest: p.digest, typedCount: 30 }, { userId: "someone-else" })).rejects.toMatchObject({ status: 403 })
    await expect(confirmAuthorization({ orgId: ORG, userId: U, messageIds: ids(30), digest: p.digest }, { userId: U })).rejects.toThrow(/type the number \(30\)/)
    await expect(confirmAuthorization({ orgId: ORG, userId: U, messageIds: ids(30), digest: p.digest, typedCount: 29 }, { userId: U })).rejects.toThrow(/type the number/)
    expect((await confirmAuthorization({ orgId: ORG, userId: U, messageIds: ids(30), digest: p.digest, typedCount: 30 }, { userId: U })).authorized).toBe(30)
  })
  it("a message cannot be in two live authorizations", async () => {
    await seed(1); await approve(["pm0"])
    const p = await buildPreview({ orgId: ORG, userId: U, messageIds: ["pm0"] })
    expect(p.items[0].verdict.code).toBe("in_other_authorization")
    await expect(confirmAuthorization({ orgId: ORG, userId: U, messageIds: ["pm0"], digest: p.digest }, { userId: U })).rejects.toBeInstanceOf(AuthorizationError)
  })
  it("a workspace cannot authorize another workspace's messages; the sender's own draft elsewhere says which workspace", async () => {
    await db.query("INSERT INTO organizations VALUES ('org-b', 'Fund Two')")
    await entry("f1", "Foreign", "f@fund.com", { org: "org-b" }); await msg("fm1", "f1", { user: "u2" }); await msg("fm2", "f1")
    const [theirs, mine] = (await buildPreview({ orgId: ORG, userId: U, messageIds: ["fm1", "fm2"] })).items
    expect(theirs.verdict.code).toBe("not_found"); expect(theirs.name).toBe("Unknown") // another person's draft is never described
    expect(mine.verdict).toEqual({ code: "other_workspace", detail: "Fund Two" }); expect(mine.name).toMatch(/Fund Two/)
  })
})

describe("the executor", () => {
  it("sends only approved items, binds mailbox, idempotency key and message id, updates the message and CRM, and completes", async () => {
    await seed(2); await entry("unapproved", "No", "no@fund.com"); await msg("mu", "unapproved")
    await db.query("INSERT INTO outreach_campaigns (id) VALUES ('c1')"); await db.query("INSERT INTO outreach_campaign_members (campaign_id, user_id, crm_entry_id, status) VALUES ('c1', $1, 'pe0', 'drafted')", [U])
    const { authorizationId } = await approve(["pm0", "pm1"])
    const s = await runExecutor(deps)
    expect(s.sent).toBe(2); expect(sent).toHaveLength(2)
    expect(sent[0]).toMatchObject({ purpose: "outreach", senderUserId: U, to: "p0@fund.com", subject: "Hi", via: "send-executor" }); expect(sent[0].idempotencyKey).toBe(`anker-send/${authorizationId}/pm0`); expect(sent[0].messageId).toMatch(/^<.+@an-ker\.de>$/)
    expect((await one("SELECT status, resend_id, email_to, sent_at FROM outreach_messages WHERE id = 'pm0'"))).toMatchObject({ status: "sent", resend_id: expect.stringMatching(/^re_/), email_to: "p0@fund.com" })
    expect((await one("SELECT status FROM outreach_messages WHERE id = 'mu'")).status).toBe("draft"); expect(syncs.sort()).toEqual(["pe0", "pe1"])
    expect((await one("SELECT status FROM outreach_campaign_members")).status).toBe("sent"); expect((await one("SELECT last_contacted_at FROM crm_entries WHERE id = 'pe0'")).last_contacted_at).not.toBeNull()
    expect((await one("SELECT status FROM send_authorizations")).status).toBe("completed")
    expect((await runExecutor(deps)).sent).toBe(0) // nothing is sent twice
  })
  it("two executors send an item once", async () => {
    await seed(1); await approve(["pm0"])
    const [a, b] = await Promise.all([runExecutor(deps), runExecutor(deps)])
    expect(a.sent + b.sent).toBe(1); expect(sent).toHaveLength(1)
  })
  it("a message edited after approval is not sent and returns to draft", async () => {
    await seed(2); await approve(["pm0", "pm1"])
    await db.query("UPDATE outreach_messages SET body = 'a different text that was never approved' WHERE id = 'pm1'")
    const s = await runExecutor(deps)
    expect(s.sent).toBe(1); expect(s.skipped).toBe(1); expect(sent.map((x) => x.to)).toEqual(["p0@fund.com"])
    expect((await one("SELECT status, reason FROM send_items WHERE message_id = 'pm1'"))).toMatchObject({ status: "skipped", reason: expect.stringMatching(/Edited after it was approved/) })
    expect((await one("SELECT status FROM outreach_messages WHERE id = 'pm1'")).status).toBe("draft")
  })
  it("a changed recipient or subject is also not what was approved", async () => {
    await seed(2); await approve(["pm0", "pm1"])
    await db.query("UPDATE outreach_messages SET subject = 'New subject' WHERE id = 'pm0'"); await db.query("UPDATE crm_entries SET display_email = 'other@fund.com' WHERE id = 'pe1'")
    expect((await runExecutor(deps)).sent).toBe(0); expect(sent).toHaveLength(0)
  })
  it("a reply since approval stops that contact's sequence, but not other people's mail", async () => {
    await entry("e1", "Ann", "ann@fund.com"); await msg("a0", "e1", { kind: "connection_request", step: 0 }); await msg("a3", "e1", { kind: "follow_up", step: 3 })
    await seed(1)
    const p1 = await approve(["a0", "pm0"])
    await db.query("INSERT INTO send_items (authorization_id, org_id, message_id, crm_entry_id, recipients, content_hash, idempotency_key) VALUES ($1,$2,'a3','e1', $3, $4, 'k3')",
      [p1.authorizationId, ORG, JSON.stringify({ to: "ann@fund.com", cc: [], bcc: [] }), contentHash({ to: "ann@fund.com", cc: [], bcc: [], subject: "Hi", body: "Hello there, a real message body.", provider: "resend", accountId: null, senderUserId: U })])
    await db.query("UPDATE outreach_messages SET status = 'queued' WHERE id = 'a3'")
    await db.query("INSERT INTO outreach_replies (crm_entry_id) VALUES ('e1')")
    const s = await runExecutor(deps)
    expect(sent.map((x) => x.to)).toEqual(["p0@fund.com"]); expect(s.skipped).toBeGreaterThanOrEqual(1)
    expect((await all("SELECT status FROM send_items WHERE message_id IN ('a0','a3') ORDER BY message_id")).map((r) => r.status).every((x) => x === "skipped" || x === "revoked")).toBe(true)
  })
  it("an opt-out recorded after approval blocks the send", async () => {
    await seed(2); await approve(["pm0", "pm1"]); await suppressGlobally("p1@fund.com", "unsubscribed", "recipient")
    const s = await runExecutor(deps)
    expect(s.sent).toBe(1); expect(s.blocked).toBe(1); expect((await one("SELECT status, reason FROM send_items WHERE message_id = 'pm1'"))).toMatchObject({ status: "blocked", reason: expect.stringMatching(/Opted out/) })
  })
  it("a contact paused or marked passed after approval is not messaged", async () => {
    await seed(2); await approve(["pm0", "pm1"])
    await db.query("UPDATE crm_entries SET stage = 'passed' WHERE id = 'pe0'"); await db.query("INSERT INTO entity_memory (org_id, entity_type, entity_id, key, value) VALUES ($1,'crm_entry','pe1','follow_up_paused','x')", [ORG])
    expect((await runExecutor(deps)).sent).toBe(0)
  })
  it("a message to the same address in the last 24 hours is not sent again", async () => {
    await seed(1); await db.query("INSERT INTO outreach_messages (id, user_id, crm_entry_id, kind, step_number, channel, body, subject, email_to, status, sent_at) VALUES ('old', $1, 'zz', 'email_intro', 0, 'email', 'x', 's', 'p0@fund.com', 'sent', now() - interval '2 hours')", [U])
    await approve(["pm0"]); expect((await runExecutor(deps)).sent).toBe(0)
  })
  it("the daily cap and the per-tick pace spread a batch; the rest stay approved", async () => {
    await seed(5); await approve(ids(5)); remaining = 2
    expect((await runExecutor(deps)).sent).toBe(2)
    expect((await one("SELECT count(*)::int n FROM send_items WHERE status = 'approved'")).n).toBe(3)
    remaining = 50; clock = new Date("2026-10-07T09:00:00Z"); expect((await runExecutor(deps)).sent).toBe(3)
    await seed(30, "q"); await approve(ids(30, "q"))
    expect((await runExecutor(deps)).sent).toBe(20) // PER_TICK
    expect((await runExecutor(deps)).sent).toBe(10)
  })
  it("a send time in the future waits until it arrives", async () => {
    await seed(1); await approve(["pm0"], { sendAfter: "2026-10-08T09:00:00Z" })
    expect((await runExecutor(deps)).sent).toBe(0); clock = new Date("2026-10-08T09:01:00Z"); expect((await runExecutor(deps)).sent).toBe(1)
  })
  it("the platform flag and maintenance mode stop everything, and items wait", async () => {
    await seed(1); await approve(["pm0"])
    paused = true; expect((await runExecutor(deps)).paused).toBe(true); expect(sent).toHaveLength(0)
    paused = false; expect((await runExecutor(deps)).sent).toBe(1)
  })
  it("a held sender (paused workspace, plan, allowance) stops its batch and leaves the rest approved", async () => {
    await seed(3); await approve(ids(3))
    let n = 0; gateImpl = async () => { if (++n === 2) throw new EntitlementRefusal("limit", "Today's sending allowance for your plan is used up.") }
    const s = await runExecutor(deps)
    expect(s.sent).toBe(1); expect(s.held).toEqual([expect.stringMatching(/allowance/)]); expect((await one("SELECT count(*)::int n FROM send_items WHERE status = 'approved'")).n).toBe(2)
    gateImpl = async () => {}; expect((await runExecutor(deps)).sent).toBe(2)
  })
  it("a transient provider failure backs off and tries again, then gives up after three attempts", async () => {
    await seed(1); await approve(["pm0"]); resendImpl = async () => { throw new Error("Resend 503") }
    expect((await runExecutor(deps)).deferred).toBeGreaterThanOrEqual(1)
    expect((await one("SELECT status, attempts, reason FROM send_items"))).toMatchObject({ status: "approved", attempts: 1, reason: "Resend 503" })
    for (let i = 0; i < 2; i++) { clock = new Date(clock.getTime() + 2 * 3_600_000); await runExecutor(deps) }
    expect((await one("SELECT status, attempts, reason FROM send_items"))).toMatchObject({ status: "failed", attempts: 3, reason: expect.stringMatching(/after 3 attempts/) })
    expect(sent).toHaveLength(3); expect(new Set(sent.map((s) => s.idempotencyKey)).size).toBe(1) // every attempt carries the same key
  })
  it("an interrupted Resend send is retried under the same idempotency key; an interrupted Gmail send is never guessed", async () => {
    await seed(1); const { authorizationId } = await approve(["pm0"])
    await db.query("UPDATE send_items SET status = 'sending', attempts = 1, claimed_at = now() - interval '30 minutes', provider_message_id = '<kept@an-ker.de>'")
    const s = await runExecutor(deps); expect(s.recovered).toBe(1); expect(s.sent).toBe(1); expect(sent[0]).toMatchObject({ idempotencyKey: `anker-send/${authorizationId}/pm0`, messageId: "<kept@an-ker.de>" })
    await seed(1, "g"); await db.query("INSERT INTO email_oauth_accounts (id, user_id, email, status, is_default) VALUES ('g1', $1, 'me@gmail.test', 'active', true)", [U])
    await approve(["gm0"], { provider: "gmail" }); await db.query("UPDATE send_items SET status = 'sending', attempts = 1, claimed_at = now() - interval '30 minutes' WHERE message_id = 'gm0'")
    sent.length = 0; const g = await runExecutor(deps)
    expect(g.unknown).toBe(1); expect(sent).toHaveLength(0); expect((await one("SELECT status, reason FROM send_items WHERE message_id = 'gm0'"))).toMatchObject({ status: "unknown", reason: expect.stringMatching(/Check your Sent mail/) })
  })
  it("a Gmail batch goes through its own mailbox and never falls back to Resend", async () => {
    await seed(1); await db.query("INSERT INTO email_oauth_accounts (id, user_id, email, status, is_default) VALUES ('g1', $1, 'me@gmail.test', 'active', true)", [U])
    await approve(["pm0"], { provider: "gmail" }); await db.query("UPDATE email_oauth_accounts SET status = 'error'")
    const s = await runExecutor(deps); expect(s.held[0]).toMatch(/Gmail account is not connected/); expect(sent).toHaveLength(0)
    expect((await one("SELECT status FROM send_items")).status).toBe("approved")
    await db.query("UPDATE email_oauth_accounts SET status = 'active'"); clock = new Date(clock.getTime() + 3_600_000)
    expect((await runExecutor(deps)).sent).toBe(1); expect(sent[0]).toMatchObject({ account: expect.objectContaining({ id: "g1" }) })
  })
  it("follow-ups are threaded to the first message", async () => {
    await entry("e1", "Ann", "ann@fund.com"); await msg("first", "e1", { kind: "connection_request", status: "sent" }); await db.query("UPDATE outreach_messages SET email_message_id = '<first@x>' WHERE id = 'first'"); await msg("fu", "e1", { kind: "follow_up", step: 3 })
    await approve(["fu"]); await runExecutor(deps); expect(sent[0].inReplyTo).toBe("<first@x>")
  })
  it("expired approvals send nothing and release their messages", async () => {
    await seed(1); await approve(["pm0"]); await db.query("UPDATE send_authorizations SET expires_at = now() - interval '1 hour'")
    const s = await runExecutor(deps); expect(s.sent).toBe(0); expect(s.expired).toBe(1)
    expect((await one("SELECT status FROM send_authorizations")).status).toBe("expired"); expect((await one("SELECT status FROM outreach_messages WHERE id = 'pm0'")).status).toBe("draft")
  })
  it("records a cc or bcc the provider left out against the item", async () => {
    await seed(1); resendImpl = async (i) => ({ resendId: "r", messageId: i.messageId, finalFrom: "f", finalSubject: i.subject, droppedRecipients: [{ email: "gone@x.com", field: "cc", reason: "suppressed" }] })
    await approve(["pm0"]); await runExecutor(deps)
    expect((await one("SELECT reason FROM send_items")).reason).toMatch(/not copied to: gone@x\.com \(cc, opted out\)/)
  })
})

describe("revoke", () => {
  it("stops what has not gone, reports what already did, and releases the messages", async () => {
    await seed(4); const { authorizationId } = await approve(ids(4)); remaining = 1; await runExecutor(deps)
    const r = await revokeAuthorization(ORG, authorizationId, { userId: "owner1" }, "changed our mind")
    expect(r).toEqual({ revoked: 3, alreadySent: 1, inFlight: 0 })
    expect((await all("SELECT status FROM outreach_messages WHERE id IN ('pm1','pm2','pm3')")).every((m) => m.status === "draft")).toBe(true)
    remaining = 50; expect((await runExecutor(deps)).sent).toBe(0)
    expect((await one("SELECT status, revoked_by FROM send_authorizations"))).toMatchObject({ status: "revoked", revoked_by: "owner1" })
    expect(h.audit.mock.calls.map((c) => c[0].action)).toContain("send_authorization.revoked")
  })
  it("another workspace cannot revoke it", async () => {
    await seed(1); const { authorizationId } = await approve(["pm0"])
    await expect(revokeAuthorization("org-b", authorizationId, { userId: "x" }, "no")).rejects.toMatchObject({ status: 404 })
  })
  it("lists authorizations with what is waiting, sent and not sent", async () => {
    await seed(3); await approve(ids(3)); remaining = 1; await runExecutor(deps)
    expect((await listAuthorizations(ORG))[0]).toMatchObject({ waiting: 2, sent: 1, not_sent: 0 })
  })
})

describe("the shadow log of sends that skip authorization (P3 prep)", () => {
  it("logs an unauthorized path once a minute, and not at all under an authorization", async () => {
    await shadowLogUnauthorized("investor-update", 1_000); await shadowLogUnauthorized("investor-update", 2_000); await shadowLogUnauthorized("lp-send-one", 3_000); await shadowLogUnauthorized("investor-update", 70_000)
    expect((await all("SELECT target_label FROM audit_events WHERE action = 'send.unauthorized_path' ORDER BY created_at")).map((r) => r.target_label)).toEqual(["investor-update", "lp-send-one", "investor-update"])
    await db.exec("DELETE FROM audit_events"); _resetShadowLogForTests()
    await withSendAuthorization("auth-1", async () => { expect(currentSendAuthorization()).toBe("auth-1"); await shadowLogUnauthorized("x", 5_000) })
    expect((await one("SELECT count(*)::int n FROM audit_events")).n).toBe(0); expect(currentSendAuthorization()).toBeNull()
  })
})
