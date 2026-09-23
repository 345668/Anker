import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
vi.mock("server-only", () => ({}))

// In-memory stand-in for the three tables the service touches.
const db = vi.hoisted(() => ({
  verifications: new Map<string, any>(),
  bounced: new Set<string>(),
  providerToday: 0,
}))
vi.mock("@/lib/ai/runtime-config", () => ({ readRouterConfig: async () => ({ emailVerificationProvider: null, emailVerificationApiKey: null }) }))
vi.mock("@/lib/db", () => {
  const sql: any = async (strings: TemplateStringsArray, ...values: any[]) => {
    const q = strings.join("?")
    if (q.includes("FROM email_verifications WHERE email = ANY")) {
      return (values[0] as string[]).map((e) => db.verifications.get(e)).filter((r) => r && new Date(r.expires_at) > new Date())
    }
    if (q.includes("FROM outreach_messages")) return (values[0] as string[]).filter((e) => db.bounced.has(e)).map((email) => ({ email }))
    if (q.includes("count(*)::int AS n FROM email_verifications")) return [{ n: db.providerToday }]
    if (q.includes("INSERT INTO email_verifications")) {
      const [email, domain, status, reason, provider, mx_found, checked_at, expires_at] = values
      db.verifications.set(email, { email, domain, status, reason, provider, mx_found, checked_at, expires_at })
      if (provider === "zerobounce" || provider === "neverbounce") db.providerToday++
      return []
    }
    throw new Error("unexpected query: " + q)
  }
  return { sql }
})

import { zeroBounce, neverBounce } from "./providers"
import { verifyEmails, markBounced } from "./service"
import { statusLabel, isSendable, emailQuality } from "./types"

const respond = (json: unknown, ok = true) => vi.fn(async () => ({ ok, status: ok ? 200 : 500, text: async () => JSON.stringify(json) })) as any

beforeEach(() => {
  db.verifications.clear(); db.bounced.clear(); db.providerToday = 0
  vi.stubEnv("EMAIL_VERIFICATION_API_KEY", "")
  vi.stubEnv("EMAIL_VERIFICATION_PROVIDER", "zerobounce")
  vi.stubEnv("EMAIL_VERIFICATION_DAILY_LIMIT", "500")
})
afterEach(() => vi.unstubAllEnvs())

describe("ZeroBounce mapping", () => {
  it.each([
    [{ status: "valid" }, "valid", null],
    [{ status: "invalid", sub_status: "mailbox_not_found" }, "invalid", "mailbox_not_found"],
    [{ status: "catch-all" }, "risky", "catch_all"],
    [{ status: "spamtrap" }, "invalid", "spamtrap"],
    [{ status: "do_not_mail", sub_status: "role_based" }, "risky", "role"],
    [{ status: "do_not_mail", sub_status: "toxic" }, "invalid", "toxic"],
    [{ status: "unknown", sub_status: "timeout_exceeded" }, "unknown", "timeout_exceeded"],
  ])("%j → %s", async (json, status, reason) => {
    const r = await zeroBounce.verify("a@b.com", "key", respond({ address: "a@b.com", ...json }))
    expect(r).toMatchObject({ status, reason })
    expect(r.raw).not.toHaveProperty("address")
  })

  it("surfaces an API error instead of calling it a result", async () => {
    await expect(zeroBounce.verify("a@b.com", "bad", respond({ error: "Invalid API Key" }))).rejects.toThrow(/Invalid API Key/)
  })
})

describe("NeverBounce mapping", () => {
  it.each([
    ["valid", "valid"], ["invalid", "invalid"], ["disposable", "risky"], ["catchall", "risky"], ["unknown", "unknown"],
  ])("%s → %s", async (result, status) => {
    expect((await neverBounce.verify("a@b.com", "key", respond({ status: "success", result, flags: ["has_dns_mx"] }))).status).toBe(status)
  })

  it("treats a non-success envelope as an error", async () => {
    await expect(neverBounce.verify("a@b.com", "key", respond({ status: "auth_failure", message: "Invalid key" }))).rejects.toThrow(/Invalid key/)
  })
})

describe("verifyEmails", () => {
  const mxOk = async () => true

  it("never calls anything Verified without a provider", async () => {
    const r = await verifyEmails(["Partner@Fund.com", "info@fund.com", "not-an-email", "x@nomx.test"], {
      mx: async (d) => d !== "nomx.test",
    })
    const s = (e: string) => r.results.get(e)?.status
    expect(s("partner@fund.com")).toBe("unknown")
    expect(s("info@fund.com")).toBe("risky")
    expect(s("x@nomx.test")).toBe("invalid")
    expect(r.results.has("not-an-email")).toBe(false) // not an address at all: never stored
    expect([...r.results.values()].some((v) => v.status === "valid")).toBe(false)
    expect(r.providerConfigured).toBe(false)
  })

  it("marks addresses that bounced as invalid", async () => {
    db.bounced.add("gone@fund.com")
    const r = await verifyEmails(["gone@fund.com"], { mx: mxOk })
    expect(r.results.get("gone@fund.com")).toMatchObject({ status: "invalid", reason: "bounced" })
  })

  it("asks the provider only about mailboxes the local stage could not settle, within the daily budget", async () => {
    vi.stubEnv("EMAIL_VERIFICATION_API_KEY", "k")
    vi.stubEnv("EMAIL_VERIFICATION_DAILY_LIMIT", "2")
    const fetchImpl = respond({ status: "valid" })
    const r = await verifyEmails(["a@f.com", "b@f.com", "c@f.com", "info@f.com"], { mx: mxOk, fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(2) // role address skipped; cap of 2 holds
    expect(r.provider).toBe(2)
    expect([...r.results.values()].filter((v) => v.status === "valid")).toHaveLength(2)
    expect(r.budgetLeft).toBe(0)
  })

  it("keeps the local result when the provider fails", async () => {
    vi.stubEnv("EMAIL_VERIFICATION_API_KEY", "k")
    const r = await verifyEmails(["a@f.com"], { mx: mxOk, fetchImpl: respond({}, false) })
    expect(r.results.get("a@f.com")?.status).toBe("unknown")
    expect(r.providerErrors).toBe(1)
  })

  it("serves repeat requests from the cache", async () => {
    await verifyEmails(["a@f.com"], { mx: mxOk })
    const again = await verifyEmails(["a@f.com"], { mx: async () => { throw new Error("should not resolve") } })
    expect(again.cached).toBe(1)
    expect(again.local).toBe(0)
  })

  it("records bounces from sending for everyone", async () => {
    await markBounced("Gone@Fund.com")
    expect(db.verifications.get("gone@fund.com")).toMatchObject({ status: "invalid", reason: "bounced" })
  })
})

describe("labels", () => {
  it("only a provider-confirmed mailbox reads as Verified", () => {
    expect(statusLabel("valid")).toBe("Verified")
    expect(statusLabel("unknown")).toBe("Unconfirmed")
    expect(statusLabel(null)).toBe("Not checked")
    expect(isSendable("invalid")).toBe(false)
    expect(emailQuality("valid", true)).toBe(1)
    expect(emailQuality("invalid", true)).toBe(0)
  })
})
