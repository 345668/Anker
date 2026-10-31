/**
 * The alert rules (docs/architecture/56). Pure: a snapshot of facts in, the problems currently present out. Nothing here reads a database, sends anything or remembers anything;
 * the engine decides what is new, what is still going on and what has cleared. Evidence is facts only (a job name, a minute count, a check name): no personal data.
 */
import { CRON_MAX_AGE_MIN, type DepCheck } from "@/lib/ops/dependencies"

export type Severity = 1 | 2 | 3
export interface Finding { rule: RuleKey; subject: string; severity: Severity; summary: string; evidence: Record<string, unknown> }
export type RuleKey = "cron_stale" | "cron_stuck" | "cron_failing" | "dependency_down" | "dependency_degraded" | "ai_failure_rate" | "privacy_request_due" | "telegram_queue" | "cost_coverage" | "unpriced_model" | "workspace_at_limit" | "schema_behind" | "smoke_failed" | "restore_drill_overdue" | "halyard_latency" | "halyard_stt_failing" | "alerter_stale"
export const RULE_KEYS: RuleKey[] = ["cron_stale", "cron_stuck", "cron_failing", "dependency_down", "dependency_degraded", "ai_failure_rate", "privacy_request_due", "telegram_queue", "cost_coverage", "unpriced_model", "workspace_at_limit", "schema_behind", "smoke_failed", "restore_drill_overdue", "halyard_latency", "halyard_stt_failing", "alerter_stale"]
/** What each rule is for, shown on the SAIL rules page. */
export const RULE_INFO: Record<RuleKey, { label: string; text: string; defaultSeverity: Severity }> = {
  cron_stale: { label: "A scheduled job has stopped", text: "A job has not completed successfully for twice its interval.", defaultSeverity: 2 },
  cron_stuck: { label: "A scheduled job is stuck", text: "A run has been 'running' for over 15 minutes: the platform killed it.", defaultSeverity: 2 },
  cron_failing: { label: "A scheduled job keeps failing", text: "Three of the last five runs failed, including the latest.", defaultSeverity: 2 },
  dependency_down: { label: "A dependency is down", text: "The live dependency check reports a check as down (a secret, a mailbox, a provider).", defaultSeverity: 2 },
  dependency_degraded: { label: "A dependency has been degraded for days", text: "The nightly check has reported the same check as degraded three nights running. Digest only.", defaultSeverity: 3 },
  ai_failure_rate: { label: "AI calls are failing", text: "A provider's share of failed calls in the window is above the threshold.", defaultSeverity: 2 },
  privacy_request_due: { label: "A privacy request is due", text: "A confirmed request is due within 7 days or overdue.", defaultSeverity: 2 },
  telegram_queue: { label: "The Telegram channel is backing up", text: "Messages to the Anker bot have waited over ten minutes, or several have failed in the last hour.", defaultSeverity: 2 },
  cost_coverage: { label: "AI cost records are incomplete", text: "Under 95% of the last day's AI calls have a cost, so a plan's monthly AI allowance is not seeing the real spend.", defaultSeverity: 3 },
  unpriced_model: { label: "An AI model has no price", text: "Calls to a model with no price were recorded in the last day. Add the price in SAIL, Model prices.", defaultSeverity: 2 },
  workspace_at_limit: { label: "A workspace has used its AI allowance", text: "A workspace passed 100% of its monthly AI allowance in the last day. Its AI features are paused until the month resets or you raise the limit. Digest only.", defaultSeverity: 3 },
  schema_behind: { label: "The database is behind the deployed code", text: "The running version expects database migrations that have not been applied. Features that use them are broken until they are.", defaultSeverity: 2 },
  smoke_failed: { label: "The post-deploy check failed", text: "After the last deploy, a page or a deep check failed. The newest check in the last day did not pass; a later passing run clears this.", defaultSeverity: 2 },
  restore_drill_overdue: { label: "A restore has not been tried lately", text: "No restore drill has passed in the last 100 days (or none has ever been run). A backup you have never restored is a hope, not a backup. Digest only.", defaultSeverity: 3 },
  halyard_latency: { label: "Halyard suggestions are slow", text: "Over the last 15 minutes, with at least 20 suggestions, the slowest 5% took longer than 4 seconds. People on a live call are waiting too long.", defaultSeverity: 3 },
  halyard_stt_failing: { label: "Halyard transcription is failing", text: "More than 10% of audio uploads failed to transcribe over the last 15 minutes (with at least 10 uploads): people's words are not being captured.", defaultSeverity: 3 },
  alerter_stale: { label: "The alert evaluator has stopped", text: "No successful evaluation for 30 minutes. Raised by the watchdog.", defaultSeverity: 1 },
}
export interface Thresholds { ai_failure_rate?: { rate?: number; minCalls?: number; windowMin?: number } }
export const AI_DEFAULTS = { rate: 0.2, minCalls: 10, windowMin: 15 }

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
  /** Calls and failures per provider in the AI window. */
  ai?: Record<string, { calls: number; failed: number }>
  /** Open privacy requests with their due date (no personal data). */
  privacy?: Array<{ id: string; kind: string; dueAt: number }>
  /** Statuses of each check in the last three nightly runs, newest first. */
  depHistory?: Record<string, string[]>
  /** Customer Telegram updates waiting over ten minutes, and failures in the last hour. */
  telegram?: { stuck: number; failed1h: number }
  /** The last day's AI calls by cost state (docs/architecture/58), and the models that had no price. */
  metering?: { costed: number; unpriced: number; unpricedModels: Array<{ model: string; calls: number }>; atLimit?: string[] }
  /** Migration files the deployed code expects that the ledger lacks (docs/architecture/59 R3). Absent when the ledger could not be read. */
  schemaBehind?: string[]
  /** The newest post-deploy smoke run from the last day, if it failed (docs/architecture/59 R6). */
  smoke?: { sha: string | null; failures: string[] }
  /** The last 15 minutes of Halyard: counts and timings only, never content (docs/architecture/62 section 15). */
  /** When the newest PASSING restore drill finished (ms), or null if none ever passed (docs/architecture/59 R4). Absent when the table could not be read. */
  restoreDrill?: { lastPassedAt: number | null; lastFailedAfter: boolean }
  halyard?: { suggestions: number; p95Ms: number | null; uploads: number; failed: number }
}
export const HALYARD_LIMITS = { p95Ms: 4000, minSuggestions: 20, failRate: 0.1, minUploads: 10 }

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
    if (job === "alerts-evaluate") continue                    // the evaluator cannot report its own silence; the watchdog does (alerter_stale)
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

export function dependencyDegraded(s: Snapshot): Finding[] {
  const out: Finding[] = []
  for (const [name, hist] of Object.entries(s.depHistory ?? {})) {
    if (hist.length >= 3 && hist.slice(0, 3).every((x) => x === "degraded")) out.push({ rule: "dependency_degraded", subject: name, severity: 3, summary: `${name} has been degraded for three nights running.`, evidence: { check: name, nights: 3 } })
  }
  return out
}

export function aiFailureRate(s: Snapshot, t: Thresholds = {}): Finding[] {
  const own = Object.fromEntries(Object.entries(t.ai_failure_rate ?? {}).filter(([, v]) => v !== undefined))
  const { rate, minCalls, windowMin } = { ...AI_DEFAULTS, ...own }
  const out: Finding[] = []
  for (const [provider, c] of Object.entries(s.ai ?? {})) {
    if (c.calls >= minCalls && c.failed / c.calls > rate) out.push({ rule: "ai_failure_rate", subject: provider, severity: 2, summary: `${provider}: ${c.failed} of ${c.calls} AI calls failed in the last ${windowMin} minutes (${Math.round((100 * c.failed) / c.calls)}%).`, evidence: { provider, calls: c.calls, failed: c.failed, windowMinutes: windowMin, threshold: rate } })
  }
  return out
}

export function privacyRequestDue(s: Snapshot): Finding[] {
  const out: Finding[] = []
  for (const r of s.privacy ?? []) {
    const days = Math.floor((r.dueAt - s.now) / 86_400_000)
    if (days <= 7) out.push({ rule: "privacy_request_due", subject: r.id, severity: 2, summary: days < 0 ? `A ${r.kind} request is ${-days} day(s) overdue.` : `A ${r.kind} request is due in ${days} day(s).`, evidence: { kind: r.kind, daysLeft: days, overdue: days < 0 } })
  }
  return out
}

export function telegramQueue(s: Snapshot): Finding[] {
  const t = s.telegram
  if (!t || (t.stuck === 0 && t.failed1h < 3)) return []
  return [{ rule: "telegram_queue", subject: "telegram-queue", severity: 2, summary: `Telegram: ${t.stuck} message(s) have waited over ten minutes and ${t.failed1h} failed in the last hour.`, evidence: { waitingOverTenMinutes: t.stuck, failedLastHour: t.failed1h } }]
}

export const COST_COVERAGE_MIN = 0.95
export const COST_COVERAGE_MIN_CALLS = 20

export function costCoverage(s: Snapshot): Finding[] {
  const m = s.metering
  if (!m) return []
  const total = m.costed + m.unpriced
  if (total < COST_COVERAGE_MIN_CALLS || m.costed / total >= COST_COVERAGE_MIN) return []
  const pct = Math.round((m.costed / total) * 100)
  return [{ rule: "cost_coverage", subject: "ai-cost-coverage", severity: 3, summary: `Only ${pct}% of the last day's ${total} AI calls have a cost.`, evidence: { calls: total, withCost: m.costed, unpriced: m.unpriced, coveragePct: pct } }]
}

export function unpricedModel(s: Snapshot): Finding[] {
  return (s.metering?.unpricedModels ?? []).map((u) => ({ rule: "unpriced_model" as const, subject: u.model, severity: 2 as const, summary: `${u.model} has no price: ${u.calls} call(s) in the last day were not counted.`, evidence: { model: u.model, calls: u.calls } }))
}

export function workspaceAtLimit(s: Snapshot): Finding[] {
  return (s.metering?.atLimit ?? []).map((org) => ({ rule: "workspace_at_limit" as const, subject: org, severity: 3 as const, summary: `Workspace ${org} has used its monthly AI allowance.`, evidence: { workspace: org } }))
}

export function schemaBehind(s: Snapshot): Finding[] {
  const b = s.schemaBehind
  if (!b || b.length === 0) return []
  return [{ rule: "schema_behind", subject: "database-schema", severity: 2, summary: `The database is missing ${b.length} migration(s) the deployed code expects: ${b.slice(0, 3).join(", ")}${b.length > 3 ? ", …" : ""}.`, evidence: { missing: b.slice(0, 10), count: b.length } }]
}

export function smokeFailed(s: Snapshot): Finding[] {
  const m = s.smoke
  if (!m) return []
  return [{ rule: "smoke_failed", subject: "post-deploy-smoke", severity: 2, summary: `The check after the last deploy${m.sha ? ` (${m.sha.slice(0, 7)})` : ""} failed: ${m.failures.slice(0, 3).join("; ")}${m.failures.length > 3 ? "; …" : ""}.`, evidence: { commit: m.sha, failures: m.failures.slice(0, 10) } }]
}

export const RESTORE_DRILL_MAX_DAYS = 100
export function restoreDrillOverdue(s: Snapshot): Finding[] {
  const d = s.restoreDrill
  if (!d) return []
  const days = d.lastPassedAt === null ? null : Math.floor((s.now - d.lastPassedAt) / 86_400_000)
  if (days !== null && days <= RESTORE_DRILL_MAX_DAYS) return []
  return [{ rule: "restore_drill_overdue", subject: "restore-drill", severity: 3, summary: days === null ? `No restore drill has ever passed.${d.lastFailedAfter ? " The last one failed." : ""}` : `The last passing restore drill was ${days} days ago.${d.lastFailedAfter ? " A later one failed." : ""}`, evidence: { daysSincePass: days, neverPassed: days === null, laterFailure: d.lastFailedAfter } }]
}
export function halyardLatency(s: Snapshot): Finding[] {
  const h = s.halyard
  if (!h || h.suggestions < HALYARD_LIMITS.minSuggestions || h.p95Ms === null || h.p95Ms <= HALYARD_LIMITS.p95Ms) return []
  return [{ rule: "halyard_latency", subject: "halyard-latency", severity: 3, summary: `Halyard: the slowest 5% of suggestions took ${(h.p95Ms / 1000).toFixed(1)} s over the last 15 minutes (${h.suggestions} suggestions).`, evidence: { p95Seconds: Math.round(h.p95Ms / 100) / 10, suggestions: h.suggestions } }]
}
export function halyardSttFailing(s: Snapshot): Finding[] {
  const h = s.halyard
  if (!h || h.uploads < HALYARD_LIMITS.minUploads || h.failed / h.uploads <= HALYARD_LIMITS.failRate) return []
  return [{ rule: "halyard_stt_failing", subject: "halyard-stt", severity: 3, summary: `Halyard: ${h.failed} of ${h.uploads} audio uploads failed to transcribe in the last 15 minutes (${Math.round((100 * h.failed) / h.uploads)}%).`, evidence: { failed: h.failed, uploads: h.uploads } }]
}

export function evaluate(s: Snapshot, t: Thresholds = {}): Finding[] {
  const stuck = cronStuck(s)
  return [...stuck, ...cronStale(s, new Set(stuck.map((f) => f.subject))), ...cronFailing(s), ...dependencyDown(s), ...dependencyDegraded(s), ...aiFailureRate(s, t), ...privacyRequestDue(s), ...telegramQueue(s), ...costCoverage(s), ...unpricedModel(s), ...workspaceAtLimit(s), ...schemaBehind(s), ...smokeFailed(s), ...restoreDrillOverdue(s), ...halyardLatency(s), ...halyardSttFailing(s)]
}
