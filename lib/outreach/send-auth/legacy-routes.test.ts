/** The two old send routes now go through send authorizations and keep their response shapes. docs/architecture/46 §7 P1. Provider stubbed: nothing is sent. */
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
const h = vi.hoisted(() => ({ sql: vi.fn() as any, sent: [] as any[], user: { id: "u1", email: "u1@x.test" } as any, org: "org-a" }))
vi.mock("@/lib/db", () => ({ sql: h.sql }))
vi.mock("@/lib/audit/record-change", () => ({ recordChange: vi.fn() }))
vi.mock("@/lib/auth/acting-user", () => ({ resolveActingUser: async () => h.user }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }) }))
vi.mock("@/lib/crm/workspace", () => ({ crmWorkspaceResponse: async () => ({ orgId: h.org, userId: "u1", canWrite: true, canSendOutreach: true, role: "workspace_owner" }) }))
vi.mock("@/lib/outreach/deliverability", () => ({ isEmailSuppressed: async () => false }))
vi.mock("@/lib/agents/crm-sync", () => ({ syncCrmStageFromOutreach: async () => ({}) }))
vi.mock("@/lib/email/resend", () => ({ isResendConfigured: () => true, sendEmail: async (i: any) => { h.sent.push(i); return { resendId: "re_1", messageId: i.messageId, finalFrom: "me@summit.test", finalSubject: i.subject, droppedRecipients: [] } } }))
vi.mock("@/lib/email/gmail", () => ({ isGmailOAuthConfigured: () => false, loadGmailAccount: async () => null, sendGmail: async () => ({ ok: false, error: "no" }) }))
process.env.SECRET_KEY = "legacy-routes"
import { POST as sendEmailRoute } from "@/app/api/outreach/send-email/route"
import { POST as bulkRoute } from "@/app/api/outreach/campaigns/[id]/send/route"
import { suppressGlobally } from "@/lib/email/unsubscribe"

let db: PGlite
const one = async (q: string, p: unknown[] = []) => (await db.query(q, p)).rows[0] as any
const req = (body: unknown) => new Request("http://x.test/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as any
const entry = (id: string, email: string | null) => db.query("INSERT INTO crm_entries (id, org_id, display_name, display_email, stage) VALUES ($1,'org-a',$2,$3,'queued')", [id, id, email])
const msg = (id: string, e: string, over: Record<string, unknown> = {}) => db.query("INSERT INTO outreach_messages (id, user_id, crm_entry_id, kind, step_number, channel, body, subject, status) VALUES ($1,$2,$3,'email_intro',0,'email','A real message body for the recipient.','Hi',$4)", [id, over.user ?? "u1", e, over.status ?? "draft"])

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE crm_entries (id text PRIMARY KEY, org_id text, display_name text, display_email text, stage text, last_contacted_at timestamptz, updated_at timestamptz DEFAULT now());
    CREATE TABLE outreach_messages (id text PRIMARY KEY, user_id text, crm_entry_id text, kind text, step_number int DEFAULT 0, channel text, body text, subject text, email_to text, status text DEFAULT 'draft', scheduled_for timestamptz, sent_at timestamptz,
      bounced_at timestamptz, complained_at timestamptz, tracking_id text, resend_id text, email_message_id text, email_from text, generated_by text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE outreach_replies (id serial PRIMARY KEY, crm_entry_id text);
    CREATE TABLE outreach_campaigns (id text PRIMARY KEY, user_id text, cc_emails jsonb, bcc_emails jsonb, default_send_provider text, default_send_account_id text);
    CREATE TABLE outreach_campaign_members (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, campaign_id text, user_id text, crm_entry_id text, status text, sent_at timestamptz, added_at timestamptz DEFAULT now(), updated_at timestamptz);
    CREATE TABLE email_oauth_accounts (id text PRIMARY KEY, user_id text, email text, status text, is_default boolean DEFAULT false);
    CREATE TABLE email_suppressions (id bigserial PRIMARY KEY, user_id text, email text NOT NULL, reason text, source text, created_at timestamptz DEFAULT now());
    CREATE TABLE investors (email text, norm_country text, investor_country text);
    CREATE TABLE platform_flags (key text PRIMARY KEY, enabled boolean DEFAULT false, rollout_pct int DEFAULT 100, description text);
    CREATE TABLE entity_memory (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, org_id text, entity_type text, entity_id text, key text, value text, valid_until timestamptz);
    CREATE TABLE audit_events (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, actor_id text, actor_email text, action text NOT NULL, target_type text, target_id text, target_label text, metadata jsonb DEFAULT '{}'::jsonb, ip text, user_agent text, created_at timestamptz DEFAULT now());`)
  for (const f of ["2026-10-03-outreach-consents", "2026-10-06-send-authorizations"]) await db.exec(readFileSync(`scripts/migrations/${f}.sql`, "utf8"))
  h.sql.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => (await db.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values)).rows)
}, 30000)
afterAll(async () => db.close())
beforeEach(async () => { await db.exec("DELETE FROM send_items; DELETE FROM send_authorizations; DELETE FROM outreach_messages; DELETE FROM crm_entries; DELETE FROM outreach_campaigns; DELETE FROM outreach_campaign_members; DELETE FROM email_suppressions; DELETE FROM outreach_consents"); h.sent.length = 0 })

describe("POST /api/outreach/send-email", () => {
  it("sends one message under an authorization and answers in the old shape", async () => {
    await entry("e1", "ann@fund.com"); await msg("m1", "e1")
    const r = await sendEmailRoute(req({ messageId: "m1" })); const j = await r.json()
    expect(r.status).toBe(200); expect(j).toMatchObject({ ok: true, provider: "resend", resendId: "re_1", from: "me@summit.test", providerConfigured: true }); expect(j.authorizationId).toBeTruthy()
    expect(h.sent).toHaveLength(1); expect(h.sent[0]).toMatchObject({ to: "ann@fund.com", via: "send-executor" })
    expect((await one("SELECT status FROM outreach_messages WHERE id='m1'")).status).toBe("sent")
    expect((await one("SELECT source, status FROM send_authorizations"))).toMatchObject({ source: "manual_single", status: "completed" })
  })
  it("refuses with the old status codes and a reason, and sends nothing", async () => {
    await entry("e1", "ann@fund.com"); await msg("m1", "e1"); await entry("e2", "gone@fund.com"); await msg("m2", "e2"); await suppressGlobally("gone@fund.com", "unsubscribed", "recipient")
    await entry("e3", "x@fund.de"); await msg("m3", "e3"); await entry("e4", null); await msg("m4", "e4"); await msg("m5", "e1", { user: "u2" })
    const code = async (id: string) => (await sendEmailRoute(req({ messageId: id }))).status
    expect(await code("m2")).toBe(409); expect(await code("m3")).toBe(409); expect(await code("m4")).toBe(400); expect(await code("m5")).toBe(403); expect(await code("nope")).toBe(404)
    expect(await (await sendEmailRoute(req({}))).status).toBe(400); expect(h.sent).toHaveLength(0)
  })
  it("a message that has already gone is refused, not sent again", async () => {
    await entry("e1", "ann@fund.com"); await msg("m1", "e1", { status: "sent" })
    const r = await sendEmailRoute(req({ messageId: "m1" })); expect(r.status).toBe(409); expect((await r.json()).error).toMatch(/Already sent/); expect(h.sent).toHaveLength(0)
  })
})

describe("POST /api/outreach/campaigns/[id]/send", () => {
  const ctx = { params: Promise.resolve({ id: "c1" }) }
  const setup = async (n: number) => {
    await db.query("INSERT INTO outreach_campaigns (id, user_id) VALUES ('c1','u1')")
    for (let i = 0; i < n; i++) { await entry(`e${i}`, `p${i}@fund.com`); await msg(`m${i}`, `e${i}`); await db.query("INSERT INTO outreach_campaign_members (campaign_id, user_id, crm_entry_id, status) VALUES ('c1','u1',$1,'drafted')", [`e${i}`]) }
  }
  it("refuses a send that does not name its recipients", async () => {
    await setup(3)
    expect((await bulkRoute(req({}), ctx)).status).toBe(400); expect((await bulkRoute(req({ all: true }), ctx)).status).toBe(400); expect(h.sent).toHaveLength(0)
    const wrong = await bulkRoute(req({ all: true, expectedCount: 2 }), ctx); expect(wrong.status).toBe(409); expect(h.sent).toHaveLength(0)
  })
  it("previews the count without sending", async () => {
    await setup(3); const j = await (await bulkRoute(req({ all: true, preview: true }), ctx)).json()
    expect(j).toMatchObject({ preview: true, count: 3, sendable: 3 }); expect(h.sent).toHaveLength(0)
  })
  it("sends the named batch under one authorization and reports each member", async () => {
    await setup(3); const r = await bulkRoute(req({ all: true, expectedCount: 3 }), ctx); const j = await r.json()
    expect(j).toMatchObject({ ok: true, sent: 3, failed: 0, skipped: 0, waiting: 0 }); expect(j.results.map((x: any) => x.status)).toEqual(["sent", "sent", "sent"])
    expect((await one("SELECT count(*)::int n FROM send_authorizations")).n).toBe(1); expect((await one("SELECT status FROM outreach_campaign_members WHERE crm_entry_id='e0'")).status).toBe("sent")
  })
  it("leaves out an opted-out member with the reason, and sends the rest", async () => {
    await setup(3); await suppressGlobally("p1@fund.com", "unsubscribed", "recipient")
    const j = await (await bulkRoute(req({ memberIds: (await db.query("SELECT id FROM outreach_campaign_members")).rows.map((r: any) => r.id) }), ctx)).json()
    expect(j).toMatchObject({ sent: 2, skipped: 1 }); expect(j.results.find((x: any) => x.status === "skipped").error).toMatch(/Opted out/)
  })
  it("a batch over 25 needs the typed count, and a long one spreads over the daily cap", async () => {
    await setup(30)
    const no = await bulkRoute(req({ all: true, expectedCount: 30 }), ctx); expect(no.status).toBe(409); expect((await no.json()).needsTypedCount).toBe(true); expect(h.sent).toHaveLength(0)
    const yes = await (await bulkRoute(req({ all: true, expectedCount: 30, typedCount: 30 }), ctx)).json()
    expect(yes.sent + yes.waiting).toBe(30); expect(yes.sent).toBeLessThanOrEqual(30)
  })
})
