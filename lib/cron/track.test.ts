import { describe, it, expect, vi, beforeEach } from "vitest"
vi.mock("server-only", () => ({}))
const db = vi.hoisted(() => ({ calls: [] as { q: string; v: any[] }[] }))
vi.mock("@/lib/db", () => ({
  sql: async (strings: TemplateStringsArray, ...v: any[]) => { const q = strings.join("?"); db.calls.push({ q, v }); return q.includes("INSERT INTO cron_runs") ? [{ id: 7 }] : [] },
}))
import { isCronAuthorised, trackCron } from "./track"

const req = (init: { auth?: string; qs?: string } = {}) =>
  new Request(`https://x.test/api/cron/job${init.qs ?? ""}`, { headers: init.auth ? { authorization: init.auth } : {} })

beforeEach(() => { db.calls = []; process.env.CRON_SECRET = "s3cret"; vi.spyOn(console, "log").mockImplementation(() => {}) })

describe("isCronAuthorised", () => {
  it("accepts the bearer secret or ?secret=, and nothing else", () => {
    expect(isCronAuthorised(req({ auth: "Bearer s3cret" }))).toBe(true)
    expect(isCronAuthorised(req({ qs: "?secret=s3cret" }))).toBe(true)
    expect(isCronAuthorised(req({ auth: "Bearer wrong!" }))).toBe(false)
    expect(isCronAuthorised(req())).toBe(false)
  })
  it("fails closed with no secret configured", () => {
    delete process.env.CRON_SECRET
    expect(isCronAuthorised(req({ auth: "Bearer " }))).toBe(false)
  })
})

describe("trackCron", () => {
  it("records a start row and a finished row for an authorised run, and returns the handler's response untouched", async () => {
    const res = new Response(JSON.stringify({ ok: true, processed: 3 }), { status: 200 })
    const out = await trackCron("demo", async () => res)(req({ auth: "Bearer s3cret" }))
    expect(out).toBe(res)
    expect(db.calls[0].q).toContain("INSERT INTO cron_runs")
    expect(db.calls[0].v).toEqual(["demo"])
    const fin = db.calls[1]
    expect(fin.q).toContain("UPDATE cron_runs")
    expect(fin.v).toContain("ok")
    expect(fin.v).toContain(200)
  })
  it("records nothing for an unauthorised call and lets the handler answer 401", async () => {
    const h = vi.fn(async () => new Response("no", { status: 401 }))
    const out = await trackCron("demo", h)(req())
    expect(out.status).toBe(401)
    expect(h).toHaveBeenCalledOnce()
    expect(db.calls).toHaveLength(0)
  })
  it("records a failing response as failed with its error", async () => {
    await trackCron("demo", async () => new Response(JSON.stringify({ error: "db down" }), { status: 500 }))(req({ auth: "Bearer s3cret" }))
    expect(db.calls[1].v).toContain("failed")
    expect(db.calls[1].v).toContain("db down")
  })
  it("records a throw as failed and rethrows it", async () => {
    await expect(trackCron("demo", async () => { throw new Error("boom") })(req({ auth: "Bearer s3cret" }))).rejects.toThrow("boom")
    expect(db.calls[1].v).toContain("failed")
    expect(db.calls[1].v).toContain("boom")
  })
  it("never lets a telemetry write failure stop the job", async () => {
    const out = await trackCron("demo", async () => new Response("{}", { status: 200 }))(req({ auth: "Bearer s3cret" }))
    expect(out.status).toBe(200)
  })
})
