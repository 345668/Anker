/** The agent runtime end to end against a real Postgres (PGlite) with the real migrations. docs/architecture/44 §9. */
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
const h = vi.hoisted(() => ({ sql: vi.fn() as any, audit: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: h.sql }))
vi.mock("@/lib/audit/record-change", () => ({ recordChange: h.audit }))
import { createExecution, runExecution, dispatch, setEnabled, killReason, type Deps } from "./engine"
import { DEFINITIONS } from "./definitions"
import { CAPABILITIES } from "@/lib/actions/capabilities"
import { isDue, periodKey, parseSchedule, withinCeiling } from "./model"

let db: PGlite
let allowed = async (_o: string) => {}
let principalFor = async (userId: string, orgId: string) => ({ userId, orgId, persona: "founder" as const, canWrite: true })
let clock = new Date("2026-10-05T08:00:00Z") // a Monday
const deps: Deps = { principal: (u, o) => principalFor(u, o), allowed: (o) => allowed(o), now: () => clock }
const who = { userId: "u1", email: "u1@x.test" }
const one = async (q: string, p: unknown[] = []) => (await db.query(q, p)).rows[0] as any
const all = async (q: string, p: unknown[] = []) => (await db.query(q, p)).rows as any[]
const stale = (org: string, name: string, daysAgo: number, over: { stage?: string; id?: string } = {}) =>
  db.query("INSERT INTO crm_entries (id, org_id, display_name, stage, last_contacted_at, updated_at) VALUES ($1,$2,$3,$4, now() - ($5 || ' days')::interval, now())", [over.id ?? `e-${name}`, org, name, over.stage ?? "contacted", String(daysAgo)])

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE crm_entries (id text PRIMARY KEY, org_id text, display_name text, stage text, last_contacted_at timestamptz, updated_at timestamptz DEFAULT now());
    CREATE TABLE crm_tasks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id text, user_id text, crm_entry_id text, title text, due_at timestamptz, done_at timestamptz);
    CREATE TABLE platform_flags (key text PRIMARY KEY, enabled boolean DEFAULT false, rollout_pct int DEFAULT 100);`)
  await db.exec(readFileSync("scripts/migrations/2026-10-05-action-proposals.sql", "utf8"))
  await db.exec(readFileSync("scripts/migrations/2026-10-05b-agent-runtime.sql", "utf8"))
  const run = async (strings: TemplateStringsArray, ...values: unknown[]) => (await db.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values)).rows
  h.sql.mockImplementation(run); h.sql.unsafe = async (q: string, p: unknown[]) => (await db.query(q, p)).rows
}, 30000)
afterAll(async () => db.close())
beforeEach(async () => {
  await db.exec("DELETE FROM agent_executions; DELETE FROM agent_settings; DELETE FROM action_proposals; DELETE FROM workspace_autonomy; DELETE FROM crm_tasks; DELETE FROM crm_entries; DELETE FROM platform_flags")
  allowed = async () => {}; principalFor = async (userId, orgId) => ({ userId, orgId, persona: "founder", canWrite: true })
  clock = new Date("2026-10-05T08:00:00Z"); h.audit.mockReset(); h.audit.mockResolvedValue(undefined)
})
const startManual = (org = "org-a", agent = "pipeline_keeper", mode: "live" | "dry_run" = "live") => createExecution(org, agent, { trigger: "manual", mode, requestedBy: "u1" })

describe("schedules", () => {
  it("knows when a run is due and which period it belongs to", () => {
    expect(isDue("daily@07", new Date("2026-10-05T06:59:00Z"))).toBe(false)
    expect(isDue("daily@07", new Date("2026-10-05T07:00:00Z"))).toBe(true)
    expect(isDue("weekly:wed@07", new Date("2026-10-06T12:00:00Z"))).toBe(false) // Tuesday: Wednesday has not come
    expect(isDue("weekly:mon@07", new Date("2026-10-05T07:30:00Z"))).toBe(true)
    expect(isDue("weekly:mon@07", new Date("2026-10-07T01:00:00Z"))).toBe(true) // Wednesday catches up if Monday was missed
    expect(periodKey("daily@07", new Date("2026-10-05T09:00:00Z"))).toBe("2026-10-05")
    expect(periodKey("weekly:mon@07", new Date("2026-10-05T09:00:00Z"))).toBe(periodKey("weekly:mon@07", new Date("2026-10-11T20:00:00Z")))
    expect(() => parseSchedule("whenever")).toThrow()
  })
  it("a risk ceiling is a ceiling", () => { expect(withinCeiling("R0", "R0")).toBe(true); expect(withinCeiling("R1", "R0")).toBe(false); expect(withinCeiling("R0", "R2")).toBe(true) })
})

describe("pipeline keeper", () => {
  it("writes its plan first, proposes a task for each quiet contact only, and labels the proposals", async () => {
    await stale("org-a", "Quiet", 20); await stale("org-a", "Quieter", 40); await stale("org-a", "Recent", 3)
    await stale("org-a", "Won", 90, { stage: "committed" }); await stale("org-a", "HasTask", 30)
    await db.query("INSERT INTO crm_tasks (org_id, user_id, crm_entry_id, title) VALUES ('org-a','u1','e-HasTask','x')")
    await stale("org-b", "Other", 50)
    const id = (await startManual())!
    const planned = await one("SELECT plan FROM agent_executions WHERE id = $1", [id])
    expect(planned.plan.map((s: any) => s.id)).toEqual(["find_stale", "propose_tasks"])
    const done = await runExecution(id, deps)
    expect(done.status).toBe("succeeded")
    const props = await all("SELECT summary, agent_id, execution_id, status, run_id FROM action_proposals ORDER BY created_at")
    expect(props.map((p) => p.summary)).toEqual([expect.stringContaining("Quieter"), expect.stringContaining("Quiet")]) // oldest first
    expect(props.every((p) => p.agent_id === "pipeline_keeper" && p.execution_id === id && p.status === "pending" && p.run_id === id)).toBe(true)
    expect((await one("SELECT count(*)::int n FROM crm_tasks WHERE title LIKE 'Follow up%'")).n).toBe(0) // nothing written until a person approves
    expect(done.output.summary).toMatch(/2 follow-ups proposed/)
  })
  it("proposes at most ten per run", async () => {
    for (let i = 0; i < 14; i++) await stale("org-a", `P${i}`, 30 + i)
    const done = await runExecution((await startManual())!, deps)
    expect(done.status).toBe("succeeded"); expect((await one("SELECT count(*)::int n FROM action_proposals")).n).toBe(10)
  })
  it("a dry run creates no proposals and says what it would have proposed", async () => {
    await stale("org-a", "Quiet", 20)
    const done = await runExecution((await startManual("org-a", "pipeline_keeper", "dry_run"))!, deps)
    expect(done.status).toBe("succeeded"); expect((await one("SELECT count(*)::int n FROM action_proposals")).n).toBe(0)
    expect(done.output.proposals[0]).toMatch(/Quiet/)
  })
  it("uses no model: spend is zero by construction", async () => {
    await stale("org-a", "Quiet", 20)
    await runExecution((await startManual())!, deps)
    expect(Number((await one("SELECT spend_usd FROM agent_executions")).spend_usd)).toBe(0)
    expect(DEFINITIONS.pipeline_keeper.maxSpendUsd).toBe(0)
  })
})

describe("durability", () => {
  it("resumes after a crash without redoing finished steps or duplicating proposals", async () => {
    await stale("org-a", "Quiet", 20)
    const def = DEFINITIONS.pipeline_keeper, original = def.steps[1].run
    let boom = true
    def.steps[1] = { ...def.steps[1], run: async (ctx) => { await original(ctx); if (boom) { boom = false; throw new Error("process died") } return original(ctx) } }
    try {
      const id = (await startManual())!
      const first = await runExecution(id, deps)
      expect(first.status).toBe("queued"); expect(first.error).toMatch(/process died/); expect(Object.keys(first.state)).toEqual(["find_stale"])
      await stale("org-a", "Late", 25) // appears after step one finished: a resume must reuse step one's stored result, not recompute it
      const second = await runExecution(id, deps)
      expect(second.status).toBe("succeeded"); expect(second.attempts).toBe(2)
      const props = await all("SELECT summary FROM action_proposals")
      expect(props).toHaveLength(1); expect(props[0].summary).toMatch(/Quiet/)
    } finally { def.steps[1] = { ...def.steps[1], run: original } }
  })
  it("a run that died leaves running with an old heartbeat; the dispatcher resumes it, and leaves a live one alone", async () => {
    await stale("org-a", "Quiet", 20)
    const dead = (await startManual())!, live = (await startManual("org-b"))!
    await db.query("UPDATE agent_executions SET status='running', attempts=1, heartbeat_at = now() - interval '11 minutes' WHERE id = $1", [dead])
    await db.query("UPDATE agent_executions SET status='running', attempts=1, heartbeat_at = now() WHERE id = $1", [live])
    await dispatch(deps)
    expect((await one("SELECT status FROM agent_executions WHERE id=$1", [dead])).status).toBe("succeeded")
    expect((await one("SELECT status FROM agent_executions WHERE id=$1", [live])).status).toBe("running")
  })
  it("gives up after three attempts", async () => {
    const def = DEFINITIONS.pipeline_keeper, original = def.steps[0].run
    def.steps[0] = { ...def.steps[0], run: async () => { throw new Error("always") } }
    try {
      const id = (await startManual())!
      for (let i = 0; i < 4; i++) await runExecution(id, deps)
      const r = await one("SELECT status, error FROM agent_executions WHERE id=$1", [id])
      expect(r.status).toBe("failed"); expect(r.error).toMatch(/always/)
    } finally { def.steps[0] = { ...def.steps[0], run: original } }
  })
  it("two claimants run it once", async () => {
    await stale("org-a", "Quiet", 20)
    const id = (await startManual())!
    const [a, b] = await Promise.all([runExecution(id, deps), runExecution(id, deps)])
    expect([a, b].filter(Boolean)).toHaveLength(1); expect((await one("SELECT count(*)::int n FROM action_proposals")).n).toBe(1)
  })
  it("one scheduled run per period, however often the dispatcher fires", async () => {
    await stale("org-a", "Quiet", 20)
    await setEnabled("org-a", "pipeline_keeper", true, who)
    await dispatch(deps); await dispatch(deps)
    expect((await one("SELECT count(*)::int n FROM agent_executions WHERE agent_id='pipeline_keeper'")).n).toBe(1)
    expect((await one("SELECT count(*)::int n FROM action_proposals")).n).toBe(1)
    clock = new Date("2026-10-06T08:00:00Z"); await dispatch(deps) // next day: a new period
    expect((await one("SELECT count(*)::int n FROM agent_executions WHERE agent_id='pipeline_keeper'")).n).toBe(2)
  })
})

describe("kill switches and authority", () => {
  it("a workspace that has not enabled an agent is not scheduled, but can run it by hand", async () => {
    await dispatch(deps)
    expect((await one("SELECT count(*)::int n FROM agent_executions")).n).toBe(0)
    expect((await runExecution((await startManual())!, deps)).status).toBe("succeeded")
  })
  it("the platform flag stops a scheduled run before it starts and a run in flight between steps", async () => {
    await setEnabled("org-a", "weekly_brief", true, who)
    await db.query("INSERT INTO platform_flags (key, enabled) VALUES ('agents.disabled.weekly_brief', true)")
    await dispatch(deps)
    expect((await one("SELECT count(*)::int n FROM agent_executions")).n).toBe(0)
    await db.query("DELETE FROM platform_flags")
    const def = DEFINITIONS.weekly_brief, orig = def.steps[0].run
    def.steps[0] = { ...def.steps[0], run: async (c) => { const r = await orig(c); await db.query("INSERT INTO platform_flags (key, enabled) VALUES ('agents.disabled', true)"); return r } }
    try {
      const done = await runExecution((await startManual("org-a", "weekly_brief"))!, deps)
      expect(done.status).toBe("killed"); expect(done.error).toMatch(/platform-wide/); expect(Object.keys(done.state)).toEqual(["pipeline"])
    } finally { def.steps[0] = { ...def.steps[0], run: orig } }
  })
  it("switching the agent off for the workspace stops a scheduled run between steps", async () => {
    await setEnabled("org-a", "weekly_brief", true, who)
    const id = (await createExecution("org-a", "weekly_brief", { trigger: "schedule", mode: "live", requestedBy: "u1", now: clock }))!
    const def = DEFINITIONS.weekly_brief, orig = def.steps[0].run
    def.steps[0] = { ...def.steps[0], run: async (c) => { const r = await orig(c); await setEnabled("org-a", "weekly_brief", false, who); return r } }
    try { expect((await runExecution(id, deps)).status).toBe("killed") } finally { def.steps[0] = { ...def.steps[0], run: orig } }
  })
  it("a paused workspace runs nothing", async () => {
    allowed = async () => { throw new Error("Your workspace is paused.") }
    const done = await runExecution((await startManual())!, deps)
    expect(done.status).toBe("killed"); expect(done.error).toMatch(/paused/)
  })
  it("fails closed when the person who enabled it can no longer act", async () => {
    principalFor = async () => { throw new Error("The person who enabled this agent can no longer act for this workspace.") }
    await setEnabled("org-a", "pipeline_keeper", true, who)
    await stale("org-a", "Quiet", 20)
    await dispatch(deps)
    const r = await one("SELECT status, error FROM agent_executions")
    expect(r.status).toBe("killed"); expect(r.error).toMatch(/no longer act/); expect((await one("SELECT count(*)::int n FROM action_proposals")).n).toBe(0)
  })
  it("refuses a proposal above the agent's risk ceiling", async () => {
    CAPABILITIES.fake_r1 = { ...CAPABILITIES.crm_add_task, name: "fake_r1", risk: "R1" }
    DEFINITIONS.fake = { id: "fake", version: 1, title: "Fake", summary: "", personas: ["founder"], riskCeiling: "R0", maxSpendUsd: 0, schedule: "daily@07", defaults: {}, guarantees: [],
      steps: [{ id: "go", label: "go", run: (c) => c.propose("fake_r1", { title: "x" }) }], finish: () => ({}) }
    try {
      const done = await runExecution((await startManual("org-a", "fake"))!, deps)
      expect(done.status).toBe("killed"); expect(done.error).toMatch(/above its R0 ceiling/)
    } finally { delete CAPABILITIES.fake_r1; delete DEFINITIONS.fake }
  })
  it("reports why a run must stop", async () => {
    expect(await killReason("org-a", "pipeline_keeper", "manual")).toBeNull()
    expect(await killReason("org-a", "pipeline_keeper", "schedule")).toMatch(/switched off for the workspace/)
  })
})

describe("weekly brief", () => {
  it("states counts that match the data and proposes nothing", async () => {
    await stale("org-a", "A", 5, { stage: "contacted" }); await stale("org-a", "B", 5, { stage: "contacted" }); await stale("org-a", "C", 5, { stage: "meeting" }); await stale("org-b", "Z", 5)
    await db.query("INSERT INTO crm_tasks (org_id, user_id, title, due_at) VALUES ('org-a','u1','late', now() - interval '2 days'), ('org-a','u1','soon', now() + interval '2 days'), ('org-a','u1','done', now() - interval '2 days')")
    await db.query("UPDATE crm_tasks SET done_at = now() WHERE title = 'done'")
    await db.query("INSERT INTO action_proposals (org_id, requested_by, capability, summary, risk_class, idempotency_key) VALUES ('org-a','u1','crm_add_task','p','R0','k1')")
    const done = await runExecution((await startManual("org-a", "weekly_brief"))!, deps)
    expect(done.status).toBe("succeeded")
    expect(done.output.facts).toMatchObject({ total: 3, overdue: 1, dueThisWeek: 1, waiting: 1, movedThisWeek: 3 })
    expect(done.output.lines[0]).toMatch(/3 contacts in your pipeline: 2 contacted, 1 meeting/)
    expect((await one("SELECT count(*)::int n FROM action_proposals WHERE agent_id IS NOT NULL")).n).toBe(0)
  })
})
