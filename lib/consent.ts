/**
 * Cookie / tracking consent — GDPR + ePrivacy aligned.
 *
 * Principles enforced here:
 *  - Nothing non-essential loads before an explicit choice (opt-in, not opt-out).
 *  - Granular categories, each independently toggleable.
 *  - "Reject all" is as easy as "Accept all" (equal prominence in the UI).
 *  - Consent is recorded with a timestamp + policy version so it can be re-asked
 *    when the policy changes, and withdrawn at any time.
 *
 * The choice is stored BOTH in localStorage (fast client read) and a first-party
 * cookie (so the server / edge can read it too). The cookie itself is strictly
 * necessary, so storing consent needs no prior consent.
 */

export const CONSENT_COOKIE = "anker_cookie_consent"
/** Bump when the cookie policy materially changes — forces a re-prompt. */
export const CONSENT_VERSION = 1
/** How long a recorded choice is honored before we re-ask (GDPR ~12 months). */
export const CONSENT_MAX_AGE_DAYS = 365

export type ConsentCategory = "necessary" | "functional" | "analytics"

export interface ConsentState {
  v: number
  /** Strictly necessary — always true, cannot be switched off. */
  necessary: true
  /** Preferences, personalization, embedded content. */
  functional: boolean
  /** Usage measurement (Vercel Analytics, etc.). */
  analytics: boolean
  /** ISO timestamp of the recorded choice. */
  ts: string
}

export const CATEGORY_META: Record<
  ConsentCategory,
  { label: string; required?: boolean; description: string }
> = {
  necessary: {
    label: "Strictly necessary",
    required: true,
    description:
      "Required for the site to function — authentication, security, load balancing, and remembering your cookie choices. Always on.",
  },
  functional: {
    label: "Functional",
    description:
      "Remember your preferences (theme, language, saved views) and enable enhanced features. Off by default.",
  },
  analytics: {
    label: "Analytical",
    description:
      "Aggregate, privacy-preserving usage measurement so we can understand what to improve. No advertising, no cross-site tracking. Off by default.",
  },
}

/** The pre-consent baseline: only strictly-necessary is on. */
export function defaultConsent(): ConsentState {
  return { v: CONSENT_VERSION, necessary: true, functional: false, analytics: false, ts: "" }
}

/** Accept every category. */
export function grantAll(): ConsentState {
  return { v: CONSENT_VERSION, necessary: true, functional: true, analytics: true, ts: new Date().toISOString() }
}

/** Reject everything optional (necessary stays on). */
export function rejectAll(): ConsentState {
  return { v: CONSENT_VERSION, necessary: true, functional: false, analytics: false, ts: new Date().toISOString() }
}

function isValid(s: any): s is ConsentState {
  return (
    s && typeof s === "object" && s.v === CONSENT_VERSION &&
    typeof s.functional === "boolean" && typeof s.analytics === "boolean" &&
    typeof s.ts === "string" && s.ts !== ""
  )
}

function notExpired(s: ConsentState): boolean {
  const age = Date.now() - new Date(s.ts).getTime()
  return age <= CONSENT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
}

/** Read the stored choice on the client, or null if none / stale / wrong version. */
export function readConsent(): ConsentState | null {
  if (typeof document === "undefined") return null
  // Prefer the cookie (authoritative, shared with server); fall back to LS.
  const fromCookie = document.cookie
    .split("; ")
    .find((c) => c.startsWith(CONSENT_COOKIE + "="))
    ?.split("=")
    .slice(1)
    .join("=")
  const raw =
    (fromCookie && decodeURIComponent(fromCookie)) ||
    (typeof localStorage !== "undefined" ? localStorage.getItem(CONSENT_COOKIE) : null)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (isValid(parsed) && notExpired(parsed)) return parsed
  } catch {
    /* ignore malformed */
  }
  return null
}

/** Persist a choice to both the cookie and localStorage. */
export function writeConsent(state: ConsentState): void {
  if (typeof document === "undefined") return
  const value = encodeURIComponent(JSON.stringify(state))
  const secure = location.protocol === "https:" ? "; Secure" : ""
  document.cookie = `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=${CONSENT_MAX_AGE_DAYS * 24 * 60 * 60}; SameSite=Lax${secure}`
  try {
    localStorage.setItem(CONSENT_COOKIE, JSON.stringify(state))
  } catch {
    /* storage may be unavailable */
  }
  // Let listeners (analytics gate, etc.) react without a reload.
  window.dispatchEvent(new CustomEvent("anker:consent-changed", { detail: state }))
}

/** Event other components dispatch to re-open the preferences dialog. */
export const OPEN_PREFERENCES_EVENT = "anker:open-cookie-preferences"

export function openCookiePreferences(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OPEN_PREFERENCES_EVENT))
}
