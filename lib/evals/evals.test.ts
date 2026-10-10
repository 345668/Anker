/** The evals are part of the suite that gates the build (docs/architecture/45 §2). Static cases must all pass; each live case must pass on clean data and catch a planted violation. */
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
const h = vi.hoisted(() => ({ sql: vi.fn() as any }))
vi.mock("@/lib/db", () => ({ sql: h.sql }))
import { staticCases, liveCases } from "./cases"
import { runCases, store, runAll } from "./runner"

let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec("CREATE TABLE memberships (org_id text, user_id text, org_role text); CREATE TABLE audit_events (action text, target_label text, created_at timestamptz DEFAULT now()); CREATE TABLE platform_flags (key text PRIMARY KEY, enabled boolean DEFAULT false, rollout_pct int DEFAULT 100, description text, updated_at timestamptz DEFAULT now()); CREATE TABLE outreach_messages (id text PRIMARY KEY, status text, sent_at timestamptz);")
  for (const f of ["2026-10-05-action-proposals", "2026-10-05b-agent-runtime", "2026-10-05c-agents-complete", "2026-10-06-send-authorizations", "2026-10-06b-send-auth-sources", "2026-10-07b-ai-media-studio", "2026-10-09-ai-media-studio-v2", "2026-10-10-ai-media-studio-comfy"]) await db.exec(readFileSync(`scripts/migrations/${f}.sql`, "utf8"))
  h.sql.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => (await db.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values.map((v) => (Array.isArray(v) ? v : v)))).rows)
}, 30000)
afterAll(async () => db.close())
beforeEach(async () => { await db.exec("DELETE FROM agent_settings; DELETE FROM agent_executions; DELETE FROM action_proposals; DELETE FROM memberships; DELETE FROM eval_runs; DELETE FROM send_items; DELETE FROM send_authorizations; DELETE FROM outreach_messages; DELETE FROM audit_events") })

describe("static evals", () => {
  for (const c of staticCases) it(c.name, async () => { const r = await c.run(); expect(r.detail).toBeTruthy(); expect(r.ok, r.detail).toBe(true) })
})

describe("live evals", () => {
  const byName = (n: string) => liveCases.find((c) => c.name.startsWith(n))!
  it("all pass on clean data", async () => { for (const o of await runCases("live", liveCases.filter((c) => !c.name.startsWith("every column")))) expect(o.ok, `${o.name}: ${o.detail}`).toBe(true) })
  it("catch a planted violation each", async () => {
    await db.exec("INSERT INTO agent_settings (org_id, agent_id, enabled, enabled_by) VALUES ('o1','ghost_agent',true,'u1'), ('o2','pipeline_keeper',true,'gone')")
    await db.exec("INSERT INTO memberships VALUES ('o2','other','member')")
    await db.exec("INSERT INTO agent_executions (org_id, agent_id, trigger, status, heartbeat_at) VALUES ('o2','pipeline_keeper','manual','running', now() - interval '2 hours')")
    await db.exec("INSERT INTO agent_executions (org_id, agent_id, trigger, status, spend_usd, created_at) VALUES ('o2','pipeline_keeper','manual','failed', 0.5, now())")
    await db.exec("INSERT INTO action_proposals (org_id, requested_by, capability, summary, risk_class, status, idempotency_key, agent_id) VALUES ('o2','u','crm_add_task','x','R0','applied','k1','pipeline_keeper')")
    for (const name of ["every enabled agent setting names", "every enabled agent was enabled", "no run has sat running", "every applied proposal", "agents with no model budget", "no agent run failed"]) {
      const r = await byName(name).run(); expect(r.ok, name).toBe(false)
    }
  })
  it("catches sends under the wrong approver, after a revoke, over the cap, stuck, and reports the shadow log", async () => {
    await db.exec(`INSERT INTO send_authorizations (id, org_id, sender_user_id, provider, source, approved_by, digest, expires_at, status, revoked_at) VALUES
      ('a1','o','sender','resend','manual_batch','someone-else','d', now() + interval '1 day','active', NULL), ('a2','o','sender','resend','manual_batch','sender','d', now() + interval '1 day','revoked', now() - interval '1 hour')`)
    await db.exec(`INSERT INTO send_items (authorization_id, org_id, message_id, recipients, content_hash, idempotency_key, status, sent_at) VALUES ('a1','o','m1','{}','h','k1','sent', now()), ('a2','o','m2','{}','h','k2','sent', now())`)
    expect((await byName("every message sent through an authorization").run()).ok).toBe(false)
    await db.exec("DELETE FROM send_items; DELETE FROM send_authorizations")
    await db.exec("INSERT INTO send_authorizations (id, org_id, sender_user_id, provider, source, approved_by, digest, expires_at) VALUES ('a3','o','s','resend','manual_batch','s','d', now() + interval '1 day')")
    for (let i = 0; i < 51; i++) await db.query("INSERT INTO send_items (authorization_id, org_id, message_id, recipients, content_hash, idempotency_key, status, sent_at) VALUES ('a3','o',$1,'{}','h',$2,'sent', now())", [`m${i}`, `k${i}`])
    expect((await byName("no sender went over the daily cap").run()).ok).toBe(false)
    await db.exec("DELETE FROM send_items"); await db.exec("INSERT INTO send_items (authorization_id, org_id, message_id, recipients, content_hash, idempotency_key, status, claimed_at) VALUES ('a3','o','m','{}','h','k','sending', now() - interval '2 hours')")
    expect((await byName("no sender went over the daily cap").run()).ok).toBe(false)
    await db.exec("INSERT INTO audit_events (action, target_label) VALUES ('send.unauthorized_path','investor-update'), ('send.unauthorized_path','investor-update')")
    const shadow = await byName("sends that skipped authorization").run(); expect(shadow.ok).toBe(true); expect(shadow.detail).toMatch(/investor-update 2/)
  })
  it("catches a message sent without an authorization after the paths moved, and a send logged after enforcement was switched on", async () => {
    await db.exec("INSERT INTO send_authorizations (id, org_id, sender_user_id, provider, source, approved_by, digest, expires_at, approved_at) VALUES ('p3','o','u','resend','direct','u','d', now() + interval '1 day', now() - interval '1 hour')")
    await db.exec("INSERT INTO outreach_messages VALUES ('m-ok','sent', now()), ('m-old','sent', now() - interval '3 hours')")
    await db.exec("INSERT INTO send_items (authorization_id, org_id, message_id, recipients, content_hash, idempotency_key, status, sent_at) VALUES ('p3','o','m-ok','{}','h','k1','sent', now())")
    expect((await byName("every outreach message sent since").run()).ok).toBe(true) // m-old was sent before the cutover; m-ok has a sent item
    await db.exec("INSERT INTO outreach_messages VALUES ('m-bad','sent', now())")
    expect((await byName("every outreach message sent since").run()).ok).toBe(false)
    expect((await byName("if enforcement is on").run()).ok).toBe(true) // off
    await db.exec("INSERT INTO platform_flags (key, enabled, updated_at) VALUES ('outreach_require_authorization', true, now() - interval '1 hour') ON CONFLICT (key) DO UPDATE SET enabled = true, updated_at = now() - interval '1 hour'")
    await db.exec("INSERT INTO audit_events (action, target_label) VALUES ('send.unauthorized_path','x')")
    expect((await byName("if enforcement is on").run()).ok).toBe(false)
  })
  it("the schema check names every missing table and column", async () => {
    const r = await byName("every column").run()
    expect(r.ok).toBe(false); expect(r.detail).toMatch(/crm_entries \(table\)/) // the test database has no CRM tables: the check reports it rather than passing
  })
  it("catches a duplicated period (the unique index is dropped to plant one)", async () => {
    await db.exec("DROP INDEX agent_executions_period_idx")
    await db.exec("INSERT INTO agent_executions (org_id, agent_id, trigger, period_key) VALUES ('o','weekly_brief','schedule','2026-W41'), ('o','weekly_brief','schedule','2026-W41')")
    expect((await byName("no workspace has two").run()).ok).toBe(false)
    await db.exec("DELETE FROM agent_executions; CREATE UNIQUE INDEX agent_executions_period_idx ON agent_executions (org_id, agent_id, period_key) WHERE trigger IN ('schedule','event')")
  })
})

describe("runner", () => {
  it("stores results and a thrown case is a failure, not a crash", async () => {
    const out = await runCases("t", [{ name: "boom", run: () => { throw new Error("x") } }, { name: "fine", run: () => ({ ok: true, detail: "ok" }) }])
    expect(out.map((o) => o.ok)).toEqual([false, true]); expect(out[0].detail).toMatch(/threw: x/)
    await store(out); expect(((await db.query("SELECT count(*)::int n FROM eval_runs")).rows[0] as any).n).toBe(2)
    // On the test database only the live-schema check fails (it has no CRM tables); everything else passes.
    expect((await runAll()).filter((o) => !o.ok).map((o) => o.name)).toEqual([expect.stringMatching(/^every column/)])
  })
})
