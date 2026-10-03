/**
 * Typed AI failures. Doc 35.
 *
 * `generate()` used to return "" for every failure, and the routes turned "" into
 * one sentence and one status. A provider 429, a rejected key, a switched-off task
 * and an unreadable configuration were indistinguishable to the user, to the
 * operator and to the retry logic — which is how a rate limit read as an outage.
 *
 * The kind is derived once, here, from what the provider actually said. Provider
 * detail (status text, raw error) stays server-side; the user gets a safe message
 * and, where it helps, retry guidance and a request id to quote.
 *
 * Pure: no I/O, no framework imports, so routes and tests share one definition.
 */

export type AiFailureKind =
  | "rate_limited"        // upstream 429: wait and retry
  | "quota_exhausted"     // an allowance is spent: retrying will not help
  | "credentials_invalid" // the provider rejected the key (or its region)
  | "no_provider"         // nothing configured, or the pinned provider has no key
  | "model_unavailable"   // the model id is unknown or not entitled
  | "task_disabled"       // an admin switched this feature off
  | "config_unreadable"   // stored configuration could not be decrypted/read
  | "cancelled"           // the caller went away
  | "timeout"             // deadline reached
  | "provider_error"      // 5xx or anything unrecognised

export interface AiFailure {
  kind: AiFailureKind
  /** Would the same request plausibly succeed if sent again shortly? */
  retryable: boolean
  /** Upstream HTTP status when there was one. */
  status?: number
  /** Provider-suggested wait, when it gave one. */
  retryAfterSec?: number
  /** Safe to show a user. Never contains provider text, keys or hosts. */
  message: string
}

const SAFE_MESSAGE: Record<AiFailureKind, string> = {
  rate_limited: "The AI service is busy right now. Please retry in a minute.",
  quota_exhausted: "The AI provider's usage allowance has been reached. An administrator needs to restore capacity; retrying will not help yet.",
  credentials_invalid: "The AI service rejected its credentials. An administrator needs to check the provider key and region.",
  no_provider: "No AI provider is configured. An administrator needs to add one in AI settings.",
  model_unavailable: "The selected AI model is not available. Try another model or ask an administrator.",
  task_disabled: "This AI feature has been switched off by an administrator.",
  config_unreadable: "The AI configuration could not be read. An administrator needs to check the deployment's encryption key.",
  cancelled: "The request was cancelled.",
  timeout: "The AI service took too long to respond. Please retry.",
  provider_error: "The AI service had a temporary problem. Please retry.",
}

const RETRYABLE: ReadonlySet<AiFailureKind> = new Set(["rate_limited", "timeout", "provider_error"])

/** HTTP status a route should answer with. Configuration problems are 503 (the
 *  server cannot serve, and the user cannot fix it); a busy provider is 429. */
const HTTP_STATUS: Record<AiFailureKind, number> = {
  rate_limited: 429,
  quota_exhausted: 503,
  credentials_invalid: 503,
  no_provider: 503,
  model_unavailable: 502,
  task_disabled: 503,
  config_unreadable: 503,
  cancelled: 499,
  timeout: 504,
  provider_error: 502,
}

export const httpStatusFor = (kind: AiFailureKind): number => HTTP_STATUS[kind]

/**
 * Work out what went wrong from what the provider said.
 *
 * Order matters and is deliberate: an admin switch and a missing key are named
 * before any HTTP reasoning, because they never reached a provider; quota is
 * separated from rate limiting inside the 429 branch, because the advice
 * (retry vs. don't) is opposite.
 */
export function classifyFailure(input: { status?: number | null; error?: string | null }): AiFailureKind {
  const status = input.status ?? undefined
  const e = (input.error ?? "").toLowerCase()

  if (/disabled by admin|task .* disabled/.test(e)) return "task_disabled"
  if (/could not be decrypted|cannot be decrypted|config_enc_key|configuration (is )?unreadable/.test(e)) return "config_unreadable"
  if (/no ai provider|no .*api key (configured|saved)|key is missing|key missing|not configured|no key saved|is selected .* no .* key is saved/.test(e)) return "no_provider"
  if (/abort|cancel/.test(e) && !/timeout/.test(e)) return "cancelled"
  if (/timed out|timeout|time limit/.test(e)) return "timeout"

  // A spent free allowance is a quota problem whatever the status: DashScope sends
  // 403 AllocationQuota.FreeTierOnly, which the 401/403 branch would call a bad key.
  if (/free.?tier|allocation.?quota|free allocated quota/.test(e)) return "quota_exhausted"

  if (status === 429 || /rate.?limit|too many requests|throttl/.test(e)) {
    if (/quota|insufficient|billing|arrearage|balance|allocated|exceeded your current|credit/.test(e)) return "quota_exhausted"
    return "rate_limited"
  }
  if (status === 401 || status === 403 || /invalid api key|incorrect api key|invalid_api_key|unauthori[sz]ed|authentication|forbidden|access denied/.test(e)) {
    // A 403 that is really "this key is not entitled to that model" is a model
    // problem, not a credential one. The provider's wording is the only signal.
    if (/model/.test(e) && /(not (found|exist|support|entitled|allowed)|no access|unavailable)/.test(e)) return "model_unavailable"
    return "credentials_invalid"
  }
  if (status === 404 || /model/.test(e) && /(not found|does not exist|not exist|not supported|unavailable|invalid model|deprecated|decommission)/.test(e)) {
    return "model_unavailable"
  }
  return "provider_error"
}

/** Seconds from a retry hint such as "retry in 12s" / "Retry-After: 7", else undefined. */
export function retryAfterFrom(error: string | null | undefined): number | undefined {
  const m = (error ?? "").match(/retry[- ]?(?:after|in)[^0-9]{0,4}([0-9]+(?:\.[0-9]+)?)\s*s?/i)
  if (!m) return undefined
  const n = Math.ceil(parseFloat(m[1]))
  return Number.isFinite(n) && n > 0 && n <= 3600 ? n : undefined
}

export function buildFailure(input: { status?: number | null; error?: string | null }): AiFailure {
  const kind = classifyFailure(input)
  return {
    kind,
    retryable: RETRYABLE.has(kind),
    status: input.status ?? undefined,
    retryAfterSec: kind === "rate_limited" ? (retryAfterFrom(input.error) ?? 30) : undefined,
    message: SAFE_MESSAGE[kind],
  }
}

/** The JSON a route returns. `requestId` is what a user quotes; the provider's own
 *  text is deliberately absent. */
export function failureBody(f: AiFailure, requestId: string) {
  return {
    error: f.message,
    code: f.kind,
    retryable: f.retryable,
    ...(f.retryAfterSec ? { retryAfterSec: f.retryAfterSec } : {}),
    requestId,
  }
}

/** Short, collision-resistant enough to quote in a support message. */
export function newRequestId(): string {
  const r = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  return r.replace(/-/g, "").slice(0, 12)
}
