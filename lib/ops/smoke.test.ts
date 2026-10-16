import { describe, it, expect, vi } from "vitest"
vi.mock("@/lib/db", () => ({ sql: async () => [] }))
vi.mock("@/lib/migrations/schema-state", () => ({ schemaBehind: async () => [] }))
import { runSmoke, summarise } from "../../scripts/lib/smoke.mjs"
import { parseReport, tokenOk } from "./smoke"
import { smokeFailed } from "./alerts/rules"

type Reply = { status?: number; json?: unknown; location?: string }
/** A fake site: path -> reply, with a counter so retries can be seen. */
const site = (routes: Record<string, Reply | ((n: number) => Reply)>) => {
  const hits: Record<string, number> = {}
  const fetchFn = async (u: URL | string, init?: RequestInit) => {
    const p = new URL(String(u)).pathname; hits[p] = (hits[p] ?? 0) + 1
    const r0 = routes[p]; const r = typeof r0 === "function" ? r0(hits[p]) : r0
    if (!r) return new Response("nope", { status: 404 })
    return new Response(r.json !== undefined ? JSON.stringify(r.json) : "<html></html>", { status: r.status ?? 200, headers: r.location ? { location: r.location } : {} })
  }
  return { fetchFn: fetchFn as unknown as typeof fetch, hits }
}
const healthy = { "/api/health": { json: { ok: true, db: true, schemaBehind: 0 } }, "/": {}, "/login": {}, "/privacy": {}, "/privacy/subprocessors": {}, "/terms": {}, "/security": {} } as Record<string, Reply>
const base = "https://app.test"
const fast = { sleep: async () => {}, retries: 3 }

describe("the smoke run", () => {
  it("passes on a healthy site; the deep check is skipped, not failed, without a token", async () => {
    const r = await runSmoke({ base, fetchFn: site(healthy).fetchFn, ...fast })
    expect(r.ok).toBe(true); expect(r.skipped).toBe(1); expect(summarise(r)).toContain("skip deep checks")
  })
  it("fails when a public page does not load, and names it", async () => {
    const r = await runSmoke({ base, fetchFn: site({ ...healthy, "/privacy": { status: 500 } }).fetchFn, ...fast })
    expect(r.ok).toBe(false); expect(r.failures).toEqual([{ name: "page /privacy", error: "/privacy answered 500" }])
  })
  it("a redirect is fine (the sign-in page may send a signed-in visitor on)", async () => {
    expect((await runSmoke({ base, fetchFn: site({ ...healthy, "/login": { status: 307, location: "/dashboard" } }).fetchFn, ...fast })).ok).toBe(true)
  })
  it("health: retries while the new deployment settles, then fails with the reason", async () => {
    const s = site({ ...healthy, "/api/health": (n) => (n < 3 ? { status: 503, json: { ok: false, db: false } } : { json: { ok: true, db: true, schemaBehind: 0 } }) })
    expect((await runSmoke({ base, fetchFn: s.fetchFn, ...fast })).ok).toBe(true); expect(s.hits["/api/health"]).toBe(3)
    const bad = await runSmoke({ base, fetchFn: site({ ...healthy, "/api/health": { json: { ok: false, db: true, schemaBehind: 2 } } }).fetchFn, ...fast })
    expect(bad.failures[0]).toMatchObject({ name: "health", error: expect.stringContaining("missing 2 migration") })
  })
  it("a database that is up but a ledger that cannot be read is a failure, not a pass", async () => {
    const r = await runSmoke({ base, fetchFn: site({ ...healthy, "/api/health": { json: { ok: false, db: true, schemaBehind: null } } }).fetchFn, ...fast })
    expect(r.failures[0].error).toContain("ledger could not be read")
  })
  it("the deep check sends the token, and fails with the names of the failing checks, the refusal, or the missing set-up", async () => {
    let seen = ""
    const ok = { ...healthy, "/api/smoke": { json: { ok: true, checks: [{ name: "database", ok: true }, { name: "schema", ok: true }] } } }
    const fetchFn = (async (u: URL, init?: RequestInit) => { seen = String((init?.headers as Record<string, string> | undefined)?.["x-smoke-token"] ?? seen); return site(ok).fetchFn(u, init) }) as unknown as typeof fetch
    const pass = await runSmoke({ base, token: "t".repeat(30), fetchFn, ...fast }); expect(pass.ok).toBe(true); expect(pass.skipped).toBe(0); expect(seen).toBe("t".repeat(30))
    const bad = await runSmoke({ base, token: "x", fetchFn: site({ ...healthy, "/api/smoke": { json: { ok: false, checks: [{ name: "database", ok: true }, { name: "ai configuration", ok: false, error: "boom" }] } } }).fetchFn, ...fast })
    expect(bad.failures).toEqual([{ name: "deep checks", error: "ai configuration: boom" }])
    expect((await runSmoke({ base, token: "x", fetchFn: site({ ...healthy, "/api/smoke": { status: 401, json: {} } }).fetchFn, ...fast })).failures[0].error).toContain("refused")
    expect((await runSmoke({ base, token: "x", fetchFn: site({ ...healthy, "/api/smoke": { status: 503, json: {} } }).fetchFn, ...fast })).failures[0].error).toContain("SMOKE_TOKEN")
  })
  it("a site that does not answer at all fails every check instead of throwing", async () => {
    const r = await runSmoke({ base, fetchFn: (async () => { throw new Error("connect ECONNREFUSED") }) as unknown as typeof fetch, ...fast })
    expect(r.ok).toBe(false); expect(r.failures.length).toBe(7)
  })
})

describe("the smoke token and the report", () => {
  it("the token must be long, set, and match exactly; an unset one answers 'unset', never 'ok'", () => {
    const t = "a".repeat(32)
    expect(tokenOk(t, t)).toBe(true); expect(tokenOk("b".repeat(32), t)).toBe(false); expect(tokenOk(null, t)).toBe(false); expect(tokenOk(t, undefined)).toBe("unset"); expect(tokenOk(t, "short")).toBe("unset")
  })
  it("a report is cleaned and bounded; a failure without detail still says it failed", () => {
    expect(parseReport(null)).toBeNull(); expect(parseReport({ ok: "yes", failures: [] })).toBeNull()
    expect(parseReport({ ok: true, failures: [], sha: "abc" })).toMatchObject({ ok: true, sha: "abc", failures: [] })
    const f = parseReport({ ok: false, failures: [{ name: "x".repeat(200), error: "e".repeat(500) }, { name: "" }] })!
    expect(f.ok).toBe(false); expect(f.failures).toHaveLength(1); expect(f.failures[0].name).toHaveLength(80); expect(f.failures[0].error).toHaveLength(300)
    expect(parseReport({ ok: false, failures: [] })!.failures[0].name).toBe("unknown")
    expect(parseReport({ ok: true, failures: [{ name: "a", error: "b" }] })!.ok).toBe(false)      // a pass that lists failures is not a pass
  })
})

describe("the alert rule", () => {
  const snap = (smoke?: { sha: string | null; failures: string[] }) => ({ now: 0, latest: {}, lastOk: {}, recent: {}, deps: [], smoke }) as any
  it("one finding naming the failures when the newest run failed; none otherwise", () => {
    const f = smokeFailed(snap({ sha: "abcdef1234", failures: ["page /privacy: /privacy answered 500"] }))
    expect(f).toHaveLength(1); expect(f[0]).toMatchObject({ rule: "smoke_failed", severity: 2 }); expect(f[0].summary).toContain("abcdef1"); expect(f[0].summary).toContain("/privacy answered 500")
    expect(smokeFailed(snap())).toEqual([])
  })
})
