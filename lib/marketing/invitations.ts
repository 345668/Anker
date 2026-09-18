import "server-only"
import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { sql } from "@/lib/db"

/**
 * Per-applicant early-access invitations.
 *
 * Replaces the single shared SIGNUP_INVITE_CODE for newly invited applicants.
 * Only the SHA-256 hash of a token is stored; the raw value is returned once at
 * mint and cannot be recovered afterwards — the same shape as mcp_tokens and
 * extension_tokens.
 *
 * Tokens are single-use and email-bound. Redemption requires the signup address
 * to equal the invited address, and spends the token by setting accepted_at.
 * That is what makes "accepted" an observed fact rather than an assertion, and
 * it means a token forwarded to someone else is useless to them.
 */

/**
 * Invitation lifetime, in days.
 *
 * WAITLIST_INVITE_TTL_DAYS sets the default for every invitation; a single send
 * can override it (the console and the staff portal both expose this). Bounded
 * on purpose: an unbounded lifetime turns a one-off credential into a permanent
 * one, and a zero-day token would be dead before it was read. A malformed or
 * out-of-range value falls back to the default rather than failing the send —
 * an env typo must not be able to mint tokens that never expire.
 */
export const INVITE_TTL_DEFAULT_DAYS = 14
export const INVITE_TTL_MIN_DAYS = 1
export const INVITE_TTL_MAX_DAYS = 90

export function clampTtlDays(value: unknown): number | null {
  const days = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN
  if (!Number.isFinite(days)) return null
  const whole = Math.floor(days)
  if (whole < INVITE_TTL_MIN_DAYS || whole > INVITE_TTL_MAX_DAYS) return null
  return whole
}

/** The configured default, or 14 when unset or out of range. */
export function configuredTtlDays(): number {
  return clampTtlDays(process.env.WAITLIST_INVITE_TTL_DAYS) ?? INVITE_TTL_DEFAULT_DAYS
}

const TOKEN_BYTES = 24

export type RequestStatus = "pending" | "approved" | "invited" | "accepted" | "declined" | "revoked"

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

/** Constant-time compare for the email binding. */
function sameEmail(a: string, b: string): boolean {
  const x = Buffer.from(normalizeEmail(a))
  const y = Buffer.from(normalizeEmail(b))
  return x.length === y.length && timingSafeEqual(x, y)
}

export interface MintedInvite {
  token: string
  expiresAt: Date
  email: string
  ttlDays: number
}

/**
 * Issue an invitation for one request. Returns the raw token exactly once.
 *
 * Minting replaces any previous unredeemed token for that request, so a resend
 * invalidates the earlier link rather than leaving two live ways in. An already
 * accepted request is never re-invited: that would hand out a second credential
 * for an account that exists.
 */
export async function mintInvite(requestId: string, options: { ttlDays?: unknown } = {}): Promise<MintedInvite | null> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url")
  const ttlDays = clampTtlDays(options.ttlDays) ?? configuredTtlDays()
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000)
  const rows = (await sql`
    UPDATE early_access_requests SET
      invite_token_hash = ${hashInviteToken(token)},
      invite_email_key  = email_key,
      invited_at        = now(),
      invite_expires_at = ${expiresAt.toISOString()}::timestamptz,
      revoked_at        = NULL,
      invite_error      = NULL,
      status            = 'invited',
      updated_at        = now()
    WHERE id = ${requestId}
      AND accepted_at IS NULL
      AND status IN ('pending','approved','invited','revoked')
    RETURNING email`) as Array<{ email: string }>
  if (!rows.length) return null
  return { token, expiresAt, email: rows[0].email, ttlDays }
}

export interface VerifyResult {
  ok: boolean
  /** Safe to show a visitor: never reveals whether a token merely exists. */
  reason?: string
  requestId?: string
}

export const INVITE_REJECTED_MESSAGE =
  "That invitation link is not valid for this email address, or it has already been used."

/**
 * Check an invitation without spending it. The signup email must match the
 * invited one.
 *
 * Verification is separate from spending because an account can still fail to
 * be created after this point (weak password, address already registered). A
 * token burnt on a failed attempt would lock out the very person it was for.
 * Callers spend it with markInviteAccepted() once the account exists.
 *
 * Every failure returns the same message on purpose. Distinguishing "unknown
 * token" from "wrong email" would turn this into an oracle for probing which
 * addresses have been invited.
 */
export async function verifyInvite(token: string, signupEmail: string): Promise<VerifyResult> {
  const generic = { ok: false as const, reason: INVITE_REJECTED_MESSAGE }
  const candidate = String(token || "").trim()
  if (!candidate || !signupEmail) return generic

  const rows = (await sql`
    SELECT id, email, invite_email_key, invite_expires_at, accepted_at, revoked_at
    FROM early_access_requests
    WHERE invite_token_hash = ${hashInviteToken(candidate)}
    LIMIT 1`) as Array<{
      id: string; email: string; invite_email_key: string | null
      invite_expires_at: string | null; accepted_at: string | null; revoked_at: string | null
    }>
  const row = rows[0]
  if (!row) return generic
  if (row.accepted_at) return generic          // single-use: already spent
  if (row.revoked_at) return generic
  if (row.invite_expires_at && new Date(row.invite_expires_at).getTime() < Date.now()) return generic
  if (!sameEmail(row.invite_email_key ?? row.email, signupEmail)) return generic

  return { ok: true, requestId: row.id }
}

/**
 * Spend the invitation once the account exists.
 *
 * The accepted_at IS NULL guard makes two concurrent signups resolve to one
 * winner. It is not the primary defence — Supabase rejects the second account
 * for the same address — but it keeps accepted_at meaning "the first time this
 * invitation produced an account".
 */
export async function markInviteAccepted(requestId: string): Promise<boolean> {
  const rows = (await sql`
    UPDATE early_access_requests SET
      accepted_at = now(), status = 'accepted', updated_at = now()
    WHERE id = ${requestId} AND accepted_at IS NULL
    RETURNING id`) as Array<{ id: string }>
  return rows.length > 0
}

/** Withdraw access before it is used. An accepted request is left alone — the
 *  account already exists and removing it is a separate, deliberate action. */
export async function revokeInvite(requestId: string): Promise<boolean> {
  const rows = (await sql`
    UPDATE early_access_requests SET
      revoked_at = now(), invite_token_hash = NULL, status = 'revoked', updated_at = now()
    WHERE id = ${requestId} AND accepted_at IS NULL
    RETURNING id`) as Array<{ id: string }>
  return rows.length > 0
}

/** Move a request out of the queue without inviting yet. */
export async function setRequestStatus(requestId: string, status: "approved" | "declined"): Promise<boolean> {
  const rows = (await sql`
    UPDATE early_access_requests SET
      status = ${status},
      approved_at = CASE WHEN ${status} = 'approved' THEN COALESCE(approved_at, now()) ELSE approved_at END,
      updated_at = now()
    WHERE id = ${requestId} AND accepted_at IS NULL
    RETURNING id`) as Array<{ id: string }>
  return rows.length > 0
}

/** The link an invited applicant receives. */
export function inviteUrl(token: string, origin?: string): string {
  const base = origin || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://www.an-ker.de"
  return `${base.replace(/\/+$/, "")}/register?invite=${encodeURIComponent(token)}`
}
