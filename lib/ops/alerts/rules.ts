/**
 * The alert rules (docs/architecture/56). Pure: a snapshot of facts in, the problems currently present out. Nothing here reads a database, sends anything or remembers anything;
 * the engine decides what is new, what is still going on and what has cleared. Evidence is facts only (a job name, a minute count, a check name): no personal data.
 */
import { CRON_MAX_AGE_MIN, type DepCheck } from "@/lib/ops/dependencies"

export type Severity = 1 | 2 | 3
export interface Finding { rule: RuleKey; subject: string; severity: Severity; summary: string; evidence: Record<string, unknown> }
export type RuleKey = "cron_stale" | "cron_stuck" | "cron_failing" | "dependency_down" | "alerter_stale"
export const RULE_KEYS: RuleKey[] = ["cron_stale", "cron_stuck", "cron_failing", "dependency_down", "alerter_stale"]

/** Jobs whose silence stops customers' mail: severity 1. */
export const SEV1_JOBS = new Set(["outreach-send", "outreach-scheduler", "campaign-send"])
/** A run still "running" after this long was killed by the platform (the longest function limit is 5 minutes, and a job may run for 10). */
export const STUCK_AFTER_MIN = 15
export const WATCHDOG_AFTER_MIN = 30

export interface Snapshot {
  now: number
  /** Newest run of each job. */
  latest: Record<string, { startedAt: number; status: string }>
  /** Newest successful run of each job. */
  lastOk: Record<string, number | null>
  /** Statuses of each job's last five runs, newest first. */
  recent: Record<string, string[]>
  deps: DepCheck[]
}

const min = (ms: number) => Math.round(ms / 60000)

export function cronStuck(s: Snapshot): Finding[] {
  const out: Finding[] = []
  for (const [job, r] of Object.entries(s.latest)) {
    const age = min(s.now - r.startedAt)
    if (r.status === "running" && age > STUCK_AFTER_MIN) out.push({ rule: "cron_stuck", subject: job, severity: SEV1_JOBS.has(job) ? 1 : 2, summary: `${job} has been running for ${age} minutes and was probably killed by the platform.`, evidence: { job, runningMinutes: age } })
  }
  return out
}

export function cronStale(s: Snapshot, stuck: Set<string>): Finding[] {
  const out: Finding[] = []
  for (const [job, maxMin] of Object.entries(CRON_MAX_AGE_MIN)) {
    if (stuck.has(job) || !(job in s.latest)) continue          // a stuck job is reported as stuck; a job never seen has no baseline yet
    const ok = s.lastOk[job]
    const age = ok == null ? null : min(s.now - ok)
    if (age == null || age > maxMin) out.push({ rule: "cron_stale", subject: job, severity: SEV1_JOBS.has(job) ? 1 : 2, summary: age == null ? `${job} has never completed successfully (allowed ${maxMin} minutes between runs).` : `${job} last completed ${age} minutes ago (allowed ${maxMin}).`, evidence: { job, lastOkMinutesAgo: age, allowedMinutes: maxMin } })
  }
  return out
}

export function cronFailing(s: Snapshot): Finding[] {
  const out: Finding[] = []
  for (const [job, statuses] of Object.entries(s.recent)) {
    const finished = statuses.filter((x) => x === "ok" || x === "failed")
    const failed = finished.filter((x) => x === "failed").length
    if (finished[0] === "failed" && failed >= 3) out.push({ rule: "cron_failing", subject: job, severity: SEV1_JOBS.has(job) ? 1 : 2, summary: `${job} failed in ${failed} of its last ${finished.length} runs, including the latest.`, evidence: { job, failedOfLast: finished.length, failed } })
  }
  return out
}

export function dependencyDown(s: Snapshot): Finding[] {
  return s.deps.filter((d) => d.status === "down").map((d) => ({ rule: "dependency_down" as const, subject: d.name, severity: 2 as const, summary: `${d.name} is down: ${d.detail}`, evidence: { check: d.name, detail: d.detail, fix: d.fix ?? null } }))
}

/** The watchdog's own rule: the evaluator has not run lately. */
export function alerterStale(now: number, lastRunAt: number | null): Finding[] {
  if (lastRunAt == null) return []
  const age = min(now - lastRunAt)
  return age > WATCHDOG_AFTER_MIN ? [{ rule: "alerter_stale", subject: "alerts-evaluate", severity: 1, summary: `The alert evaluator has not run for ${age} minutes. Nothing is being watched.`, evidence: { lastRunMinutesAgo: age, allowedMinutes: WATCHDOG_AFTER_MIN } }] : []
}

export function evaluate(s: Snapshot): Finding[] {
  const stuck = cronStuck(s)
  return [...stuck, ...cronStale(s, new Set(stuck.map((f) => f.subject))), ...cronFailing(s), ...dependencyDown(s)]
}
