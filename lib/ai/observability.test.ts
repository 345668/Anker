/**
 * Doc 30 — provenance and refused picks.
 *
 * Runs against a real Postgres (PGlite) with the actual migrations applied, so
 * the assertions cover the SQL as written rather than a mock of it. That matters
 * more than usual here: the risk in this change is not a wrong TypeScript value,
 * it is a FILTER clause that quietly moves a number an operator trusts.
 */
import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const state = vi.hoisted(() => ({ query: null as any }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({
  sql: Object.assign(
    (parts: TemplateStringsArray, ...values: unknown[]) =>
      state.query(parts.reduce((q, p, i) => q + (i ? `$${i}` : "") + p, ""), values),
    { unsafe: (q: string, v: unknown[] = []) => state.query(q, v) },
  ),
}))

import { recordAiCall, recordRejectedPick, aiUsageSummary } from "./usage"
import { resolveProvenance } from "./provider"

let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  state.query = async (q: string, v: unknown[] = []) => (await db.query(q, v)).rows
  // Applied twice each, the convention the persona-access fixture set: the
  // fixture doubles as an idempotency check on the migrations it depends on.
  for (const f of ["scripts/migrations/2026-09-21-ai-call-log.sql",
                   "scripts/migrations/2026-09-21b-ai-call-attribution.sql",
                   "scripts/migrations/2026-09-28-ai-call-provenance.sql",
                   "scripts/migrations/2026-10-03-ops-telemetry.sql"]) {
    const migration = readFileSync(f, "utf8")
    await db.exec(migration); await db.exec(migration)
  }
}, 30000)
afterAll(async () => { await db.close() })
beforeEach(async () => { await db.exec("DELETE FROM ai_calls") })

const rows = async () => (await db.query("SELECT * FROM ai_calls ORDER BY id")).rows as any[]

// ── The record side ─────────────────────────────────────────────────────────

it("stores provenance, the requested model and the streamed flag", async () => {
  await recordAiCall({ provider: "qwen", model: "qwen-plus", ok: true, task: "chat",
    resolution: "request", requestedModel: "qwen-plus", streamed: true })
  const [r] = await rows()
  expect(r.resolution).toBe("request")
  expect(r.requested_model).toBe("qwen-plus")
  expect(r.streamed).toBe(true)
})

it("defaults streamed to false, so every pre-doc-30 row reads correctly", async () => {
  await recordAiCall({ provider: "mistral", ok: true })
  const [r] = await rows()
  expect(r.streamed).toBe(false)
  expect(r.resolution).toBeNull()
  expect(r.requested_model).toBeNull()
})

it("records a refused pick once, as the rejected pseudo-provider", async () => {
  await recordRejectedPick({ requested: "gpt-9-ultra", reason: "unknown", task: "chat",
    workspaceId: "org-a", actorId: "gp", persona: "vc" })
  const all = await rows()
  expect(all).toHaveLength(1)
  expect(all[0].provider).toBe("rejected")
  expect(all[0].requested_model).toBe("gpt-9-ultra")
  expect(all[0].error).toBe("unknown")
  expect(all[0].ok).toBe(false)
  // Attribution is carried: "which workspace keeps picking a dead model" is the
  // question this number exists to answer.
  expect(all[0].workspace_id).toBe("org-a")
  expect(all[0].persona).toBe("vc")
})

// ── The read side, where the danger is ──────────────────────────────────────

it("keeps refused picks out of the failure rate", async () => {
  await recordAiCall({ provider: "qwen", ok: true })
  await recordAiCall({ provider: "qwen", ok: false, error: "500" })
  for (let i = 0; i < 8; i++) {
    await recordRejectedPick({ requested: "qwen-image-max", reason: "not-conversational" })
  }
  const s = await aiUsageSummary({ hours: 1 })
  // Two real calls, one of which failed. The eight refusals are working as
  // designed and must not move this: unfiltered, failureRate would read 0.9.
  expect(s.totals.calls).toBe(2)
  expect(s.totals.failures).toBe(1)
  expect(s.totals.failureRate).toBe(0.5)
  expect(s.totals.rejectedPicks).toBe(8)
})

it("keeps a suppressed call out of the failure rate too, as it always did", async () => {
  await recordAiCall({ provider: "qwen", ok: true })
  await recordAiCall({ provider: "disabled", ok: false, error: "task disabled by admin" })
  const s = await aiUsageSummary({ hours: 1 })
  expect(s.totals.calls).toBe(1)
  expect(s.totals.failures).toBe(0)
  expect(s.totals.suppressed).toBe(1)
})

it("lists neither pseudo-provider among recent failures", async () => {
  await recordAiCall({ provider: "qwen", ok: false, error: "real failure" })
  await recordAiCall({ provider: "disabled", ok: false, error: "task disabled by admin" })
  await recordRejectedPick({ requested: "qwen-image-max", reason: "not-conversational" })
  const s = await aiUsageSummary({ hours: 1 })
  expect(s.recentFailures).toHaveLength(1)
  expect(s.recentFailures[0].error).toBe("real failure")
})

it("does not count a refused pick as a failure of its task", async () => {
  await recordAiCall({ provider: "qwen", ok: true, task: "chat" })
  await recordRejectedPick({ requested: "gpt-9-ultra", reason: "unknown", task: "chat" })
  const s = await aiUsageSummary({ hours: 1 })
  const chat = s.byTask.find((t) => t.task === "chat")!
  expect(chat.failures).toBe(0)
})

it("groups refusals by reason and by the model asked for", async () => {
  await recordRejectedPick({ requested: "qwen-image-max", reason: "not-conversational" })
  await recordRejectedPick({ requested: "qwen-image-max", reason: "not-conversational" })
  await recordRejectedPick({ requested: "gpt-9-ultra", reason: "unknown" })
  const s = await aiUsageSummary({ hours: 1 })
  expect(s.rejectedByReason).toEqual([
    { reason: "not-conversational", requestedModel: "qwen-image-max", count: 2 },
    { reason: "unknown", requestedModel: "gpt-9-ultra", count: 1 },
  ])
})

it("reports provenance coverage rather than implying the whole window", async () => {
  await recordAiCall({ provider: "qwen", ok: true, resolution: "request" })
  await recordAiCall({ provider: "qwen", ok: true, resolution: "auto" })
  await recordAiCall({ provider: "qwen", ok: true })            // a pre-doc-30 row
  const s = await aiUsageSummary({ hours: 1 })
  expect(s.totals.provenanceKnown).toBe(2)
  expect(s.totals.calls).toBe(3)
  // The unknown row is absent from the breakdown rather than bucketed somewhere,
  // which is why the coverage count above has to be reported beside it.
  expect(s.byResolution.map((r) => r.resolution).sort()).toEqual(["auto", "request"])
})

it("counts streamed calls, which used to be recorded as nothing at all", async () => {
  await recordAiCall({ provider: "qwen", ok: true, streamed: true })
  await recordAiCall({ provider: "qwen", ok: true })
  const s = await aiUsageSummary({ hours: 1 })
  expect(s.totals.streamed).toBe(1)
  expect(s.totals.calls).toBe(2)
})

// ── Provenance, which must be told and not guessed (doc 30 §1.2) ────────────

it("takes the caller's word for a user pick, and never infers one", async () => {
  // The whole point of O2: these two are indistinguishable from inside
  // provider.ts, so only the explicit claim separates them.
  expect(resolveProvenance({ provider: "qwen", model: "qwen-plus", resolution: "request" }, null)).toBe("request")
  expect(resolveProvenance({ provider: "qwen", model: "qwen-plus" }, null)).toBe("pinned")
})

it("distinguishes the global override from the automatic chain", async () => {
  expect(resolveProvenance({}, { providerOverride: "mistral" } as any)).toBe("global")
  expect(resolveProvenance({}, null)).toBe("auto")
  expect(resolveProvenance({}, {} as any)).toBe("auto")
})

it("treats an explicit 'none' provider as no pin at all", async () => {
  // "none" is how callers say "no preference"; reading it as a pin would label
  // ordinary automatic routing as a code-level decision.
  expect(resolveProvenance({ provider: "none" }, null)).toBe("auto")
})

// ── Run trace and cost (docs/architecture/37 §5.4) ──────────────────────────

it("stamps the run id and a cost computed from tokens and the catalogue price", async () => {
  await recordAiCall({ provider: "qwen", model: "qwen3.7-max", ok: true, promptTokens: 1_000_000, outputTokens: 1_000_000, runId: "run-1" })
  const [r] = await rows()
  expect(r.run_id).toBe("run-1")
  expect(Number(r.cost_usd)).toBeCloseTo(1.25 + 3.75, 4)       // priceIn 1.25 + priceOut 3.75 per million
})

it("stores no cost, not zero, when the model is unpriced or no tokens were reported", async () => {
  await recordAiCall({ provider: "qwen", model: "not-in-catalogue", ok: true, promptTokens: 10, outputTokens: 10 })
  await recordAiCall({ provider: "qwen", model: "qwen3.7-max", ok: true })
  const rs = await rows()
  expect(rs[0].cost_usd).toBeNull()
  expect(rs[1].cost_usd).toBeNull()
  expect(rs[0].run_id).toBeNull()                              // outside a run there is no id to invent
})
