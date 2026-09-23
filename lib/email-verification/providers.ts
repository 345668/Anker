/**
 * Stage 2 — mailbox verification providers (doc 13 §2). Each adapter maps the
 * provider's own vocabulary onto ours. Only the address is sent.
 *
 * Mappings are written against the providers' documented responses; they are
 * held by tests with recorded response shapes, not by live calls.
 */
import { readRouterConfig } from "@/lib/ai/runtime-config"
import type { VerificationStatus } from "./types"

export interface ProviderResult {
  status: VerificationStatus
  reason: string | null
  mxFound: boolean | null
  /** Provider response, minus the address it echoes. */
  raw: Record<string, unknown>
}

export interface VerificationProvider {
  id: "zerobounce" | "neverbounce"
  verify(email: string, key: string, fetchImpl?: typeof fetch): Promise<ProviderResult>
}

function stripAddress(json: any): Record<string, unknown> {
  const { address: _a, email: _e, ...rest } = json ?? {}
  return rest
}

async function getJson(url: string, fetchImpl: typeof fetch): Promise<any> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 20_000)
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, headers: { Accept: "application/json" } })
    const text = await res.text()
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 160)}`)
    try { return JSON.parse(text) } catch { throw new Error(`non-JSON response: ${text.slice(0, 160)}`) }
  } finally {
    clearTimeout(t)
  }
}

/** ZeroBounce v2 — https://api.zerobounce.net/v2/validate */
export const zeroBounce: VerificationProvider = {
  id: "zerobounce",
  async verify(email, key, fetchImpl = fetch) {
    const url = `https://api.zerobounce.net/v2/validate?api_key=${encodeURIComponent(key)}&email=${encodeURIComponent(email)}&ip_address=`
    const json = await getJson(url, fetchImpl)
    if (json?.error) throw new Error(`zerobounce: ${String(json.error).slice(0, 160)}`)
    const status = String(json?.status ?? "").toLowerCase()
    const sub = String(json?.sub_status ?? "").toLowerCase() || null
    const mxFound = json?.mx_found == null ? null : String(json.mx_found).toLowerCase() === "true"
    const raw = stripAddress(json)
    switch (status) {
      case "valid": return { status: "valid", reason: null, mxFound, raw }
      case "invalid": return { status: "invalid", reason: sub ?? "mailbox", mxFound, raw }
      case "catch-all": return { status: "risky", reason: "catch_all", mxFound, raw }
      case "spamtrap": return { status: "invalid", reason: "spamtrap", mxFound, raw }
      case "abuse": return { status: "invalid", reason: "abuse", mxFound, raw }
      case "do_not_mail":
        if (sub === "role_based" || sub === "role_based_catch_all") return { status: "risky", reason: "role", mxFound, raw }
        if (sub === "disposable") return { status: "risky", reason: "disposable", mxFound, raw }
        return { status: "invalid", reason: sub ?? "do_not_mail", mxFound, raw }
      case "unknown": return { status: "unknown", reason: sub ?? "provider_unknown", mxFound, raw }
      default: throw new Error(`zerobounce: unexpected status "${status}"`)
    }
  },
}

/** NeverBounce v4 — https://api.neverbounce.com/v4/single/check */
export const neverBounce: VerificationProvider = {
  id: "neverbounce",
  async verify(email, key, fetchImpl = fetch) {
    const url = `https://api.neverbounce.com/v4/single/check?key=${encodeURIComponent(key)}&email=${encodeURIComponent(email)}`
    const json = await getJson(url, fetchImpl)
    if (json?.status !== "success") throw new Error(`neverbounce: ${String(json?.message ?? json?.status ?? "error").slice(0, 160)}`)
    const result = String(json?.result ?? "").toLowerCase()
    const flags: string[] = Array.isArray(json?.flags) ? json.flags : []
    const mxFound = flags.includes("has_dns_mx") ? true : null
    const raw = stripAddress(json)
    switch (result) {
      case "valid": return { status: "valid", reason: null, mxFound, raw }
      case "invalid": return { status: "invalid", reason: "mailbox", mxFound, raw }
      case "disposable": return { status: "risky", reason: "disposable", mxFound, raw }
      case "catchall": return { status: "risky", reason: "catch_all", mxFound, raw }
      case "unknown": return { status: "unknown", reason: "provider_unknown", mxFound, raw }
      default: throw new Error(`neverbounce: unexpected result "${result}"`)
    }
  },
}

export const PROVIDERS = { zerobounce: zeroBounce, neverbounce: neverBounce } as const

/**
 * The configured provider and key, or null when stage 2 is off (doc 13 §6).
 *
 * The environment wins, so a deployment can pin its own key; otherwise the
 * key comes from the shared runtime config, where the SAIL portal writes it
 * encrypted (CONFIG_ENC_KEY). Either way it is never returned to a browser.
 */
export async function configuredProvider(): Promise<{ provider: VerificationProvider; key: string; source: "env" | "settings" } | null> {
  const envKey = (process.env.EMAIL_VERIFICATION_API_KEY ?? "").trim()
  if (envKey) {
    const id = (process.env.EMAIL_VERIFICATION_PROVIDER ?? "zerobounce").trim().toLowerCase()
    const provider = PROVIDERS[id as keyof typeof PROVIDERS]
    return provider ? { provider, key: envKey, source: "env" } : null
  }
  const cfg = await readRouterConfig().catch(() => null)
  const key = (cfg?.emailVerificationApiKey ?? "").trim()
  if (!key) return null
  const id = (cfg?.emailVerificationProvider ?? "zerobounce").trim().toLowerCase()
  const provider = PROVIDERS[id as keyof typeof PROVIDERS]
  return provider ? { provider, key, source: "settings" } : null
}

export function dailyLimit(): number {
  const n = Number(process.env.EMAIL_VERIFICATION_DAILY_LIMIT ?? 500)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 500
}
