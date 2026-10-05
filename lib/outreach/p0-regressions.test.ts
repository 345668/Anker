/** Regression guards for the live exposures fixed in docs/architecture/46 section 7 (P0). */
import { describe, it, expect, afterEach } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { isCronAuthorised } from "@/lib/cron/track"
import { scheduledActionOff, SEND_ACTIONS } from "./scheduled-sends"
import { DEFAULT_SETTINGS } from "@/lib/campaign/settings"

describe("crons fail closed", () => {
  it("no scheduled job treats a missing CRON_SECRET as authorized", () => {
    const root = "app/api/cron", bad: string[] = []
    for (const d of readdirSync(root, { withFileTypes: true }).filter((x) => x.isDirectory())) {
      const src = readFileSync(join(root, d.name, "route.ts"), "utf8")
      if (/if \(!secret\) return true/.test(src)) bad.push(d.name)
    }
    expect(bad).toEqual([])
  })
  it("with no secret configured nothing is authorized, with one only the bearer or query secret is", () => {
    const req = (h: Record<string, string> = {}, q = "") => new Request(`https://x.test/api/cron/y${q}`, { headers: h })
    expect(isCronAuthorised(req({ authorization: "Bearer anything" }), {})).toBe(false)
    expect(isCronAuthorised(req(), {})).toBe(false)
    expect(isCronAuthorised(req({ authorization: "Bearer s3cret" }), { CRON_SECRET: "s3cret" })).toBe(true)
    expect(isCronAuthorised(req({}, "?secret=s3cret"), { CRON_SECRET: "s3cret" })).toBe(true)
    expect(isCronAuthorised(req({ authorization: "Bearer wrong" }), { CRON_SECRET: "s3cret" })).toBe(false)
  })
})

describe("scheduled sends are off until they are approved sends", () => {
  it("both sending actions are refused; the no-op one is not", () => {
    expect([...SEND_ACTIONS].sort()).toEqual(["send_batch", "send_openers_nudge"])
    expect(scheduledActionOff("send_batch")).toBe(true); expect(scheduledActionOff("send_openers_nudge")).toBe(true); expect(scheduledActionOff("send_bounces_retry")).toBe(false)
  })
})

describe("unattended campaign sending is off by default", () => {
  const was = process.env.CAMPAIGN_AUTO_SEND
  afterEach(() => { if (was === undefined) delete process.env.CAMPAIGN_AUTO_SEND; else process.env.CAMPAIGN_AUTO_SEND = was })
  it("defaults to off, which is also what applies if the settings row cannot be read", () => { expect(DEFAULT_SETTINGS.autoSend).toBe(false) })
})

describe("every outreach send goes through the provider functions and is labelled (docs/architecture/46 section 17)", () => {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) { if (!["node_modules", ".next"].includes(e.name)) walk(p, out) } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p)
    }
    return out
  }
  const files = [...walk("app"), ...walk("lib"), ...walk("components")]
  it("no code outside the email provider modules posts mail to a provider (a SendGrid fallback that skipped every gate was removed)", () => {
    const providers = ["api.resend.com/emails", "api.sendgrid.com/v3/mail/send", "gmail/v1/users/me/messages/send"]
    const offenders = files// Allowed: the two provider modules; resend-sync (it only reads delivery events); and the public contact form, which mails the company's own inbox (not a third party).
      .filter((f) => !/lib\/email\/(resend|gmail|resend-sync)\.ts$/.test(f) && !/app\/contact\/actions\.ts$/.test(f)).filter((f) => { const t = readFileSync(f, "utf8"); return providers.some((p) => t.includes(p)) })
    expect(offenders).toEqual([])
  })
  it("every file that sends outreach says which path it is (the shadow log and the authorization both depend on it)", () => {
    const unlabelled = files.filter((f) => { const t = readFileSync(f, "utf8"); return /purpose: "outreach"/.test(t) && !/via: "/.test(t) })
    expect(unlabelled).toEqual([])
  })
})

