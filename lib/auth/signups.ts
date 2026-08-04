// Single source of truth for whether new-account registration is open.
//
// Set to `false` to disable all sign-ups: the API route rejects new accounts
// and the UI surfaces a "registration closed" state instead of the sign-up form
// and "Get started" calls-to-action.
export const SIGNUPS_ENABLED = false

// User-facing copy shown wherever registration would normally be offered.
export const SIGNUPS_CLOSED_MESSAGE =
  "New account registration is currently closed. Please contact us if you need access."

// Invite-link bypass: even when sign-ups are closed, a link carrying
// ?invite=<SIGNUP_INVITE_CODE> may register. Server-side only — the env var
// is not exposed to the client; the client just forwards whatever code the
// URL carried and the API route is the sole authority.
export function isValidInviteCode(code: unknown): boolean {
  const expected = process.env.SIGNUP_INVITE_CODE
  if (!expected) return false
  return typeof code === "string" && code.length > 0 && code === expected
}
