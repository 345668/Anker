/** The action layer end to end against a real Postgres (PGlite) with the real migration. docs/architecture/43 §10. */
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
const h = vi.hoisted(() => ({ sql: vi.fn(), audit: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: h.sql }))
vi.mock("@/lib/audit/record-change", () => ({ recordChange: h.audit }))
import { propose, decide, setAutonomy, listProposals, pendingCount } from "./store"
import { mayAutoCommit, idempotencyKey } from "./model"

let db: PGlite
const A = { orgId: "org-a", userId: "u1", persona: "founder" }
const trusted = (run = "run-" + Math.random().toString(36).slice(2)) => ({ runId: run, trust: "trusted" as const })
const stage = async (id: string) => ((await db.query("SELECT stage FROM crm_entries WHERE id = $1", [id])).rows[0] as any)?.stage
const who = { userId: "u1", email: "u1@x.test" }

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE crm_entries (id text PRIMARY KEY, org_id text, display_name text, stage text, updated_at timestamptz DEFAULT now());
    CREATE TABLE crm_tasks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id text, user_id text, crm_entry_id text, title text, due_at timestamptz, done_at timestamptz);`)
  await db.exec(readFileSync("scripts/migrations/2026-10-05-action-proposals.sql", "utf8"))
  await db.exec(readFileSync("scripts/migrations/2026-10-05b-agent-runtime.sql", "utf8")) // adds agent_id and execution_id to proposals
  h.sql.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => (await db.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values)).rows)
}, 30000)
afterAll(async () => db.close())
beforeEach(async () => {
  await db.exec("DELETE FROM action_proposals; DELETE FROM workspace_autonomy; DELETE FROM crm_tasks; DELETE FROM crm_entries")
  await db.exec("INSERT INTO crm_entries VALUES ('e1','org-a','Ann Investor','queued'), ('e2','org-a','Bo Fund','queued'), ('f1','org-b','Foreign Person','queued')")
  h.audit.mockReset(); h.audit.mockResolvedValue(undefined)
})

describe("policy", () => {
  it("only trusted R0 with the switch on may commit alone; R1 to R3 never", () => {
    expect(mayAutoCommit("R0", "trusted", { R0: true })).toBe(true)
    expect(mayAutoCommit("R0", "trusted", {})).toBe(false)
    expect(mayAutoCommit("R0", "untrusted", { R0: true })).toBe(false)
    for (const r of ["R1", "R2", "R3"] as const) expect(mayAutoCommit(r, "trusted", { R0: true, R1: true, R2: true, R3: true })).toBe(false)
  })
  it("the same call in the same run has the same key, regardless of key order", () => {
    expect(idempotencyKey("r", "c", { a: 1, b: 2 })).toBe(idempotencyKey("r", "c", { b: 2, a: 1 }))
    expect(idempotencyKey("r", "c", { a: 1 })).not.toBe(idempotencyKey("r2", "c", { a: 1 }))
  })
})

describe("stage move", () => {
  it("proposes with a diff, changes nothing, applies once on approval and undoes", async () => {
    const r = await propose(A, "crm_update_stage", { entryId: "e1", stage: "contacted" }, trusted())
    expect(r.applied).toBe(false)
    expect(r.proposal.diff).toEqual([{ label: "Ann Investor: stage", before: "queued", after: "contacted" }])
    expect(await stage("e1")).toBe("queued")
    expect(await pendingCount("org-a")).toBe(1)
    const ok = await decide("org-a", r.proposal.id, "approve", who)
    expect(ok.proposal.status).toBe("applied"); expect(await stage("e1")).toBe("contacted")
    // a retried approval, or a double click, returns the stored result and does not write again
    await db.exec("UPDATE crm_entries SET stage = 'responded' WHERE id = 'e1'")
    const again = await decide("org-a", r.proposal.id, "approve", who)
    expect(again.message).toMatch(/already applied/i); expect(await stage("e1")).toBe("responded")
    // undo refuses to overwrite later work
    await expect(decide("org-a", r.proposal.id, "undo", who)).rejects.toThrow(/moved again/)
    expect(((await db.query("SELECT status FROM action_proposals WHERE id=$1", [r.proposal.id])).rows[0] as any).status).toBe("applied")
    await db.exec("UPDATE crm_entries SET stage = 'contacted' WHERE id = 'e1'")
    const undone = await decide("org-a", r.proposal.id, "undo", who)
    expect(undone.proposal.status).toBe("undone"); expect(await stage("e1")).toBe("queued")
  })
  it("two concurrent approvals apply once", async () => {
    const r = await propose(A, "crm_update_stage", { entryId: "e1", stage: "meeting" }, trusted())
    const res = await Promise.allSettled([decide("org-a", r.proposal.id, "approve", who), decide("org-a", r.proposal.id, "approve", who)])
    expect(res.filter((x) => x.status === "fulfilled" && /Moved|moved/.test((x as any).value.message)).length).toBe(1)
    expect(await stage("e1")).toBe("meeting")
  })
  it("refuses a contact from another workspace, when proposing and when applying", async () => {
    await expect(propose(A, "crm_update_stage", { entryId: "f1", stage: "passed" }, trusted())).rejects.toThrow(/not found/i)
    const r = await propose(A, "crm_update_stage", { entryId: "e1", stage: "passed" }, trusted())
    await db.exec("UPDATE crm_entries SET org_id = 'org-b' WHERE id = 'e1'")
    const out = await decide("org-a", r.proposal.id, "approve", who)
    expect(out.proposal.status).toBe("failed"); expect(await stage("e1")).toBe("queued")
  })
  it("a workspace cannot see or decide another workspace's proposal", async () => {
    const r = await propose(A, "crm_update_stage", { entryId: "e1", stage: "contacted" }, trusted())
    await expect(decide("org-b", r.proposal.id, "approve", who)).rejects.toThrow(/not found/i)
    expect(await listProposals("org-b", "pending")).toHaveLength(0)
  })
  it("rejects an invalid stage and repeats of the same call in a run return the same proposal", async () => {
    await expect(propose(A, "crm_update_stage", { entryId: "e1", stage: "nonsense" }, trusted())).rejects.toThrow(/stage must be/)
    const t = trusted("same-run")
    const a = await propose(A, "crm_update_stage", { entryId: "e1", stage: "contacted" }, t)
    const b = await propose(A, "crm_update_stage", { stage: "contacted", entryId: "e1" }, t)
    expect(b.proposal.id).toBe(a.proposal.id); expect(b.existing).toBe(true)
  })
  it("reject changes nothing and cannot be approved afterwards", async () => {
    const r = await propose(A, "crm_update_stage", { entryId: "e1", stage: "contacted" }, trusted())
    await decide("org-a", r.proposal.id, "reject", who)
    await expect(decide("org-a", r.proposal.id, "approve", who)).rejects.toThrow(/rejected/)
    expect(await stage("e1")).toBe("queued")
  })
  it("an expired proposal cannot be approved", async () => {
    const r = await propose(A, "crm_update_stage", { entryId: "e1", stage: "contacted" }, trusted())
    await db.exec("UPDATE action_proposals SET expires_at = now() - interval '1 day'")
    await expect(decide("org-a", r.proposal.id, "approve", who)).rejects.toThrow(/expired/)
    expect(await stage("e1")).toBe("queued")
  })
})

describe("task", () => {
  it("creates on approval and undo removes it unless it was completed", async () => {
    const r = await propose(A, "crm_add_task", { title: "Follow up with Ann", entryId: "e1", dueAt: "2026-11-01" }, trusted())
    expect(((await db.query("SELECT count(*)::int n FROM crm_tasks")).rows[0] as any).n).toBe(0)
    await decide("org-a", r.proposal.id, "approve", who)
    expect(((await db.query("SELECT count(*)::int n FROM crm_tasks WHERE org_id='org-a'")).rows[0] as any).n).toBe(1)
    await decide("org-a", r.proposal.id, "undo", who)
    expect(((await db.query("SELECT count(*)::int n FROM crm_tasks")).rows[0] as any).n).toBe(0)
    const r2 = await propose(A, "crm_add_task", { title: "Other" }, trusted())
    await decide("org-a", r2.proposal.id, "approve", who)
    await db.exec("UPDATE crm_tasks SET done_at = now()")
    await expect(decide("org-a", r2.proposal.id, "undo", who)).rejects.toThrow(/already completed/)
  })
})

describe("autonomy and the untrusted cap", () => {
  it("auto-commits trusted R0 only when an owner turned it on, and logs it", async () => {
    const off = await propose(A, "crm_update_stage", { entryId: "e1", stage: "contacted" }, trusted())
    expect(off.applied).toBe(false)
    await setAutonomy("org-a", "R0", true, who)
    const on = await propose(A, "crm_update_stage", { entryId: "e2", stage: "contacted" }, trusted())
    expect(on.applied).toBe(true); expect(on.proposal.auto_committed).toBe(true); expect(await stage("e2")).toBe("contacted")
    expect(h.audit.mock.calls.some((c) => c[0].action === "action_proposal.auto_committed")).toBe(true)
    const hist = await listProposals("org-a", "history")
    expect(hist.some((p) => p.id === on.proposal.id)).toBe(true)
  })
  it("a run that read outside content never auto-commits, whatever the switch", async () => {
    await setAutonomy("org-a", "R0", true, who)
    const r = await propose(A, "crm_update_stage", { entryId: "e1", stage: "contacted" }, { runId: "x", trust: "untrusted" })
    expect(r.applied).toBe(false); expect(r.proposal.source_trust).toBe("untrusted"); expect(await stage("e1")).toBe("queued")
  })
  it("the switch cannot be turned on for R1 to R3", async () => {
    for (const c of ["R1", "R2", "R3"] as const) await expect(setAutonomy("org-a", c, true, who)).rejects.toThrow(/R0/)
  })
})

describe("audit", () => {
  it("writes an event for creation, approval and undo, scoped to the workspace", async () => {
    const r = await propose(A, "crm_update_stage", { entryId: "e1", stage: "contacted" }, trusted())
    await decide("org-a", r.proposal.id, "approve", who); await decide("org-a", r.proposal.id, "undo", who)
    const actions = h.audit.mock.calls.map((c) => c[0].action)
    expect(actions).toEqual(["action_proposal.created", "action_proposal.applied", "action_proposal.undone"])
    expect(h.audit.mock.calls.every((c) => c[0].scope.id === "org-a")).toBe(true)
  })
})
