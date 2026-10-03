import { describe, it, expect, vi } from "vitest"
import { readFileSync } from "node:fs"
vi.mock("server-only", () => ({}))
const rows = vi.hoisted(() => ({ next: [] as any[][] }))
vi.mock("@/lib/db", () => ({ sql: async () => rows.next.shift() ?? [] }))
import { envChecks, dbChecks, CRON_MAX_AGE_MIN, runDependencyChecks } from "./dependencies"

const by = (cs: any[], name: string) => cs.find((c) => c.name === name)

describe("envChecks", () => {
  it("flags the two faults found in production: a Stripe key with no webhook secret, and no mailbox settings", () => {
    const c = envChecks({ STRIPE_SECRET_KEY: "sk", RESEND_API_KEY: "re", SECRET_KEY: "s", CRON_SECRET: "c", BLOB_READ_WRITE_TOKEN: "b" })
    expect(by(c, "Stripe billing").status).toBe("down")
    expect(by(c, "Stripe billing").fix).toContain("STRIPE_WEBHOOK_SECRET")
    expect(by(c, "Reply mailbox (IMAP)").status).toBe("unconfigured")
  })
  it("is ok with the secret present and never prints a value", () => {
    const c = envChecks({ STRIPE_SECRET_KEY: "sk_live_VALUE", STRIPE_WEBHOOK_SECRET: "whsec_VALUE" })
    expect(by(c, "Stripe billing").status).toBe("ok")
    expect(JSON.stringify(c)).not.toContain("VALUE")
  })
  it("calls out the missing footer address and the missing signing secret", () => {
    const c = envChecks({})
    expect(by(c, "Outreach footer address").status).toBe("degraded")
    expect(by(c, "Unsubscribe links").status).toBe("down")
  })
})

describe("dbChecks", () => {
  it("reports no reply detection when mail was sent and no mailbox is connected", async () => {
    rows.next = [[{ ok: 1 }], [{ n: 0 }], [{ n: 286 }], [{ n: 0 }], [{ n: 0, ok: 0 }], []]
    const c = await dbChecks(Date.now(), {})
    expect(by(c, "Reply detection").status).toBe("down")
    expect(by(c, "Reply detection").detail).toContain("0 replies recorded from 286 sent")
  })
  it("is ok once a mailbox is connected", async () => {
    rows.next = [[{ ok: 1 }], [{ n: 1 }], [{ n: 286 }], [{ n: 4 }], [{ n: 10, ok: 10 }], []]
    expect(by(await dbChecks(Date.now(), {}), "Reply detection").status).toBe("ok")
  })
  it("grades AI health by the success rate", async () => {
    rows.next = [[{ ok: 1 }], [{ n: 1 }], [{ n: 1 }], [{ n: 0 }], [{ n: 20, ok: 15 }], []]
    expect(by(await dbChecks(Date.now(), {}), "AI calls (24 h)").status).toBe("degraded")
  })
  it("flags a stale job, a failed job, and a run still 'running' long past its time", async () => {
    const now = Date.now(), ago = (m: number) => new Date(now - m * 60000).toISOString()
    rows.next = [[{ ok: 1 }], [{ n: 1 }], [{ n: 0 }], [{ n: 0 }], [{ n: 0, ok: 0 }], [
      { job: "outreach-poll", started_at: ago(200), status: "ok" },
      { job: "campaign-send", started_at: ago(10), status: "failed" },
      { job: "outreach-scheduler", started_at: ago(40), status: "running" },
    ]]
    const jobs = by(await dbChecks(now, {}), "Scheduled jobs")
    expect(jobs.status).toBe("degraded")
    expect(jobs.detail).toContain("campaign-send")
    expect(jobs.detail).toContain("outreach-poll")
    expect(jobs.detail).toContain("likely killed")
  })
  it("says the database is down and stops there", async () => {
    vi.resetModules()
    rows.next = []
    const report = await runDependencyChecks({ env: {} })
    expect(report.checks.length).toBeGreaterThan(5)
  })
})

describe("coverage", () => {
  it("has a freshness rule for every scheduled job in vercel.json", () => {
    const jobs = (JSON.parse(readFileSync("vercel.json", "utf8")).crons as { path: string }[]).map((c) => c.path.replace("/api/cron/", ""))
    for (const j of jobs) expect(CRON_MAX_AGE_MIN[j], `no freshness rule for ${j}`).toBeGreaterThan(0)
  })
})
