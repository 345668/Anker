/**
 * Layer 3 rate-limit policy.
 *
 * Defaults from the playbook (LinkedIn-safe zone):
 *   - 25 connection requests / day
 *   - 50 follow-up DMs / day
 *   - weekday-only sends
 *   - randomized hours (we slot into 09:00-17:00 local on weekdays)
 *
 * `nextSlotsForKind()` returns up to `count` ISO timestamps spread
 * across upcoming weekday hours, never violating the daily caps.
 *
 * `enforceDailyCap()` answers "given today's already-sent count, how
 * many more can I queue today?".
 */

export interface RateLimitConfig {
  connectionsPerDay: number  // default 25
  followUpsPerDay: number    // default 50
  weekdayOnly: boolean       // default true
  windowStartHour: number    // default 9  (09:00 local)
  windowEndHour: number      // default 17 (17:00 local)
  /** Optional: minimum minutes between sends, helps avoid bursts. */
  minIntervalMinutes: number // default 6 (≈10/hour cap)
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  connectionsPerDay: 25,
  followUpsPerDay: 50,
  weekdayOnly: true,
  windowStartHour: 9,
  windowEndHour: 17,
  minIntervalMinutes: 6,
}

/** Map outreach_messages.kind → which daily cap it counts against. */
export type MessageKind = "connection_request" | "follow_up" | "different_angle" | "close_loop"
export function capForKind(kind: MessageKind, cfg: RateLimitConfig): number {
  return kind === "connection_request" ? cfg.connectionsPerDay : cfg.followUpsPerDay
}

/**
 * Given today's already-sent count, how many more sends of this kind
 * fit before hitting the daily cap.
 */
export function remainingTodayForKind(
  sentTodayOfKind: number,
  kind: MessageKind,
  cfg: RateLimitConfig = DEFAULT_RATE_LIMIT,
): number {
  const cap = capForKind(kind, cfg)
  return Math.max(0, cap - sentTodayOfKind)
}

/**
 * Compute the next `count` ISO timestamps to schedule sends of `kind`,
 * starting from `now`, respecting the daily cap given a per-day-already-
 * sent map.
 *
 * The map's keys are ISO date strings (YYYY-MM-DD) and the values are
 * how many of `kind` were already sent on that day.  The returned
 * timestamps are pushed back one weekday at a time once a day's cap is
 * reached.
 */
export function nextSlotsForKind(
  now: Date,
  count: number,
  kind: MessageKind,
  alreadySentByDay: Record<string, number> = {},
  cfg: RateLimitConfig = DEFAULT_RATE_LIMIT,
): Date[] {
  const cap = capForKind(kind, cfg)
  const slots: Date[] = []
  const cur = new Date(now)
  const sent: Record<string, number> = { ...alreadySentByDay }

  // Walk forward in time, weekday by weekday, slotting up to `cap` per
  // day at evenly-spaced intervals inside the window.
  while (slots.length < count) {
    if (!isAllowedDay(cur, cfg)) {
      advanceToNextDay(cur)
      continue
    }
    const dayKey = cur.toISOString().slice(0, 10)
    const used = sent[dayKey] ?? 0
    const remaining = Math.min(cap - used, count - slots.length)
    if (remaining <= 0) {
      advanceToNextDay(cur)
      continue
    }
    // Evenly space `remaining` slots across the working window starting
    // from `cur` (or the window start if cur is before it).
    const windowStart = setHour(cur, cfg.windowStartHour)
    const windowEnd = setHour(cur, cfg.windowEndHour)
    let cursor = cur < windowStart ? new Date(windowStart) : new Date(cur)
    if (cursor > windowEnd) {
      advanceToNextDay(cur)
      continue
    }
    const minutesAvailable = Math.max(0, (windowEnd.getTime() - cursor.getTime()) / 60_000)
    const interval = Math.max(
      cfg.minIntervalMinutes,
      Math.floor(minutesAvailable / Math.max(1, remaining)),
    )
    for (let i = 0; i < remaining; i++) {
      // Add a small jitter so we don't fire on round 6-minute boundaries.
      const jitter = randomMinutes(0, Math.floor(interval / 4))
      const t = new Date(cursor.getTime() + (i * interval + jitter) * 60_000)
      if (t > windowEnd) break
      slots.push(t)
      sent[dayKey] = (sent[dayKey] ?? 0) + 1
    }
    advanceToNextDay(cur)
  }

  return slots.slice(0, count)
}

// ─── helpers ──────────────────────────────────────────────────────────────
function isAllowedDay(d: Date, cfg: RateLimitConfig): boolean {
  if (!cfg.weekdayOnly) return true
  const wd = d.getDay()
  return wd >= 1 && wd <= 5
}
function advanceToNextDay(d: Date) {
  d.setDate(d.getDate() + 1)
  d.setHours(0, 0, 0, 0)
}
function setHour(d: Date, h: number): Date {
  const o = new Date(d)
  o.setHours(h, 0, 0, 0)
  return o
}
function randomMinutes(min: number, max: number): number {
  if (max <= min) return min
  return Math.floor(Math.random() * (max - min + 1)) + min
}
