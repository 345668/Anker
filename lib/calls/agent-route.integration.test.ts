vi.mock("@/lib/assistant/principal", () => ({resolveAiPrincipal:async () => ({userId:"u1",orgId:"o1",persona:"vc"})}))
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * The live-call endpoint. What matters is what it refuses: an unauthenticated
 * device, another workspace's call, an oversized window, and — the one the
 * whole design rests on — any tool outside the Observe tier.
 */
const state = vi.hoisted(() => ({
  device: { userId: "u1", orgId: "o1", persona: "vc" as const, workspace: "W", writable: true } as any,
  deviceThrows: null as any,
  rows: [] as any[],
  limited: false,
  assistantOpts: null as any,
  assistantDelayMs: 0,
}))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({ sql: async () => state.rows }))
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => ({ ok: !state.limited }) }))
vi.mock("@/lib/calls/devices", () => ({
  authenticateDevice: async () => { if (state.deviceThrows) throw state.deviceThrows; return state.device },
}))
vi.mock("@/lib/assistant/agent", () => ({
  runAssistant: async (_task: string, opts: any) => {
    state.assistantOpts = opts
    if (state.assistantDelayMs) await new Promise(r => setTimeout(r, state.assistantDelayMs))
    return { answer: "They led your seed round.", steps: [{ tool: "crm_search" }, { thought: "no tool" }] }
  },
}))
import { POST } from "@/app/api/calls/agent/route"
import { CallError } from "@/lib/calls/access"
import { OBSERVE_TOOLS } from "./agent-observe"

const post = (body: unknown, auth = "Bearer anker_call_x") =>
  POST(new NextRequest("http://localhost/api/calls/agent", {
    method: "POST", body: JSON.stringify(body),
    headers: { "content-type": "application/json", authorization: auth },
  }))

beforeEach(() => {
  state.deviceThrows = null; state.limited = false; state.rows = [{ id: "c1" }]
  state.assistantOpts = null; state.assistantDelayMs = 0
  vi.useRealTimers()
})
afterEach(() => vi.useRealTimers())

it("refuses a device that cannot be authenticated", async () => {
  state.deviceThrows = new CallError("Invalid device credential.", 401)
  const res = await post({ question: "who is this" }, "Bearer nope")
  expect(res.status).toBe(401)
  expect(state.assistantOpts).toBeNull()
})

it("hands the agent only the Observe tools", async () => {
  await post({ question: "who led their last round" })
  // The single guarantee the live path depends on: no write tool is reachable.
  expect(state.assistantOpts.toolAllowlist).toEqual(OBSERVE_TOOLS)
  for (const forbidden of ["crm_update_stage", "crm_add_task", "send_outreach", "followup_sweep"]) {
    expect(state.assistantOpts.toolAllowlist).not.toContain(forbidden)
  }
  // …and it runs as that user's persona, so it cannot out-reach the human.
  expect(state.assistantOpts.persona).toBe("vc")
  expect(state.assistantOpts.userId).toBe("u1")
})

it("refuses a call that belongs to another workspace", async () => {
  state.rows = []
  const res = await post({ callId: "someone-elses", question: "hi" })
  expect(res.status).toBe(404)
  expect(state.assistantOpts).toBeNull()
})

it("refuses an oversized transcript window before doing any work", async () => {
  const res = await post({ window: "x".repeat(6_001) })
  expect(res.status).toBe(413)
  expect(state.assistantOpts).toBeNull()
})

it("refuses an empty request", async () => {
  expect((await post({})).status).toBe(400)
  expect(state.assistantOpts).toBeNull()
})

it("applies the burst limit before reaching the model", async () => {
  state.limited = true
  const res = await post({ question: "again" })
  expect(res.status).toBe(429)
  expect(state.assistantOpts).toBeNull()
})

it("returns which tools ran, without their payloads", async () => {
  const body = await (await post({ question: "who led their last round" })).json()
  expect(body.answer).toBe("They led your seed round.")
  expect(body.steps).toEqual([{ tool: "crm_search" }])
  expect(typeof body.turnsRemaining).toBe("number")
})

it("gives up rather than answering after the conversation has moved on", async () => {
  state.assistantDelayMs = 50
  vi.stubGlobal("setTimeout", ((fn: any) => { fn(); return 0 }) as any)
  const res = await post({ question: "slow one" })
  vi.unstubAllGlobals()
  expect(res.status).toBe(504)
})

it("stops a runaway loop at the per-call ceiling", async () => {
  // 60 turns on one call is no longer someone asking questions.
  let last: Response | undefined
  for (let i = 0; i < 62; i++) last = await post({ callId: "ceiling-call", question: "q" })
  expect(last!.status).toBe(429)
  expect((await last!.json()).error).toMatch(/limit/i)
})
