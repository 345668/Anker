/** The pure rules of send authorizations. docs/architecture/46. No I/O. */
import { createHash } from "node:crypto"

export const AUTH_EXPIRY_DAYS = 7
/** A batch larger than this needs the person to type the count (doc 46 §11). */
export const TYPED_COUNT_ABOVE = 25
/** At most this many sends per sender per executor tick: a long batch spreads over ticks instead of bursting. */
export const PER_TICK = 20
export const STALE_SENDING_MS = 10 * 60_000
export const MAX_ATTEMPTS = 3
/** Resend honours an idempotency key for 24 hours; past this a stale send is reconciled by a person, not retried. */
export const IDEMPOTENCY_SAFE_MS = 23 * 3_600_000
export const MAX_AUTHORIZED_PER_BATCH = 500
/** A dated sequence spans at most this many days, and its approval lasts until its last step plus a short grace (doc 46 §18). */
export const MAX_SEQUENCE_DAYS = 30
export const SEQUENCE_GRACE_DAYS = 2
export const sequenceOffsetDays = (step: number) => Math.max(0, Math.min(MAX_SEQUENCE_DAYS, Math.floor(Number(step) || 0)))

export type Provider = "resend" | "gmail" | "linkedin"
export * from "./verdicts"
import { VERDICT_TEXT, type VerdictCode } from "./verdicts"

export interface HashParts { to: string; cc: string[]; bcc: string[]; subject: string; body: string; provider: Provider; accountId: string | null; senderUserId: string }
const norm = (xs: string[]) => [...new Set(xs.map((x) => x.trim().toLowerCase()).filter(Boolean))].sort()

/** What the person approved: recipient, copies, subject, text and the mailbox. A different hash at send time means it does not go. */
export function contentHash(p: HashParts): string {
  return createHash("sha256").update(JSON.stringify([p.to.trim().toLowerCase(), norm(p.cc), norm(p.bcc), p.subject.trim(), p.body, p.provider, p.accountId ?? "", p.senderUserId])).digest("hex").slice(0, 40)
}

export interface DigestItem { messageId: string; contentHash: string; /** Sequences only: days after the start this step goes. */ offsetDays?: number }
/** One value for the previewed set, so a confirm can prove it is for exactly what was shown. */
export function digestOf(items: DigestItem[], opts: { provider: Provider; accountId: string | null; mode: "send" | "test"; sendAfter: string | null; sequence?: boolean }): string {
  const sorted = [...items].sort((a, b) => a.messageId.localeCompare(b.messageId))
  return createHash("sha256").update(JSON.stringify([opts.provider, opts.accountId ?? "", opts.mode, opts.sendAfter ?? "", sorted.map((i) => (opts.sequence ? [i.messageId, i.contentHash, i.offsetDays ?? 0] : [i.messageId, i.contentHash])), ...(opts.sequence ? ["sequence"] : [])])).digest("hex").slice(0, 40)
}

export const needsTypedCount = (n: number) => n > TYPED_COUNT_ABOVE

/** Days a batch will take at the daily cap, counting what is left today. */
export function daysNeeded(n: number, remainingToday: number, dailyCap: number): number {
  if (n <= 0) return 0
  if (n <= remainingToday) return 1
  return 1 + Math.ceil((n - remainingToday) / Math.max(1, dailyCap))
}

export interface StopFacts { entryMissing: boolean; replied: boolean; bouncedOrComplained: boolean; stagePassed: boolean; followUpsPaused: boolean; duplicateRecent: boolean; kind: string }
/** Conditions checked at the moment of sending (doc 46 §5). Returns the reason it must not go, or null. */
export function stopReason(f: StopFacts): { code: VerdictCode; reason: string } | null {
  if (f.entryMissing) return { code: "not_found", reason: "The contact no longer exists." }
  if (f.bouncedOrComplained) return { code: "bounced", reason: VERDICT_TEXT.bounced }
  if (f.replied && f.kind !== "reply") return { code: "already_replied", reason: "They replied since this was approved, so the rest of the sequence stops." }
  if (f.stagePassed) return { code: "stage_passed", reason: VERDICT_TEXT.stage_passed }
  if (f.followUpsPaused) return { code: "follow_ups_paused", reason: VERDICT_TEXT.follow_ups_paused }
  if (f.duplicateRecent) return { code: "duplicate_recent", reason: VERDICT_TEXT.duplicate_recent }
  return null
}

/** Minutes to wait before attempt n+1 of a transient provider failure. */
export const backoffMinutes = (attempts: number) => Math.min(60, 5 * 2 ** Math.max(0, attempts - 1))
