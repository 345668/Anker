/**
 * Hunter.io API client.
 *
 *   Verifier:      /v2/email-verifier?email=…
 *   Finder:        /v2/email-finder?domain=…&first_name=…&last_name=…
 *   Domain-search: /v2/domain-search?domain=…&limit=…
 *
 * Configured via env:
 *   HUNTER_API_KEY    required for any Hunter call to succeed
 *
 * The wrapper deliberately returns a small, normalised shape the rest
 * of the codebase can lean on — Hunter's raw responses are deeply
 * nested and version-sensitive.
 *
 * When the key is missing, every method returns `{ skipped: true }`
 * so callers can fall back to local-AI / format-check paths.
 */

const HUNTER_BASE = "https://api.hunter.io/v2"

export function isHunterAvailable(): boolean {
  const k = process.env.HUNTER_API_KEY
  return !!k && k.trim().length > 0 && k !== "stub"
}

function key(): string {
  const k = process.env.HUNTER_API_KEY?.trim()
  if (!k) throw new Error("HUNTER_API_KEY not set")
  return k
}

// ─── Verifier ──────────────────────────────────────────────────────────
export type HunterVerifierResult =
  | "deliverable" | "undeliverable" | "risky" | "unknown"

export interface VerifyResponse {
  ok: boolean
  email: string
  /** "deliverable" | "undeliverable" | "risky" | "unknown" */
  result: HunterVerifierResult
  /** "valid" | "invalid" | "accept_all" | "webmail" | "disposable" | "unknown" */
  status: string
  /** 0..100. Hunter's overall confidence the address is deliverable. */
  score: number
  /** Sub-flags surfaced from Hunter so the UI can explain the verdict. */
  flags: {
    regexp: boolean
    gibberish: boolean
    disposable: boolean
    webmail: boolean
    mx_records: boolean
    smtp_server: boolean
    smtp_check: boolean
    accept_all: boolean
    block: boolean
  }
  /** Free-text from Hunter for the UI's "detail" line. */
  detail: string
  /** Raw response for audit (truncated by the route). */
  raw?: any
}

export async function verifyEmail(
  email: string,
  opts: { timeoutMs?: number } = {},
): Promise<VerifyResponse> {
  if (!isHunterAvailable()) {
    return offlineVerify(email, "Hunter API key missing")
  }
  const url = new URL(`${HUNTER_BASE}/email-verifier`)
  url.searchParams.set("email", email)
  url.searchParams.set("api_key", key())
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 12_000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (res.status === 401) return offlineVerify(email, "Hunter rejected the API key (401)")
    if (res.status === 429) return offlineVerify(email, "Hunter rate-limited (429)")
    if (!res.ok) return offlineVerify(email, `Hunter ${res.status}`)
    const json = (await res.json()) as { data?: any }
    const d = json?.data ?? {}
    const flags = {
      regexp: !!d.regexp,
      gibberish: !!d.gibberish,
      disposable: !!d.disposable,
      webmail: !!d.webmail,
      mx_records: !!d.mx_records,
      smtp_server: !!d.smtp_server,
      smtp_check: !!d.smtp_check,
      accept_all: !!d.accept_all,
      block: !!d.block,
    }
    const result = (d.result ?? "unknown") as HunterVerifierResult
    const status = String(d.status ?? "unknown")
    const score = Number(d.score ?? 0)
    return {
      ok: true,
      email,
      result, status, score, flags,
      detail: detailLine(result, status, flags, score),
      raw: d,
    }
  } catch (e: any) {
    return offlineVerify(email, e?.name === "AbortError" ? "Hunter timeout" : (e?.message ?? "Hunter error"))
  } finally {
    clearTimeout(t)
  }
}

function offlineVerify(email: string, reason: string): VerifyResponse {
  return {
    ok: false,
    email,
    result: "unknown",
    status: "unknown",
    score: 0,
    flags: {
      regexp: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
      gibberish: false, disposable: false, webmail: false,
      mx_records: false, smtp_server: false, smtp_check: false,
      accept_all: false, block: false,
    },
    detail: reason,
  }
}

function detailLine(
  result: string, status: string,
  flags: VerifyResponse["flags"], score: number,
): string {
  const tags: string[] = []
  if (flags.disposable) tags.push("disposable")
  if (flags.webmail) tags.push("webmail")
  if (flags.accept_all) tags.push("accept-all")
  if (flags.gibberish) tags.push("gibberish")
  if (flags.block) tags.push("blocked")
  if (!flags.mx_records) tags.push("no-mx")
  const base = `${result} · score ${score} · ${status}`
  return tags.length ? `${base} (${tags.join(", ")})` : base
}

// ─── Finder ────────────────────────────────────────────────────────────
export interface FindResponse {
  ok: boolean
  email: string | null
  /** 0..100, Hunter's confidence in the guessed email. */
  score: number
  /** "smtp" / "pattern" / etc. */
  method: string | null
  /** Sources Hunter cited (web pages where it found the email). */
  sources?: { domain: string; uri: string; extracted_on?: string }[]
  detail: string
}

export async function findEmail(
  args: { domain: string; firstName?: string; lastName?: string; fullName?: string; company?: string },
  opts: { timeoutMs?: number } = {},
): Promise<FindResponse> {
  if (!isHunterAvailable()) {
    return { ok: false, email: null, score: 0, method: null, detail: "Hunter API key missing" }
  }
  const url = new URL(`${HUNTER_BASE}/email-finder`)
  if (args.domain) url.searchParams.set("domain", stripScheme(args.domain))
  if (args.company && !args.domain) url.searchParams.set("company", args.company)
  // Hunter accepts first_name+last_name OR full_name.  Prefer split when supplied.
  if (args.firstName) url.searchParams.set("first_name", args.firstName)
  if (args.lastName) url.searchParams.set("last_name", args.lastName)
  if (!args.firstName && !args.lastName && args.fullName) url.searchParams.set("full_name", args.fullName)
  url.searchParams.set("api_key", key())
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 12_000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (res.status === 401) return { ok: false, email: null, score: 0, method: null, detail: "Hunter 401" }
    if (res.status === 429) return { ok: false, email: null, score: 0, method: null, detail: "Hunter 429 rate-limited" }
    if (res.status === 404 || res.status === 400) return { ok: false, email: null, score: 0, method: null, detail: `Hunter ${res.status}` }
    if (!res.ok) return { ok: false, email: null, score: 0, method: null, detail: `Hunter ${res.status}` }
    const json = (await res.json()) as { data?: any }
    const d = json?.data ?? {}
    return {
      ok: true,
      email: d.email ?? null,
      score: Number(d.score ?? 0),
      method: d.method ?? null,
      sources: Array.isArray(d.sources) ? d.sources.slice(0, 5) : undefined,
      detail: d.email ? `Hunter found via ${d.method ?? "?"} (score ${d.score ?? 0})` : "Hunter no match",
    }
  } catch (e: any) {
    return { ok: false, email: null, score: 0, method: null, detail: e?.message ?? "Hunter error" }
  } finally {
    clearTimeout(t)
  }
}

// ─── Domain-search ─────────────────────────────────────────────────────
export interface DomainSearchEmail {
  value: string
  type: string | null            // "personal" / "generic"
  confidence: number             // 0..100
  first_name: string | null
  last_name: string | null
  position: string | null
  department: string | null
  linkedin: string | null
}

export async function domainSearch(
  domain: string,
  opts: { limit?: number; type?: "personal" | "generic"; timeoutMs?: number } = {},
): Promise<{ ok: boolean; domain: string; emails: DomainSearchEmail[]; detail: string }> {
  if (!isHunterAvailable()) {
    return { ok: false, domain, emails: [], detail: "Hunter API key missing" }
  }
  const url = new URL(`${HUNTER_BASE}/domain-search`)
  url.searchParams.set("domain", stripScheme(domain))
  url.searchParams.set("limit", String(Math.max(1, Math.min(100, opts.limit ?? 25))))
  if (opts.type) url.searchParams.set("type", opts.type)
  url.searchParams.set("api_key", key())
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 12_000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) return { ok: false, domain, emails: [], detail: `Hunter ${res.status}` }
    const json = (await res.json()) as { data?: any }
    const d = json?.data ?? {}
    const emails: DomainSearchEmail[] = Array.isArray(d.emails)
      ? d.emails.map((e: any) => ({
          value: String(e.value ?? ""),
          type: e.type ?? null,
          confidence: Number(e.confidence ?? 0),
          first_name: e.first_name ?? null,
          last_name: e.last_name ?? null,
          position: e.position ?? null,
          department: e.department ?? null,
          linkedin: e.linkedin ?? null,
        })).filter((e: DomainSearchEmail) => !!e.value)
      : []
    return { ok: true, domain: d.domain ?? domain, emails, detail: `${emails.length} email(s)` }
  } catch (e: any) {
    return { ok: false, domain, emails: [], detail: e?.message ?? "Hunter error" }
  } finally {
    clearTimeout(t)
  }
}

function stripScheme(s: string): string {
  return s.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0]
}
