// Single source of truth for whether new-account registration is open.
//
// Set to `false` to disable all sign-ups: the API route rejects new accounts
// and the UI surfaces a "registration closed" state instead of the sign-up form
// and "Get started" calls-to-action.
export const SIGNUPS_ENABLED = false

// User-facing copy shown wherever registration would normally be offered.
export const SIGNUPS_CLOSED_MESSAGE =
  "New account registration is currently closed. Please contact us if you need access."
