// Single source of truth for whether new-account registration is open.
//
// `SIGNUPS_ENABLED` controls the FUNCTION: when true the sign-up form works and
// the /api/auth/sign-up route accepts new accounts; when false it rejects them
// and the UI shows a "registration closed" state.
export const SIGNUPS_ENABLED = true

// `SIGNUP_CTA_VISIBLE` controls VISIBILITY of the public "Get started" / sign-up
// links (nav button, login-page link). Kept false so registration is never
// advertised publicly.
export const SIGNUP_CTA_VISIBLE = false

// `SIGNUP_REQUIRES_INVITE` — registration is INVITE-ONLY: a valid `?invite=`
// token is required. The token is validated server-side in /api/auth/sign-up
// against the SIGNUP_INVITE_CODE env var (a shared secret). The private
// invitation link is: https://www.an-ker.de/register?invite=<SIGNUP_INVITE_CODE>
// Without a valid invite the form is hidden and the API returns 403.
export const SIGNUP_REQUIRES_INVITE = true

// User-facing copy shown wherever registration would normally be offered.
export const SIGNUPS_CLOSED_MESSAGE =
  "New account registration is currently closed. Please contact us if you need access."

// Copy shown when someone reaches the sign-up page without a valid invite.
export const SIGNUP_INVITE_REQUIRED_MESSAGE =
  "Registration is by invitation only. Please use the private invitation link you were sent."

// Invite-link bypass: even when sign-ups are closed, a link carrying
// ?invite=<SIGNUP_INVITE_CODE> may register. Server-side only — the env var
// is not exposed to the client; the client just forwards whatever code the
// URL carried and the API route is the sole authority.
export function isValidInviteCode(code: unknown): boolean {
  const expected = process.env.SIGNUP_INVITE_CODE
  if (!expected) return false
  return typeof code === "string" && code.length > 0 && code === expected
}
