/** The R2 capability that proposes sending a batch: the preview is the proposal, only the sender approves it, a changed batch is refused, and nothing sends by itself. docs/architecture/46 §6. Provider stubbed. */
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
const h = vi.hoisted(() => ({ sql: vi.fn() as any, audit: vi.fn(), sent: [] as any[] }))
vi.mock("@/lib/db", () => ({ sql: h.sql }))
vi.mock("@/lib/audit/record-change", () => ({ recordChange: h.audit }))
vi.mock("@/lib/outreach/deliverability", () => ({ isEmailSuppressed: async () => false }))
vi.mock("@/lib/agents/crm-sync", () => ({ syncCrmStageFromOutreach: async () => ({}) }))
vi.mock("@/lib/email/resend", () => ({ sendEmail: async (i: any) => { h.sent.push(i); return { resendId: "re_" + h.sent.length, messageId: i.messageId, finalFrom: "me@summit.test", finalSubject: i.subject, droppedRecipients: [] } }, isResendConfigured: () => true }))
process.env.SECRET_KEY = "send-batch-test"
import { propose, decide, setAutonomy } from "./store"
import { CAPABILITIES } from "./capabilities"
import { mayPropose, bulkApprovable } from "./model"
import { suppressGlobally } from "@/lib/email/unsubscribe"

let db: PGlite
const U = "u1", ORG = "org-a", A = { orgId: ORG, userId: U, persona: "founder" }
const one = async (q: string, p: unknown[] = []) => (await db.query(q, p)).rows[0] as any
const all = async (q: string, p: unknown[] = []) => (await db.query(q, p)).rows as any[]
const seed = async (n: number, prefix = "p") => { for (let i = 0; i < n; i++) {
  await db.query("INSERT INTO crm_entries (id, org_id, display_name, display_email, stage) VALUES ($1,$2,$3,$4,'queued')", [`${prefix}e${i}`, ORG, `Person ${i}`, `${prefix}${i}@fund.com`])
  await db.query("INSERT INTO outreach_messages (id, user_id, crm_entry_id, kind, step_number, channel, body, subject, status) VALUES ($1,$2,$3,'email_intro',0,'email','A real message body for the recipient.','Hi','draft')", [`${prefix}m${i}`, U, `${prefix}e${i}`]) } }
const ids = (n: number, prefix = "p") => Array.from({ length: n }, (_, i) => `${prefix}m${i}`)
const trusted = { runId: "r1", trust: "trusted" as const }
const proposeBatch = (messageIds: string[], ctx: any = trusted, extra: Record<string, unknown> = {}) => propose(A, "outreach_send_batch", { messageIds, ...extra }, ctx, { userId: U })

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE crm_entries (id text PRIMARY KEY, org_id text, display_name text, display_email text, stage text, last_contacted_at timestamptz, updated_at timestamptz DEFAULT now());
    CREATE TABLE outreach_messages (id text PRIMARY KEY, user_id text, crm_entry_id text, kind text, step_number int DEFAULT 0, channel text, body text, subject text, email_to text, status text DEFAULT 'draft', scheduled_for timestamptz, sent_at timestamptz,
      bounced_at timestamptz, complained_at timestamptz, tracking_id text, resend_id text, email_message_id text, email_from text, generated_by text, call_id text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE outreach_replies (id serial PRIMARY KEY, crm_entry_id text);
    CREATE TABLE outreach_campaigns (id text PRIMARY KEY, cc_emails jsonb, bcc_emails jsonb, default_send_provider text, default_send_account_id text);
    CREATE TABLE outreach_campaign_members (id serial PRIMARY KEY, campaign_id text, user_id text, crm_entry_id text, status text, sent_at timestamptz, updated_at timestamptz);
    CREATE TABLE email_oauth_accounts (id text PRIMARY KEY, user_id text, email text, status text, is_default boolean DEFAULT false);
    CREATE TABLE email_suppressions (id bigserial PRIMARY KEY, user_id text, email text NOT NULL, reason text, source text, created_at timestamptz DEFAULT now());
    CREATE TABLE investors (email text, norm_country text, investor_country text);
    CREATE TABLE organizations (id text PRIMARY KEY, name text);
    CREATE TABLE platform_flags (key text PRIMARY KEY, enabled boolean DEFAULT false, rollout_pct int DEFAULT 100, description text);
    CREATE TABLE entity_memory (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, org_id text, entity_type text, entity_id text, key text, value text, valid_until timestamptz);
    CREATE TABLE audit_events (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, actor_id text, actor_email text, action text NOT NULL, target_type text, target_id text, target_label text, metadata jsonb DEFAULT '{}'::jsonb, ip text, user_agent text, created_at timestamptz DEFAULT now());
    CREATE TABLE agent_events (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, org_id text, kind text, subject_id text, payload jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now(), processed_at timestamptz);`)
  for (const f of ["2026-10-03-outreach-consents", "2026-10-05-action-proposals", "2026-10-06-send-authorizations"]) await db.exec(readFileSync(`scripts/migrations/${f}.sql`, "utf8"))
  await db.exec("ALTER TABLE action_proposals ADD COLUMN IF NOT EXISTS agent_id text; ALTER TABLE action_proposals ADD COLUMN IF NOT EXISTS execution_id text;")
  h.sql.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => (await db.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values)).rows)
}, 30000)
afterAll(async () => db.close())
beforeEach(async () => {
  await db.exec("DELETE FROM send_items; DELETE FROM send_authorizations; DELETE FROM action_proposals; DELETE FROM workspace_autonomy; DELETE FROM outreach_messages; DELETE FROM crm_entries; DELETE FROM email_suppressions; DELETE FROM outreach_replies; DELETE FROM audit_events; UPDATE platform_flags SET enabled = false")
  h.sent.length = 0; h.audit.mockReset(); h.audit.mockResolvedValue(undefined)
})

describe("proposing a send", () => {
  it("is a preview: who, what, from where, what is left out; nothing is queued or sent", async () => {
    await seed(3); await seed(1, "s"); await suppressGlobally("s0@fund.com", "unsubscribed", "recipient")
    const r = await proposeBatch([...ids(3), "sm0"])
    expect(r.applied).toBe(false); expect(r.proposal.risk_class).toBe("R2"); expect(r.proposal.status).toBe("pending")
    expect(r.proposal.summary).toMatch(/Send 3 emails from Resend/)
    expect(r.proposal.diff.map((d: any) => d.label)).toEqual(expect.arrayContaining([expect.stringMatching(/To Person 0 <p0@fund\.com>/), expect.stringMatching(/Not sent \(1\)/)]))
    expect(r.proposal.evidence).toMatchObject({ count: 3, blocked: 1, requiresTypedCount: false }); expect(r.proposal.evidence.note).toMatch(/cannot be recalled/)
    expect(r.proposal.input.digest).toMatch(/^[0-9a-f]{40}$/); expect(r.proposal.input.count).toBe(3)
    expect((await one("SELECT count(*)::int n FROM send_authorizations")).n).toBe(0); expect((await all("SELECT status FROM outreach_messages")).every((m) => m.status === "draft")).toBe(true); expect(h.sent).toHaveLength(0)
  })
  it("refuses a batch with nothing sendable, an unknown message and a request with no ids", async () => {
    await seed(1); await suppressGlobally("p0@fund.com", "unsubscribed", "recipient")
    await expect(proposeBatch(["pm0"])).rejects.toThrow(/Nothing in this batch can be sent/)
    await expect(proposeBatch(["nope"])).rejects.toThrow(/Nothing in this batch can be sent/)
    await expect(proposeBatch([])).rejects.toThrow(/messageIds is required/)
    await expect(proposeBatch(Array.from({ length: 101 }, (_, i) => `x${i}`))).rejects.toThrow(/At most 100/)
  })
  it("a run that read outside content cannot create it at all", async () => {
    await seed(1)
    await expect(proposeBatch(["pm0"], { runId: "r", trust: "untrusted" })).rejects.toThrow(/cannot propose sending email/)
    expect((await one("SELECT count(*)::int n FROM action_proposals")).n).toBe(0)
    expect(mayPropose("R2", "untrusted")).toMatch(/new conversation/); expect(mayPropose("R0", "untrusted")).toBeNull()
  })
  it("never auto-commits, even with automatic low-risk changes switched on", async () => {
    await seed(1); await setAutonomy(ORG, "R0", true, { userId: U })
    const r = await proposeBatch(["pm0"]); expect(r.applied).toBe(false); expect(r.proposal.auto_committed).toBe(false); expect(h.sent).toHaveLength(0)
  })
  it("the same request in the same run is one proposal", async () => {
    await seed(2); const a = await proposeBatch(ids(2)), b = await proposeBatch([...ids(2)].reverse())
    expect(b.proposal.id).toBe(a.proposal.id); expect((await one("SELECT count(*)::int n FROM action_proposals")).n).toBe(1)
  })
})

describe("approving it", () => {
  it("the sender's approval authorizes exactly the previewed batch and the executor sends it", async () => {
    await seed(3); const r = await proposeBatch(ids(3))
    const out = await decide(ORG, r.proposal.id, "approve", { userId: U, email: "u1@x.test" })
    expect(out.proposal.status).toBe("applied"); expect(out.message).toMatch(/3 approved: 3 sent now/)
    expect(h.sent.map((s) => s.to).sort()).toEqual(["p0@fund.com", "p1@fund.com", "p2@fund.com"])
    expect((await one("SELECT source, proposal_id, approved_by, status FROM send_authorizations"))).toMatchObject({ source: "proposal", proposal_id: r.proposal.id, approved_by: U, status: "completed" })
    expect((out.proposal as any).undo).toMatchObject({ authorized: 3 })
  })
  it("someone other than the sender cannot approve it, and the proposal stays pending", async () => {
    await seed(1); const r = await proposeBatch(["pm0"])
    await expect(decide(ORG, r.proposal.id, "approve", { userId: "owner-2" })).rejects.toThrow(/Only the person whose drafts/)
    expect((await one("SELECT status FROM action_proposals")).status).toBe("pending"); expect(h.sent).toHaveLength(0)
    expect((await decide(ORG, r.proposal.id, "approve", { userId: U })).proposal.status).toBe("applied")
  })
  it("over 25 messages needs the typed count, and forgetting it leaves the proposal pending", async () => {
    await seed(30); const r = await proposeBatch(ids(30)); expect(r.proposal.evidence.requiresTypedCount).toBe(true)
    await expect(decide(ORG, r.proposal.id, "approve", { userId: U })).rejects.toThrow(/type the number \(30\)/)
    await expect(decide(ORG, r.proposal.id, "approve", { userId: U }, { typedCount: 29 })).rejects.toThrow(/type the number/)
    expect((await one("SELECT status FROM action_proposals")).status).toBe("pending")
    const ok = await decide(ORG, r.proposal.id, "approve", { userId: U }, { typedCount: 30 }); expect(ok.proposal.status).toBe("applied")
    expect(h.sent.length).toBeGreaterThan(0); expect(h.sent.length).toBeLessThanOrEqual(25) // the rest wait for the cap and the cron
    expect((await one("SELECT count(*)::int n FROM send_items WHERE status = 'approved'")).n).toBe(30 - h.sent.length)
  })
  it("a batch that changed since it was proposed is refused, not sent, and stays pending", async () => {
    await seed(2); const r = await proposeBatch(ids(2))
    await db.query("UPDATE outreach_messages SET body = 'edited after the proposal was made, so it differs' WHERE id = 'pm1'")
    await expect(decide(ORG, r.proposal.id, "approve", { userId: U })).rejects.toThrow(/changed since it was proposed/)
    expect((await one("SELECT status FROM action_proposals")).status).toBe("pending"); expect(h.sent).toHaveLength(0)
    await suppressGlobally("p0@fund.com", "unsubscribed", "recipient")
    await expect(decide(ORG, r.proposal.id, "approve", { userId: U })).rejects.toThrow(/changed since it was proposed/)
  })
  it("platform sending paused: approved, queued, and the message says so", async () => {
    await seed(2); await db.query("INSERT INTO platform_flags (key, enabled) VALUES ('outreach_sending_paused', true) ON CONFLICT (key) DO UPDATE SET enabled = true")
    const out = await decide(ORG, (await proposeBatch(ids(2))).proposal.id, "approve", { userId: U })
    expect(out.message).toMatch(/Sending is paused for the whole platform/); expect(h.sent).toHaveLength(0); expect((await one("SELECT count(*)::int n FROM send_items WHERE status = 'approved'")).n).toBe(2)
  })
  it("a rejected proposal changes nothing and cannot be approved afterwards", async () => {
    await seed(1); const r = await proposeBatch(["pm0"]); await decide(ORG, r.proposal.id, "reject", { userId: U })
    await expect(decide(ORG, r.proposal.id, "approve", { userId: U })).rejects.toThrow(/rejected/); expect(h.sent).toHaveLength(0)
  })
})

describe("undo", () => {
  it("stops what has not gone and says what already did", async () => {
    await seed(5); await db.query("INSERT INTO platform_flags (key, enabled) VALUES ('outreach_sending_paused', true) ON CONFLICT (key) DO UPDATE SET enabled = true")
    const r = await proposeBatch(ids(5)); await decide(ORG, r.proposal.id, "approve", { userId: U })
    const u = await decide(ORG, r.proposal.id, "undo", { userId: U }); expect(u.message).toMatch(/5 not yet sent were stopped/); expect(u.proposal.status).toBe("undone")
    expect((await all("SELECT status FROM outreach_messages")).every((m) => m.status === "draft")).toBe(true)
  })
  it("when everything has already gone there is nothing to stop, and it says so honestly", async () => {
    await seed(2); const r = await proposeBatch(ids(2)); await decide(ORG, r.proposal.id, "approve", { userId: U })
    await expect(decide(ORG, r.proposal.id, "undo", { userId: U })).rejects.toThrow(/all 2 had already been sent.*cannot be recalled/)
    expect((await one("SELECT status FROM action_proposals")).status).toBe("applied")
  })
})

describe("what the inbox and the bulk approval do", () => {
  it("sending is never covered by Approve all", () => { expect(bulkApprovable("R0")).toBe(true); expect(bulkApprovable("R1")).toBe(true); expect(bulkApprovable("R2")).toBe(false) })
  it("the capability declares the approver and typed-count precheck", () => { expect(CAPABILITIES.outreach_send_batch.risk).toBe("R2"); expect(typeof CAPABILITIES.outreach_send_batch.precheck).toBe("function") })
})
