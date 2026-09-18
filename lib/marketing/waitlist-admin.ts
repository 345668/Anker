import "server-only"
import { sql } from "@/lib/db"
import { sendEmail } from "@/lib/email/resend"
import {
  clampTtlDays,
  configuredTtlDays,
  inviteUrl,
  mintInvite,
  revokeInvite,
  setRequestStatus,
  INVITE_TTL_MAX_DAYS,
  INVITE_TTL_MIN_DAYS,
} from "./invitations"

/**
 * The early-access queue's operations, in one place.
 *
 * Two front ends drive this: the owner console inside Anker and the staff
 * portal (SAIL), which reaches it through /api/admin/waitlist. They must not
 * hold separate copies of the lifecycle — a rule enforced in one and not the
 * other is worse than no rule, and the portal's own proxy notes record that
 * duplicated helpers have already drifted before.
 */

export const REQUEST_STATES = ["pending", "approved", "invited", "accepted", "declined", "revoked"] as const
export type RequestState = (typeof REQUEST_STATES)[number]
export const isRequestState = (value: unknown): value is RequestState =>
  typeof value === "string" && (REQUEST_STATES as readonly string[]).includes(value)

export type ActionResult = { ok: boolean; message: string }

export interface WaitlistRow {
  id: string
  name: string | null
  email: string
  persona: string | null
  company: string | null
  status: string
  referral_source: string | null
  created_at: string
  invited_at: string | null
  invite_expires_at: string | null
  accepted_at: string | null
  invite_error: string | null
}

export interface WaitlistPage {
  rows: WaitlistRow[]
  counts: Record<string, number>
  hasMore: boolean
  page: number
  status: RequestState | null
  /** So a client can render the TTL control without hard-coding the bounds. */
  ttl: { default: number; min: number; max: number }
}

const PAGE_SIZE = 50

export async function listRequests(input: { page?: unknown; status?: unknown } = {}): Promise<WaitlistPage> {
  const page = Math.max(1, Math.min(10_000, Number.parseInt(String(input.page ?? "1"), 10) || 1))
  const status = isRequestState(input.status) ? input.status : null
  const rows = (await sql`SELECT id,name,email,persona,company,status,referral_source,created_at,
      invited_at,invite_expires_at,accepted_at,invite_error
    FROM early_access_requests
    WHERE email_key IS NOT NULL AND (${status}::text IS NULL OR status = ${status})
    ORDER BY created_at DESC,id DESC LIMIT ${PAGE_SIZE + 1} OFFSET ${(page - 1) * PAGE_SIZE}`) as WaitlistRow[]
  const tally = (await sql`SELECT status, count(*)::int AS n FROM early_access_requests
    WHERE email_key IS NOT NULL GROUP BY status`) as Array<{ status: string; n: number }>
  return {
    rows: rows.slice(0, PAGE_SIZE),
    counts: Object.fromEntries(tally.map(r => [r.status, r.n])),
    hasMore: rows.length > PAGE_SIZE,
    page,
    status,
    ttl: { default: configuredTtlDays(), min: INVITE_TTL_MIN_DAYS, max: INVITE_TTL_MAX_DAYS },
  }
}

/** Accept or reject a request without sending anything yet. */
export async function decideRequest(requestId: string, decision: "approved" | "declined"): Promise<ActionResult> {
  const changed = await setRequestStatus(requestId, decision)
  return changed
    ? { ok: true, message: decision === "approved" ? "Approved. Send the invitation when you're ready." : "Declined." }
    : { ok: false, message: "That request has already been accepted and can't be changed here." }
}

/**
 * Mint a token and email the invitation.
 *
 * The raw token is never persisted and never returned to the caller — it exists
 * only inside this call and inside the email. So if delivery fails the token is
 * unreachable by anyone: the failure is recorded, the hash cleared and the row
 * put back to 'approved' rather than left claiming an invitation is
 * outstanding.
 *
 * ttlDays overrides WAITLIST_INVITE_TTL_DAYS for this send only. Out-of-range
 * values fall back to the configured default instead of being rejected.
 */
export async function dispatchInvitation(requestId: string, options: { ttlDays?: unknown } = {}): Promise<ActionResult> {
  const minted = await mintInvite(requestId, { ttlDays: options.ttlDays })
  if (!minted) return { ok: false, message: "That request can't be invited — it may already have been accepted." }

  const link = inviteUrl(minted.token)
  const expires = minted.expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  try {
    const sent = await sendEmail({
      to: minted.email,
      subject: "Your Anker invitation",
      // Transactional: no open/click tracking on an access credential.
      noTracking: true,
      text: [
        "You asked for early access to Anker. Here is your invitation.",
        "",
        link,
        "",
        `This link works once, only for ${minted.email}, and expires on ${expires}.`,
        "If you didn't request access, you can ignore this email.",
      ].join("\n"),
      html: `<p>You asked for early access to Anker. Here is your invitation.</p>
<p><a href="${link}">Create your Anker account</a></p>
<p>This link works once, only for ${minted.email}, and expires on ${expires}.</p>
<p>If you didn’t request access, you can ignore this email.</p>`,
    })
    // Store Resend's id so delivery reconciles through the existing
    // resend-sync path instead of a second, parallel mechanism.
    await sql`UPDATE early_access_requests
      SET invite_resend_id = ${sent.resendId}, invite_error = NULL, updated_at = now()
      WHERE id = ${requestId}`
    return { ok: true, message: `Invitation sent to ${minted.email}. The link expires on ${expires}.` }
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 500) : "send failed"
    console.error("[waitlist] invitation send failed", { requestId })
    await sql`UPDATE early_access_requests SET
        invite_error = ${detail},
        invite_token_hash = NULL,
        status = 'approved',
        updated_at = now()
      WHERE id = ${requestId} AND accepted_at IS NULL`
    return { ok: false, message: "The invitation could not be sent, so no access was granted. Try again." }
  }
}

/** Withdraw an unused invitation. */
export async function withdrawInvitation(requestId: string): Promise<ActionResult> {
  const revoked = await revokeInvite(requestId)
  return revoked
    ? { ok: true, message: "Invitation revoked. The link no longer works." }
    : { ok: false, message: "This request was already accepted — revoking the link would not remove the account." }
}

export type WaitlistAction = "approve" | "decline" | "invite" | "revoke"
const ACTIONS: WaitlistAction[] = ["approve", "decline", "invite", "revoke"]
export const isWaitlistAction = (v: unknown): v is WaitlistAction =>
  typeof v === "string" && ACTIONS.includes(v as WaitlistAction)

/** One entry point, so both front ends dispatch the same set of verbs. */
export async function runWaitlistAction(
  action: WaitlistAction, requestId: string, options: { ttlDays?: unknown } = {},
): Promise<ActionResult> {
  if (!requestId) return { ok: false, message: "No request was given." }
  switch (action) {
    case "approve": return decideRequest(requestId, "approved")
    case "decline": return decideRequest(requestId, "declined")
    case "invite": return dispatchInvitation(requestId, options)
    case "revoke": return withdrawInvitation(requestId)
  }
}

export { clampTtlDays, configuredTtlDays }
