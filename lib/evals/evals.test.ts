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
  await db.exec("CREATE TABLE memberships (org_id text, user_id text, org_role text);")
  for (const f of ["2026-10-05-action-proposals", "2026-10-05b-agent-runtime", "2026-10-05c-agents-complete"]) await db.exec(readFileSync(`scripts/migrations/${f}.sql`, "utf8"))
  h.sql.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => (await db.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values.map((v) => (Array.isArray(v) ? v : v)))).rows)
}, 30000)
afterAll(async () => db.close())
beforeEach(async () => { await db.exec("DELETE FROM agent_settings; DELETE FROM agent_executions; DELETE FROM action_proposals; DELETE FROM memberships; DELETE FROM eval_runs") })

describe("static evals", () => {
  for (const c of staticCases) it(c.name, async () => { const r = await c.run(); expect(r.detail).toBeTruthy(); expect(r.ok, r.detail).toBe(true) })
})

describe("live evals", () => {
  const byName = (n: string) => liveCases.find((c) => c.name.startsWith(n))!
  it("all pass on clean data", async () => { for (const o of await runCases("live", liveCases)) expect(o.ok, `${o.name}: ${o.detail}`).toBe(true) })
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
    expect((await runAll()).every((o) => o.ok)).toBe(true)
  })
})
