/** P4: dated sequences approved once, and LinkedIn actions recorded under the same authorization. docs/architecture/46 §18. Providers stubbed; nothing here sends. */
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
const h = vi.hoisted(() => ({ sql: vi.fn() as any, audit: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: h.sql }))
vi.mock("@/lib/audit/record-change", () => ({ recordChange: h.audit }))
vi.mock("@/lib/outreach/deliverability", () => ({ isEmailSuppressed: async () => false }))
process.env.SECRET_KEY = "p4-test"
import { buildPreview } from "./preview"
import { confirmAuthorization, revokeAuthorization } from "./store"
import { runExecutor, type ExecDeps } from "./executor"
import { assertOutreachAllowed } from "@/lib/email/send-gate"
import { enqueueAction, approveActions, claimActions, reportActionResult, reclaimStaleActions } from "@/lib/linkedin/action-queue"

let db: PGlite
let clock = new Date("2026-10-06T09:00:00Z")
let paused = false
const sent: any[] = []
const deps: ExecDeps = { now: () => clock, paused: async () => paused, waveRemaining: async () => 50, assertAllowed: (to, u) => assertOutreachAllowed({ to, senderUserId: u }),
  resend: async (i) => { sent.push(i); return { resendId: `re_${sent.length}`, messageId: i.messageId ?? "<m>", finalFrom: "me@summit.test", finalSubject: i.subject, droppedRecipients: [] } },
  gmail: async () => ({ ok: false, error: "no" }), loadGmail: async () => null, syncCrm: async () => {} }
const U = "u1", ORG = "org-a"
const one = async (q: string, p: unknown[] = []) => (await db.query(q, p)).rows[0] as any
const all = async (q: string, p: unknown[] = []) => (await db.query(q, p)).rows as any[]
/** The test clock is not the database clock: make what was sent look like it went days ago. */
const age = () => db.query("UPDATE outreach_messages SET sent_at = now() - interval '5 days' WHERE status = 'sent'").then(() => db.query("UPDATE send_items SET sent_at = now() - interval '5 days' WHERE status = 'sent'"))
const D = (days: number) => new Date(new Date("2026-10-06T09:00:00Z").getTime() + days * 86_400_000)

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
    CREATE TABLE entity_memory (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, org_id text, entity_type text, entity_id text, key text, value text, valid_until timestamptz);
    CREATE TABLE audit_events (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, actor_id text, actor_email text, action text NOT NULL, target_type text, target_id text, target_label text, metadata jsonb DEFAULT '{}'::jsonb, ip text, user_agent text, created_at timestamptz DEFAULT now());
    CREATE FUNCTION workspace_record_access(text, text, boolean, boolean) RETURNS boolean AS $$ SELECT true $$ LANGUAGE sql;`)
  for (const f of ["2026-10-03-outreach-consents", "2026-10-06-send-authorizations", "2026-10-06b-send-auth-sources", "2026-10-07-send-auth-linkedin", "2026-08-24-linkedin-outreach"]) await db.exec(readFileSync(`scripts/migrations/${f}.sql`, "utf8"))
  h.sql.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => (await db.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values)).rows)
}, 30000)
afterAll(async () => db.close())
beforeEach(async () => {
  await db.exec("DELETE FROM send_items; DELETE FROM send_authorizations; DELETE FROM outreach_messages; DELETE FROM crm_entries; DELETE FROM outreach_replies; DELETE FROM email_suppressions; DELETE FROM investors; DELETE FROM outreach_consents; DELETE FROM li_action_queue; DELETE FROM audit_events; UPDATE platform_flags SET enabled = false")
  clock = new Date("2026-10-06T09:00:00Z"); paused = false; sent.length = 0; h.audit.mockReset(); h.audit.mockResolvedValue(undefined)
})

/** One contact with the four steps of a sequence. */
const sequence = async (n = 1, steps = [0, 3, 7, 14]) => {
  const ids: string[] = []
  for (let c = 0; c < n; c++) {
    await db.query("INSERT INTO crm_entries (id, org_id, display_name, display_email, stage) VALUES ($1,$2,$3,$4,'queued')", [`e${c}`, ORG, `Person ${c}`, `p${c}@fund.com`])
    for (const s of steps) {
      const id = `m${c}-${s}`
      await db.query("INSERT INTO outreach_messages (id, user_id, crm_entry_id, kind, step_number, channel, body, subject, status) VALUES ($1,$2,$3,$4,$5,'email',$6,$7,'draft')", [id, U, `e${c}`, s === 0 ? "email_intro" : "follow_up", s, `Step ${s} body for person ${c}, long enough.`, `Hi ${s}`])
      ids.push(id)
    }
  }
  return ids
}
const seqApprove = async (messageIds: string[], over: Record<string, unknown> = {}) => {
  const p = await buildPreview({ orgId: ORG, userId: U, messageIds, sequence: true, ...over })
  return confirmAuthorization({ orgId: ORG, userId: U, messageIds, digest: p.digest, typedCount: p.count, sequence: true, ...over }, { userId: U, email: "u1@x.test" })
}

describe("dated email sequences", () => {
  it("without sequence a contact's later steps are held back, as before; with it every step is wanted, dated by its step", async () => {
    const ids = await sequence()
    const plain = await buildPreview({ orgId: ORG, userId: U, messageIds: ids })
    expect(plain.count).toBe(1); expect(plain.blocked.every((b) => b.verdict.code === "duplicate_in_batch")).toBe(true)
    const p = await buildPreview({ orgId: ORG, userId: U, messageIds: ids, sequence: true })
    expect(p.count).toBe(4); expect(p.items.map((i) => i.offsetDays)).toEqual([0, 3, 7, 14])
    expect(p.digest).not.toBe(plain.digest)
  })
  it("one approval, items dated by step, and an approval that lasts to the last step plus two days", async () => {
    const ids = await sequence()
    const r = await seqApprove(ids)
    const items = await all("SELECT message_id, send_after FROM send_items ORDER BY message_id")
    expect(items.map((i) => new Date(i.send_after).getTime() - D(0).getTime())).toHaveLength(4)
    const days = items.map((i) => Math.round((new Date(i.send_after).getTime() - new Date(items[0].send_after).getTime()) / 86_400_000))
    expect(days).toEqual([0, 14, 3, 7]) // ordered by message id: m0-0, m0-14, m0-3, m0-7
    const a = await one("SELECT expires_at, summary FROM send_authorizations WHERE id = $1", [r.authorizationId])
    expect(a.summary.sequence).toBe(true)
    expect(new Date(a.expires_at).getTime() - new Date(items.find((i) => i.message_id === "m0-14")!.send_after).getTime()).toBe(2 * 86_400_000)
    expect((await one("SELECT count(*)::int n FROM outreach_messages WHERE status = 'queued'")).n).toBe(4)
  })
  it("a changed digest or a missing sequence flag is refused", async () => {
    const ids = await sequence()
    const p = await buildPreview({ orgId: ORG, userId: U, messageIds: ids, sequence: true })
    await expect(confirmAuthorization({ orgId: ORG, userId: U, messageIds: ids, digest: p.digest, typedCount: 4 }, { userId: U })).rejects.toThrow(/changed since/)
  })
  it("sends each step on its day, in order, and not before", async () => {
    await seqApprove(await sequence())
    let s = await runExecutor(deps); expect(s.sent).toBe(1); expect(sent.map((x) => x.subject)).toEqual(["Hi 0"])
    s = await runExecutor(deps); expect(s.sent).toBe(0) // step 3 is not due
    await age(); clock = D(3.1); s = await runExecutor(deps); expect(s.sent).toBe(1); expect(sent.map((x) => x.subject)).toEqual(["Hi 0", "Hi 3"])
    await age(); clock = D(15); s = await runExecutor(deps); expect(s.sent).toBe(1)
    s = await runExecutor(deps); expect(s.sent).toBe(0) // 14 is due too, but waits a day after 7 instead of going with it
    await age(); s = await runExecutor(deps); expect(s.sent).toBe(1)
    expect(sent.map((x) => x.subject)).toEqual(["Hi 0", "Hi 3", "Hi 7", "Hi 14"])
    expect((await one("SELECT status FROM send_authorizations")).status).toBe("completed")
  })
  it("a later step waits while an earlier one has not gone, and stops if the earlier one did not go", async () => {
    await seqApprove(await sequence())
    paused = true; clock = D(20); expect((await runExecutor(deps)).paused).toBe(true); paused = false
    // the intro is blocked at send time (the contact opted out): the follow-ups stop with that reason
    await db.query("INSERT INTO email_suppressions (user_id, email, reason, source) VALUES (NULL, 'p0@fund.com', 'unsubscribed', 'recipient')")
    const s = await runExecutor(deps)
    expect(sent).toHaveLength(0); expect(s.blocked).toBe(1)
    const rest = await all("SELECT status, reason FROM send_items WHERE message_id <> 'm0-0'")
    expect(rest.every((r) => r.status === "revoked" && /earlier step was not sent/.test(r.reason))).toBe(true)
    expect((await one("SELECT count(*)::int n FROM outreach_messages WHERE status = 'queued'")).n).toBe(0)
  })
  it("a reply stops the rest of the sequence", async () => {
    await seqApprove(await sequence())
    await runExecutor(deps); expect(sent).toHaveLength(1)
    await db.query("INSERT INTO outreach_replies (crm_entry_id) VALUES ('e0')")
    await age(); clock = D(15); const s = await runExecutor(deps)
    expect(sent).toHaveLength(1); expect(s.skipped).toBeGreaterThan(0)
    expect((await all("SELECT status FROM send_items WHERE message_id <> 'm0-0'")).every((r) => r.status === "revoked" || r.status === "skipped")).toBe(true)
  })
  it("editing one step after approval skips only that step", async () => {
    await seqApprove(await sequence())
    await db.query("UPDATE outreach_messages SET body = 'Rewritten after the approval, so it must not go.' WHERE id = 'm0-3'")
    await runExecutor(deps)
    for (let n = 0; n < 4; n++) { await age(); clock = D(15 + n); await runExecutor(deps) }
    expect(sent.map((x) => x.subject)).toContain("Hi 0")
    expect((await one("SELECT status, reason FROM send_items WHERE message_id = 'm0-3'")).status).toBe("skipped")
  })
  it("revoking a sequence stops every step that has not gone", async () => {
    const r = await seqApprove(await sequence())
    await runExecutor(deps)
    const out = await revokeAuthorization(ORG, r.authorizationId, { userId: U }, "changed my mind")
    expect(out).toMatchObject({ revoked: 3, alreadySent: 1 })
    clock = D(20); expect((await runExecutor(deps)).sent).toBe(0)
  })
})

describe("LinkedIn under authorizations", () => {
  const act = (over: Record<string, unknown> = {}) => ({ actionType: "connect_request" as const, targetUrl: "https://www.linkedin.com/in/jane", targetName: "Jane", payload: { message: "Hi Jane" }, ...over })
  const items = () => all("SELECT i.status, i.message_id, a.source, a.provider, a.approved_by, a.org_id FROM send_items i JOIN send_authorizations a ON a.id = i.authorization_id ORDER BY i.created_at")

  it("a manual approval is recorded before the action can be claimed, and the report settles it", async () => {
    const a = await enqueueAction(U, act())
    expect(await items()).toHaveLength(0) // pending approval: no authorization yet
    expect(await claimActions(U, 5, "ext")).toHaveLength(0)
    expect(await approveActions(U, [a.id], "u1")).toBe(1)
    expect(await items()).toEqual([{ status: "approved", message_id: a.id, source: "linkedin", provider: "linkedin", approved_by: "u1", org_id: `linkedin:${U}` }])
    const got = await claimActions(U, 5, "ext")
    expect(got.map((g) => g.id)).toEqual([a.id]); expect((await items())[0].status).toBe("sending")
    expect(await reportActionResult(U, a.id, { ok: true })).toBe("done")
    expect((await items())[0].status).toBe("sent"); expect((await one("SELECT status FROM send_authorizations")).status).toBe("completed")
  })
  it("a campaign's auto-approve is recorded with its approver, and a failure is recorded as failed", async () => {
    const a = await enqueueAction(U, act({ autoApprove: true, approvedBy: "sequencer:auto" }))
    expect((await items())[0]).toMatchObject({ approved_by: "sequencer:auto", status: "approved" })
    await claimActions(U, 5, "ext"); await reportActionResult(U, a.id, { ok: false, error: "rate limited" })
    expect((await items())[0].status).toBe("failed")
  })
  it("an action queued before P4 gets its record from its own approval columns, and then goes", async () => {
    await db.query("INSERT INTO li_action_queue (id, user_id, target_url, action_type, payload, status, approved_by, approved_at) VALUES ('old1', $1, 'https://www.linkedin.com/in/old', 'message', '{\"message\":\"Hello\"}', 'queued', 'u1', now())", [U])
    expect((await claimActions(U, 5, "ext")).map((g) => g.id)).toEqual(["old1"])
    expect((await items())[0]).toMatchObject({ message_id: "old1", approved_by: "u1", status: "sending" })
  })
  it("the platform pause stops claims; the actions wait", async () => {
    const a = await enqueueAction(U, act({ autoApprove: true }))
    await db.query("INSERT INTO platform_flags (key, enabled) VALUES ('outreach_sending_paused', true) ON CONFLICT (key) DO UPDATE SET enabled = true")
    expect(await claimActions(U, 5, "ext")).toHaveLength(0)
    await db.query("UPDATE platform_flags SET enabled = false")
    expect((await claimActions(U, 5, "ext")).map((g) => g.id)).toEqual([a.id])
  })
  it("revoking the authorization returns the action to approval, and it cannot be claimed", async () => {
    const a = await enqueueAction(U, act({ autoApprove: true }))
    const auth = await one("SELECT id, org_id FROM send_authorizations")
    await revokeAuthorization(auth.org_id, auth.id, { userId: U }, "stop")
    expect((await one("SELECT status FROM li_action_queue WHERE id = $1", [a.id])).status).toBe("pending_approval")
    expect(await claimActions(U, 5, "ext")).toHaveLength(0)
  })
  it("an expired approval cannot be claimed and is returned to approval by the executor", async () => {
    const a = await enqueueAction(U, act({ autoApprove: true }))
    await db.query("UPDATE send_authorizations SET expires_at = now() - interval '1 hour'")
    expect(await claimActions(U, 5, "ext")).toHaveLength(0)
    await runExecutor(deps)
    expect((await one("SELECT status FROM li_action_queue WHERE id = $1", [a.id])).status).toBe("pending_approval")
    expect((await items())[0].status).toBe("expired")
  })
  it("an action edited after approval is failed, not handed to the extension", async () => {
    const a = await enqueueAction(U, act({ autoApprove: true }))
    await db.query("UPDATE li_action_queue SET payload = '{\"message\":\"Something else entirely\"}' WHERE id = $1", [a.id])
    expect(await claimActions(U, 5, "ext")).toHaveLength(0)
    expect(await one("SELECT status, failed_reason FROM li_action_queue WHERE id = $1", [a.id])).toMatchObject({ status: "failed", failed_reason: "edited after it was approved" })
    expect((await items())[0].status).toBe("failed")
  })
  it("a stranded claim is recovered: back to approved for a retry, failed at the attempt limit; the executor never touches linkedin items", async () => {
    const a = await enqueueAction(U, act({ autoApprove: true }))
    await claimActions(U, 5, "ext")
    await db.query("UPDATE li_action_queue SET claimed_at = now() - interval '20 minutes' WHERE id = $1", [a.id])
    await runExecutor(deps) // the executor's stale recovery must leave LinkedIn items to the queue's own reclaim
    expect((await items())[0].status).toBe("sending")
    await reclaimStaleActions(U)
    expect((await items())[0].status).toBe("approved")
    expect((await claimActions(U, 5, "ext")).map((g) => g.id)).toEqual([a.id])
    await db.query("UPDATE li_action_queue SET claimed_at = now() - interval '20 minutes', attempts = 3 WHERE id = $1", [a.id])
    await reclaimStaleActions(U)
    expect((await items())[0].status).toBe("failed")
  })
  it("a record that cannot be written undoes the approval", async () => {
    const a = await enqueueAction(U, act())
    await db.exec("ALTER TABLE send_items RENAME TO send_items_x")
    try { await expect(approveActions(U, [a.id], "u1")).rejects.toThrow() } finally { await db.exec("ALTER TABLE send_items_x RENAME TO send_items") }
    expect((await one("SELECT status FROM li_action_queue WHERE id = $1", [a.id])).status).toBe("pending_approval")
    expect(await claimActions(U, 5, "ext")).toHaveLength(0)
  })
})
