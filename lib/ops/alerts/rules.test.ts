import { describe, it, expect } from "vitest"
import { evaluate, cronStale, cronStuck, cronFailing, dependencyDown, alerterStale, SEV1_JOBS, RULE_KEYS, type Snapshot } from "./rules"
import { RUNBOOKS } from "./runbooks"
import { CRON_MAX_AGE_MIN } from "@/lib/ops/dependencies"

const NOW = Date.UTC(2026, 9, 16, 12, 0, 0), M = 60_000
const snap = (o: Partial<Snapshot> = {}): Snapshot => ({ now: NOW, latest: {}, lastOk: {}, recent: {}, deps: [], ...o })

describe("cron_stuck", () => {
  it("fires for a run still 'running' after 15 minutes, as found in production (150 minutes)", () => {
    const f = cronStuck(snap({ latest: { "investor-activity": { startedAt: NOW - 150 * M, status: "running" }, agents: { startedAt: NOW - 3 * M, status: "running" } } }))
    expect(f).toHaveLength(1); expect(f[0]).toMatchObject({ rule: "cron_stuck", subject: "investor-activity", severity: 2, evidence: { runningMinutes: 150 } })
  })
  it("is severity 1 for a job that sends mail", () => {
    expect(cronStuck(snap({ latest: { "outreach-send": { startedAt: NOW - 40 * M, status: "running" } } }))[0].severity).toBe(1)
  })
})
describe("cron_stale", () => {
  it("fires when the last ok run is older than the allowed age, and says how old", () => {
    const f = cronStale(snap({ latest: { agents: { startedAt: NOW - 5 * M, status: "failed" } }, lastOk: { agents: NOW - 90 * M } }), new Set())
    expect(f).toHaveLength(1); expect(f[0]).toMatchObject({ rule: "cron_stale", subject: "agents", evidence: { lastOkMinutesAgo: 90, allowedMinutes: CRON_MAX_AGE_MIN.agents } })
  })
  it("does not fire within the allowed age, for a job never seen, or for a job reported as stuck", () => {
    expect(cronStale(snap({ latest: { agents: { startedAt: NOW - M, status: "ok" } }, lastOk: { agents: NOW - 10 * M } }), new Set())).toHaveLength(0)
    expect(cronStale(snap(), new Set())).toHaveLength(0)
    expect(cronStale(snap({ latest: { agents: { startedAt: NOW - 500 * M, status: "running" } }, lastOk: { agents: NOW - 900 * M } }), new Set(["agents"]))).toHaveLength(0)
  })
  it("a job that has run but never succeeded is stale", () => {
    expect(cronStale(snap({ latest: { agents: { startedAt: NOW - M, status: "failed" } }, lastOk: {} }), new Set())[0].evidence.lastOkMinutesAgo).toBeNull()
  })
  it("severity 1 for the jobs that send", () => {
    const f = cronStale(snap({ latest: { "campaign-send": { startedAt: NOW - M, status: "failed" } }, lastOk: { "campaign-send": NOW - 600 * M } }), new Set())
    expect(f[0].severity).toBe(1); expect(SEV1_JOBS.has("campaign-send")).toBe(true)
  })
})
describe("cron_failing", () => {
  it("fires when three of the last five finished runs failed including the latest", () => {
    expect(cronFailing(snap({ recent: { agents: ["failed", "ok", "failed", "failed", "ok"] } }))[0]).toMatchObject({ rule: "cron_failing", subject: "agents", evidence: { failed: 3, failedOfLast: 5 } })
  })
  it("does not fire once the latest run is ok, with fewer than three failures, or counting a running row as a failure", () => {
    expect(cronFailing(snap({ recent: { agents: ["ok", "failed", "failed", "failed", "failed"] } }))).toHaveLength(0)
    expect(cronFailing(snap({ recent: { agents: ["failed", "ok", "failed", "ok", "ok"] } }))).toHaveLength(0)
    expect(cronFailing(snap({ recent: { agents: ["running", "failed", "failed"] } }))).toHaveLength(0)
  })
})
describe("dependency_down", () => {
  it("fires for each 'down' check, naming it, with the fix, and ignores degraded, unconfigured and ok", () => {
    const f = dependencyDown(snap({ deps: [
      { name: "Stripe billing", status: "down", detail: "no webhook secret", fix: "set it" }, { name: "Reply detection", status: "down", detail: "0 replies from 286 sent" },
      { name: "Footer", status: "degraded", detail: "x" }, { name: "DocuSign", status: "unconfigured", detail: "y" }, { name: "Database", status: "ok", detail: "z" }] }))
    expect(f.map((x) => x.subject)).toEqual(["Stripe billing", "Reply detection"]); expect(f[0].evidence.fix).toBe("set it"); expect(f.every((x) => x.severity === 2)).toBe(true)
  })
})
describe("alerter_stale", () => {
  it("fires when the evaluator has been silent for more than 30 minutes, at severity 1; not before, and not when it has never run", () => {
    expect(alerterStale(NOW, NOW - 31 * M)[0]).toMatchObject({ severity: 1, subject: "alerts-evaluate", evidence: { lastRunMinutesAgo: 31 } })
    expect(alerterStale(NOW, NOW - 29 * M)).toHaveLength(0); expect(alerterStale(NOW, null)).toHaveLength(0)
  })
})
describe("the set", () => {
  it("every rule has a complete runbook", () => {
    for (const k of RULE_KEYS) { const r = RUNBOOKS[k]; expect(r, k).toBeTruthy(); for (const part of ["means", "check", "fix"] as const) expect(r[part].length, `${k}.${part}`).toBeGreaterThan(30) }
  })
  it("evaluate returns the production findings of 2026-10-16 as incidents: stripe, replies, the stuck job", () => {
    const f = evaluate(snap({ latest: { "investor-activity": { startedAt: NOW - 150 * M, status: "running" } }, lastOk: { "investor-activity": NOW - 1600 * M }, deps: [{ name: "Stripe billing", status: "down", detail: "no webhook secret" }, { name: "Reply detection", status: "down", detail: "no mailbox" }] }))
    expect(f.map((x) => `${x.rule}:${x.subject}`).sort()).toEqual(["cron_stuck:investor-activity", "dependency_down:Reply detection", "dependency_down:Stripe billing"])
  })
  it("evidence carries no personal data (only names, minutes and counts)", () => {
    const f = evaluate(snap({ latest: { agents: { startedAt: NOW - 99 * M, status: "running" } }, deps: [{ name: "Database", status: "down", detail: "did not answer" }] }))
    expect(JSON.stringify(f)).not.toMatch(/@|password|secret=/i)
  })
})
