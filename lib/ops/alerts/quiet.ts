/**
 * Quiet hours (docs/architecture/56 A2). Urgent faults (severity 1) always come through. Severity 2 is held from 22:00 to 07:00 Europe/Berlin and delivered in the morning
 * digest; severity 3 is only ever in the digest. Berlin time is read with Intl so summer time is right.
 */
export interface Quiet { start: number; end: number; tz: string }
export const DEFAULT_QUIET: Quiet = { start: 22, end: 7, tz: "Europe/Berlin" }

function parts(now: number, tz: string): { hour: number; day: string } {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit" }).formatToParts(new Date(now))
  const g = (t: string) => f.find((p) => p.type === t)!.value
  return { hour: Number(g("hour")), day: `${g("year")}-${g("month")}-${g("day")}` }
}
export const localHour = (now: number, q: Quiet = DEFAULT_QUIET) => parts(now, q.tz).hour
export const localDay = (now: number, q: Quiet = DEFAULT_QUIET) => parts(now, q.tz).day
/** True from `start` (inclusive) to `end` (exclusive), wrapping midnight. */
export function inQuietHours(now: number, q: Quiet = DEFAULT_QUIET): boolean {
  const h = localHour(now, q)
  return q.start === q.end ? false : q.start > q.end ? h >= q.start || h < q.end : h >= q.start && h < q.end
}
