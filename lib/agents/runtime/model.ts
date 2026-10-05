/** Pure rules of the agent runtime: schedules, periods, staleness, definitions' shape. docs/architecture/44. No I/O. */
import type { RiskClass } from "@/lib/actions/model"
import type { Persona } from "@/lib/org/active"

export type ExecStatus = "queued" | "running" | "succeeded" | "failed" | "killed" | "budget_stopped"
export type ExecMode = "live" | "dry_run"

/** A run whose heartbeat is older than this is presumed dead and may be resumed. */
export const STALE_MS = 10 * 60_000
export const MAX_ATTEMPTS = 3

export interface StepCtx {
  orgId: string; userId: string; persona: Exclude<Persona, null>; executionId: string; mode: ExecMode
  config: Record<string, any>
  /** Outputs of steps finished earlier in this run (reloaded after a crash). */
  prev: Record<string, any>
  /** Read the workspace's own data. Always scoped by $1 = org id; the definition writes the SQL, never the caller. */
  rows: (query: string, params?: unknown[]) => Promise<any[]>
  /** Propose a governed change. In a dry run nothing is created; the would-be proposal is returned and recorded. */
  propose: (capability: string, input: Record<string, unknown>) => Promise<{ summary: string; created: boolean }>
}
export interface AgentStep { id: string; label: string; run: (ctx: StepCtx) => Promise<unknown> }
export interface AgentDefinition {
  id: string; version: number; title: string; summary: string
  personas: Array<Exclude<Persona, null>>
  riskCeiling: RiskClass
  maxSpendUsd: number
  /** "daily@07" or "weekly:mon@07" (UTC). */
  schedule: string
  defaults: Record<string, number | string | boolean>
  /** What this agent will never do, shown to the person who turns it on. */
  guarantees: string[]
  steps: AgentStep[]
  /** Builds the run's output from the steps' outputs. */
  finish: (state: Record<string, any>) => unknown
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
const isoDow = (d: Date) => ((d.getUTCDay() + 6) % 7) + 1 // Monday = 1

export function parseSchedule(s: string): { kind: "daily" | "weekly"; dow: number; hour: number } {
  const m = /^(daily|weekly:(mon|tue|wed|thu|fri|sat|sun))@(\d{2})$/.exec(s)
  if (!m) throw new Error(`Bad schedule "${s}"`)
  return { kind: m[1] === "daily" ? "daily" : "weekly", dow: m[2] ? DAYS.indexOf(m[2]) + 1 : 0, hour: Number(m[3]) }
}
function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  const y = t.getUTCFullYear(), w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86_400_000 + 1) / 7)
  return `${y}-W${String(w).padStart(2, "0")}`
}
/** The period a scheduled run belongs to: the date for a daily agent, the ISO week for a weekly one. */
export const periodKey = (schedule: string, now: Date): string => parseSchedule(schedule).kind === "daily" ? now.toISOString().slice(0, 10) : isoWeek(now)
/** Has this period's scheduled time arrived? (Whether it already ran is the database's unique key, not a check here.) */
export function isDue(schedule: string, now: Date): boolean {
  const s = parseSchedule(schedule)
  if (s.kind === "daily") return now.getUTCHours() >= s.hour
  const dow = isoDow(now)
  return dow > s.dow || (dow === s.dow && now.getUTCHours() >= s.hour)
}
const RANK: Record<RiskClass, number> = { R0: 0, R1: 1, R2: 2, R3: 3 }
export const withinCeiling = (risk: RiskClass, ceiling: RiskClass) => RANK[risk] <= RANK[ceiling]
