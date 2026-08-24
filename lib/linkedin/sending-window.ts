/**
 * Sending-window gate — the account-safety limits the sequencer honours before
 * it enqueues a step's action (docs/scope-linkedin-outreach.md §3).
 *
 * A send is allowed only when, for the sender:
 *   • status is 'active' (or 'warming'), not paused/restricted, and
 *   • the local time is inside working hours (in the sender's timezone), and
 *   • today's committed usage is under the (warmup-adjusted) daily cap.
 *
 * "Committed usage" counts actions that will consume today's budget — done +
 * in-flight (queued/claimed) — so we never over-enqueue past a cap.
 */
import "server-only"
import { sql } from "@/lib/db"
import type { LinkedInSender, StepActionType } from "./types"

const WARMUP_DAYS = 14
const WARMUP_FLOOR = 0.2 // day 0 starts at 20% of the configured cap

/** Warmup ramp multiplier for a sender: 1.0 once fully warm / not warming. */
export function warmupFactor(sender: Pick<LinkedInSender, "warmupStartedAt">, now = new Date()): number {
  if (!sender.warmupStartedAt) return 1
  const started = new Date(sender.warmupStartedAt).getTime()
  if (!Number.isFinite(started)) return 1
  const day = Math.floor((now.getTime() - started) / 86_400_000)
  if (day >= WARMUP_DAYS) return 1
  if (day < 0) return WARMUP_FLOOR
  return WARMUP_FLOOR + (1 - WARMUP_FLOOR) * (day / WARMUP_DAYS)
}

/** Effective (warmup-adjusted) daily caps for a sender. */
export function effectiveCaps(sender: LinkedInSender, now = new Date()): { connect: number; message: number } {
  const f = warmupFactor(sender, now)
  return {
    connect: Math.max(0, Math.floor(sender.dailyConnectCap * f)),
    message: Math.max(0, Math.floor(sender.dailyMessageCap * f)),
  }
}

/** The current hour (0–23) in an IANA timezone. Falls back to UTC on bad tz. */
export function hourInTimezone(timezone: string, now = new Date()): number {
  try {
    const s = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone || "UTC" }).format(now)
    const h = parseInt(s, 10)
    return Number.isFinite(h) ? h % 24 : now.getUTCHours()
  } catch {
    return now.getUTCHours()
  }
}

export function withinWorkingHours(sender: LinkedInSender, now = new Date()): boolean {
  const h = hourInTimezone(sender.timezone, now)
  // end is exclusive; [start, end). Handles normal daytime ranges.
  return h >= sender.workingHoursStart && h < sender.workingHoursEnd
}

/** Today's committed usage (done + queued + claimed) for a sender, per family. */
export async function committedUsageToday(
  senderId: string,
): Promise<{ connect: number; message: number }> {
  const rows = (await sql`
    SELECT
      COUNT(*) FILTER (WHERE action_type = 'connect_request') AS connect,
      COUNT(*) FILTER (WHERE action_type IN ('message','follow_up')) AS message
    FROM li_action_queue
    WHERE sender_id = ${senderId}
      AND status IN ('done','queued','claimed')
      AND COALESCE(completed_at, claimed_at, created_at) >= date_trunc('day', now())
  `) as any[]
  return { connect: Number(rows[0]?.connect ?? 0), message: Number(rows[0]?.message ?? 0) }
}

const familyOf = (t: StepActionType): "connect" | "message" =>
  t === "connect_request" ? "connect" : "message"

export interface SendDecision {
  allowed: boolean
  reason?: "paused" | "restricted" | "outside_hours" | "cap_reached"
  capsRemaining?: { connect: number; message: number }
}

/**
 * May this sender send an action of `actionType` right now? Applies status,
 * working-hours, and warmup-adjusted cap checks. Callers that are over cap /
 * outside hours should hold the step for a later tick (not fail it).
 */
export async function canSendNow(
  sender: LinkedInSender,
  actionType: StepActionType,
  now = new Date(),
): Promise<SendDecision> {
  if (sender.status === "paused") return { allowed: false, reason: "paused" }
  if (sender.status === "restricted") return { allowed: false, reason: "restricted" }
  if (!withinWorkingHours(sender, now)) return { allowed: false, reason: "outside_hours" }

  const caps = effectiveCaps(sender, now)
  const used = await committedUsageToday(sender.id)
  const remaining = {
    connect: Math.max(0, caps.connect - used.connect),
    message: Math.max(0, caps.message - used.message),
  }
  const fam = familyOf(actionType)
  if (remaining[fam] <= 0) return { allowed: false, reason: "cap_reached", capsRemaining: remaining }
  return { allowed: true, capsRemaining: remaining }
}
