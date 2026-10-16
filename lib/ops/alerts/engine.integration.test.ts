/** The alert engine against a real Postgres (PGlite) with the real migration: opening, the flap guard, reminders, auto-resolve, reopening, failed delivery, mutes, the watchdog. */
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
const state = vi.hoisted(() => ({ q: null as any }))
vi.mock("@/lib/db", () => { const f: any = (s: TemplateStringsArray, ...v: unknown[]) => state.q(s.reduce((q, t, i) => q + (i ? `$${i}` : "") + t, ""), v); f.unsafe = (t: string, v: unknown[] = []) => state.q(t, v); return { sql: f } })
import { runEvaluation, runWatchdog, buildMessage, buildDigest, recipients, defaultChannels, sendTestNotification, OPEN_AFTER, RESOLVE_AFTER, REMIND_MS, REMIND_ACK_MS, REOPEN_WITHIN_MS, type Message } from "./engine"
import type { Snapshot } from "./rules"

let db: PGlite
const rows = async (q: string, p: unknown[] = []) => (await db.query(q, p)).rows as any[]
const T0 = Date.UTC(2026, 9, 16, 12, 0, 0), M = 60_000, H = 3600_000
const sent: Message[] = []
let failMail = false
const deliver = async (m: Message) => { if (failMail) throw new Error("smtp refused"); sent.push(m) }
const snap = (now: number, o: Partial<Snapshot> = {}): Snapshot => ({ now, latest: {}, lastOk: {}, recent: {}, deps: [], ...o })
const stripeDown = (now: number) => snap(now, { deps: [{ name: "Stripe billing", status: "down", detail: "no webhook secret", fix: "set STRIPE_WEBHOOK_SECRET" }] })
const stuckSev1 = (now: number) => snap(now, { latest: { "outreach-send": { startedAt: now - 40 * M, status: "running" } } })
const run = (s: Snapshot) => runEvaluation({ now: s.now, deliver, snapshot: s })
const inc = async () => (await rows("SELECT * FROM alert_incidents ORDER BY id"))

beforeAll(async () => {
  db = new PGlite()
  state.q = async (q: string, v: unknown[] = []) => (await db.query(q, v)).rows
  await db.exec(readFileSync("scripts/migrations/2026-10-16g-alerts.sql", "utf8"))
  await db.exec(readFileSync("scripts/migrations/2026-10-16h-alerts-a2.sql", "utf8"))
}, 30000)
afterAll(async () => db.close())
beforeEach(async () => { sent.length = 0; failMail = false; await db.exec("DELETE FROM alert_events; DELETE FROM alert_incidents; DELETE FROM alert_rule_settings; UPDATE alert_heartbeat SET last_run_at = NULL, last_ok_at = NULL, error = NULL, digest_on = '2026-10-16'") })

describe("opening", () => {
  it("a severity 2 problem opens on the second sighting, not the first, and tells a person once", async () => {
    await run(stripeDown(T0)); expect(sent).toHaveLength(0)
    expect((await inc())[0]).toMatchObject({ status: "pending", times_seen: 1 })
    await run(stripeDown(T0 + 5 * M)); expect(OPEN_AFTER).toBe(2)
    expect(sent).toHaveLength(1)
    expect((await inc())[0]).toMatchObject({ status: "open", rule_key: "dependency_down", subject: "Stripe billing", severity: 2 })
    await run(stripeDown(T0 + 10 * M)); await run(stripeDown(T0 + 15 * M))
    expect(sent).toHaveLength(1); expect(await inc()).toHaveLength(1)
    expect(Number((await rows("SELECT times_seen FROM alert_incidents"))[0].times_seen)).toBe(4)
  })
  it("a severity 1 problem opens and tells at once", async () => {
    await run(stuckSev1(T0))
    expect(sent).toHaveLength(1); expect(sent[0].subject).toBe("[Anker SEV1] cron_stuck: outreach-send")
    expect((await inc())[0].status).toBe("open")
  })
  it("a problem seen once and gone leaves nothing behind", async () => {
    await run(stripeDown(T0)); await run(snap(T0 + 5 * M))
    expect(await inc()).toHaveLength(0); expect(sent).toHaveLength(0)
  })
  it("the message names the problem, the evidence and the runbook, goes to the configured recipients, and holds no address", async () => {
    await run(stripeDown(T0)); await run(stripeDown(T0 + 5 * M))
    const m = sent[0]
    expect(m.subject).toBe("[Anker SEV2] dependency_down: Stripe billing"); expect(m.to).toEqual(["vc@an-ker.de"])
    expect(m.text).toContain("Stripe billing is down"); expect(m.text).toContain("What it means:"); expect(m.text).toContain("Fix:"); expect(m.text).toContain("set STRIPE_WEBHOOK_SECRET")
    expect(recipients({ ALERT_EMAIL_TO: "a@x.com, b@x.com" })).toEqual(["a@x.com", "b@x.com"])
  })
  it("one live incident per problem: two different problems are two incidents", async () => {
    const both = snap(T0, { deps: [{ name: "Stripe billing", status: "down", detail: "x" }, { name: "Reply detection", status: "down", detail: "y" }] })
    await run(both); await run({ ...both, now: T0 + 5 * M })
    expect(await inc()).toHaveLength(2); expect(sent).toHaveLength(2)
  })
})

describe("staying open, reminders, acknowledgement", () => {
  it("reminds after 4 hours when nobody has acknowledged it, then every 4 hours (severity 1, which quiet hours never silence)", async () => {
    await run(stuckSev1(T0)); sent.length = 0
    await run(stuckSev1(T0 + 3 * H)); expect(sent).toHaveLength(0)
    await run(stuckSev1(T0 + REMIND_MS)); expect(sent).toHaveLength(1); expect(sent[0].subject).toMatch(/still open/)
    await run(stuckSev1(T0 + REMIND_MS + 1 * H)); expect(sent).toHaveLength(1)
    await run(stuckSev1(T0 + 2 * REMIND_MS)); expect(sent).toHaveLength(2)
  })
  it("a severity 2 reminder is sent by day", async () => {
    await run(stripeDown(T0)); await run(stripeDown(T0 + 5 * M)); sent.length = 0
    await run(stripeDown(T0 + 5 * M + REMIND_MS)); expect(sent).toHaveLength(1); expect(sent[0].subject).toMatch(/SEV2 still open/)
  })
  it("an acknowledged incident reminds only after 24 hours", async () => {
    await run(stripeDown(T0)); await run(stripeDown(T0 + 5 * M)); sent.length = 0
    await db.exec("UPDATE alert_incidents SET status = 'acknowledged', acknowledged_by = 'ops@sail.test'")
    await run(stripeDown(T0 + 5 * M + REMIND_MS + H)); expect(sent).toHaveLength(0)
    await run(stripeDown(T0 + 5 * M + REMIND_ACK_MS)); expect(sent.filter((m) => !m.kind)).toHaveLength(1)
    expect((await inc())[0].status).toBe("acknowledged")
  })
})

describe("resolving and reopening", () => {
  it("resolves by itself after three clear evaluations and says so once", async () => {
    await run(stripeDown(T0)); await run(stripeDown(T0 + 5 * M)); sent.length = 0
    for (let i = 1; i < RESOLVE_AFTER; i++) { await run(snap(T0 + (5 + 5 * i) * M)); expect((await inc())[0].status).toBe("open") }
    await run(snap(T0 + 30 * M))
    expect((await inc())[0]).toMatchObject({ status: "resolved", resolved_by: "auto" })
    expect(sent).toHaveLength(1); expect(sent[0].subject).toBe("[Anker resolved] dependency_down: Stripe billing"); expect(sent[0].text).toContain("has cleared")
  })
  it("a problem that comes back within 24 hours reopens the same incident; after 24 hours it is a new one", async () => {
    await run(stripeDown(T0)); await run(stripeDown(T0 + 5 * M))
    for (let i = 0; i < RESOLVE_AFTER; i++) await run(snap(T0 + (10 + 5 * i) * M))
    const first = (await inc())[0].id; sent.length = 0
    await run(stripeDown(T0 + 2 * H))
    expect(await inc()).toHaveLength(1); expect((await inc())[0]).toMatchObject({ id: first, status: "open", resolved_at: null }); expect(sent[0].subject).toMatch(/SEV2 again/)
    expect((await rows("SELECT kind FROM alert_events WHERE incident_id = $1 AND kind = 'reopened'", [first]))).toHaveLength(1)
    for (let i = 0; i < RESOLVE_AFTER; i++) await run(snap(T0 + 3 * H + i * 5 * M))
    await run(stripeDown(T0 + 3 * H + REOPEN_WITHIN_MS + 30 * M)); await run(stripeDown(T0 + 3 * H + REOPEN_WITHIN_MS + 35 * M))
    expect(await inc()).toHaveLength(2)
  })
  it("a problem that clears and returns before it resolves keeps counting from zero", async () => {
    await run(stripeDown(T0)); await run(stripeDown(T0 + 5 * M))
    await run(snap(T0 + 10 * M)); await run(snap(T0 + 15 * M)); await run(stripeDown(T0 + 20 * M)); await run(snap(T0 + 25 * M)); await run(snap(T0 + 30 * M))
    expect((await inc())[0].status).toBe("open")
  })
})

describe("delivery", () => {
  it("a failed delivery is recorded, does not lose the incident, and is retried on the next evaluation", async () => {
    failMail = true
    await run(stuckSev1(T0))
    expect((await inc())[0]).toMatchObject({ status: "open", notified_at: null })
    expect((await rows("SELECT ok, detail FROM alert_events WHERE kind = 'notified'"))[0]).toMatchObject({ ok: false, detail: "smtp refused" })
    failMail = false
    const r = await run(stuckSev1(T0 + 5 * M))
    expect(r.retried).toBe(1); expect(sent).toHaveLength(1); expect((await inc())[0].notified_at).not.toBeNull()
    await run(stuckSev1(T0 + 10 * M)); expect(sent).toHaveLength(1)
  })
  it("the timeline records opened, notified and resolved", async () => {
    await run(stripeDown(T0)); await run(stripeDown(T0 + 5 * M))
    for (let i = 0; i < RESOLVE_AFTER; i++) await run(snap(T0 + (10 + 5 * i) * M))
    expect((await rows("SELECT kind FROM alert_events ORDER BY id")).map((e) => e.kind)).toEqual(["opened", "notified", "resolved", "notified"])
  })
})

describe("settings", () => {
  it("a muted rule opens nothing, a disabled rule opens nothing, and a severity override applies", async () => {
    await db.exec(`INSERT INTO alert_rule_settings (rule_key, muted_until, muted_reason) VALUES ('dependency_down', now() + interval '1 day', 'known, fixing')`)
    await run(stripeDown(T0)); await run(stripeDown(T0 + 5 * M)); expect(await inc()).toHaveLength(0)
    await db.exec(`UPDATE alert_rule_settings SET muted_until = NULL, enabled = false`)
    await run(stripeDown(T0 + 10 * M)); await run(stripeDown(T0 + 15 * M)); expect(await inc()).toHaveLength(0)
    await db.exec(`UPDATE alert_rule_settings SET enabled = true, severity_override = 1`)
    await run(stripeDown(T0 + 20 * M)); expect((await inc())[0]).toMatchObject({ severity: 1, status: "open" })
  })
  it("an expired mute no longer applies", async () => {
    await db.exec(`INSERT INTO alert_rule_settings (rule_key, muted_until) VALUES ('dependency_down', now() - interval '1 day')`)
    await run(stripeDown(T0)); await run(stripeDown(T0 + 5 * M)); expect(await inc()).toHaveLength(1)
  })
})

describe("heartbeat and watchdog", () => {
  it("each evaluation writes the heartbeat with the rules evaluated and the open count; a failure records the error", async () => {
    await run(stuckSev1(T0))
    expect((await rows("SELECT * FROM alert_heartbeat"))[0]).toMatchObject({ rules_evaluated: 13, open_incidents: 1, error: null }); expect((await rows("SELECT last_ok_at FROM alert_heartbeat"))[0].last_ok_at).not.toBeNull()
    await expect(runEvaluation({ now: T0 + 5 * M, deliver, snapshot: { get latest(): any { throw new Error("db down") } } as any })).rejects.toThrow("db down")
    expect((await rows("SELECT error FROM alert_heartbeat"))[0].error).toBe("db down")
  })
  it("the watchdog stays quiet while the heartbeat is fresh, and opens a severity 1 incident when it is not", async () => {
    await run(snap(T0))
    await runWatchdog({ now: T0 + 20 * M, deliver }); expect(await inc()).toHaveLength(0)
    const r = await runWatchdog({ now: T0 + 40 * M, deliver })
    expect(r.opened).toBe(1); expect(sent[0].subject).toBe("[Anker SEV1] alerter_stale: alerts-evaluate"); expect((await inc())[0].status).toBe("open")
  })
  it("a failing evaluator (no fresh ok) is also caught, and the incident clears once it recovers", async () => {
    await run(snap(T0)); await expect(runEvaluation({ now: T0 + 40 * M, deliver, snapshot: { get latest(): any { throw new Error("boom") } } as any })).rejects.toThrow()
    await runWatchdog({ now: T0 + 40 * M, deliver }); expect((await inc())[0].rule_key).toBe("alerter_stale")
    await run(snap(T0 + 45 * M))
    for (let i = 0; i < RESOLVE_AFTER; i++) await runWatchdog({ now: T0 + (46 + i) * M, deliver })
    expect((await inc())[0].status).toBe("resolved")
  })
  it("the evaluator does not touch the watchdog's incident", async () => {
    await runWatchdog({ now: T0 + 60 * M, deliver })   // heartbeat null -> nothing
    await db.exec(`INSERT INTO alert_incidents (rule_key, subject, severity, status, summary, opened_at) VALUES ('alerter_stale', 'alerts-evaluate', 1, 'open', 's', now())`)
    await run(snap(T0)); await run(snap(T0 + 5 * M)); await run(snap(T0 + 10 * M))
    expect((await inc())[0].status).toBe("open")
  })
})

describe("channels", () => {
  const tg: Message[] = []
  const channels = (failEmail = false, failTg = false) => [
    { name: "email", send: async (m: Message) => { if (failEmail) throw new Error("smtp refused"); sent.push(m) } },
    { name: "telegram", send: async (m: Message) => { if (failTg) throw new Error("telegram refused (401)"); tg.push(m) } },
  ]
  beforeEach(() => { tg.length = 0 })
  it("sends each event on every channel and records one timeline entry per channel", async () => {
    await runEvaluation({ now: T0, channels: channels(), snapshot: stuckSev1(T0) })
    expect(sent).toHaveLength(1); expect(tg).toHaveLength(1)
    expect((await rows("SELECT channel, ok FROM alert_events WHERE kind = 'notified' ORDER BY id"))).toEqual([{ channel: "email", ok: true }, { channel: "telegram", ok: true }])
  })
  it("a failing channel does not stop the other, and the incident counts as notified", async () => {
    await runEvaluation({ now: T0, channels: channels(false, true), snapshot: stuckSev1(T0) })
    expect(sent).toHaveLength(1); expect(tg).toHaveLength(0)
    expect((await inc())[0].notified_at).not.toBeNull()
    expect((await rows("SELECT channel, ok, detail FROM alert_events WHERE kind = 'notified' ORDER BY id")).find((e) => e.channel === "telegram")).toMatchObject({ ok: false, detail: "telegram refused (401)" })
    await runEvaluation({ now: T0 + 5 * M, channels: channels(false, true), snapshot: stuckSev1(T0 + 5 * M) })
    expect(sent).toHaveLength(1)   // no resend of what was delivered
  })
  it("only when every channel fails is the event retried on the next evaluation", async () => {
    await runEvaluation({ now: T0, channels: channels(true, true), snapshot: stuckSev1(T0) })
    expect((await inc())[0].notified_at).toBeNull()
    const r = await runEvaluation({ now: T0 + 5 * M, channels: channels(), snapshot: stuckSev1(T0 + 5 * M) })
    expect(r.retried).toBe(1); expect(sent).toHaveLength(1); expect(tg).toHaveLength(1)
  })
  it("the default channels are email alone until Telegram is configured, then both", () => {
    expect(defaultChannels({}).map((c) => c.name)).toEqual(["email"])
    expect(defaultChannels({ TELEGRAM_BOT_TOKEN: "1234567890:AAH-abcdefghijklmnopqrstuvwxyz012345", TELEGRAM_CHAT_ID: "123456789" }).map((c) => c.name)).toEqual(["email", "telegram"])
  })
  it("each configured Telegram chat is its own channel, so one failing chat does not hide the others", () => {
    const names = defaultChannels({ TELEGRAM_BOT_TOKEN: "1234567890:AAH-abcdefghijklmnopqrstuvwxyz012345", TELEGRAM_CHAT_ID: "123456789", TELEGRAM_CHAT_ID_2: "987654321" }).map((c) => c.name)
    expect(names).toEqual(["email", "telegram", "telegram 2"])
  })
  it("a test notification says why Telegram is off instead of leaving it out", async () => {
    const r = await sendTestNotification(channels().slice(0, 1), ["TELEGRAM_BOT_TOKEN is not set in this deployment's environment"])
    expect(r).toEqual([{ channel: "telegram", ok: false, error: "not switched on: TELEGRAM_BOT_TOKEN is not set in this deployment's environment" }, { channel: "email", ok: true }])
    expect(await sendTestNotification(channels().slice(0, 1), [])).toEqual([{ channel: "email", ok: true }])
  })
  it("a test notification reports each channel's result", async () => {
    expect(await sendTestNotification(channels(false, true))).toEqual([{ channel: "email", ok: true }, { channel: "telegram", ok: false, error: "telegram refused (401)" }])
    expect(sent[0].subject).toBe("[Anker test] alert delivery")
  })
})

describe("message building", () => {
  it("renders evidence as lines and links the SAIL incident when SAIL_URL is set", () => {
    const m = buildMessage("opened", { id: 7, rule_key: "cron_stale", subject: "agents", severity: 2, summary: "agents last completed 90 minutes ago.", evidence: { job: "agents", lastOkMinutesAgo: 90 }, opened_at: new Date(T0), times_seen: 3 }, { SAIL_URL: "https://sail.example.com/" })
    expect(m.text).toContain("  lastOkMinutesAgo: 90"); expect(m.text).toContain("seen 3 times"); expect(m.text).toContain("https://sail.example.com/alerts#incident-7")
    expect(buildMessage("opened", { id: 1, rule_key: "cron_stale", subject: "a", severity: 2, summary: "s", evidence: {} }, {}).text).not.toContain("Incident:")
  })
})

// ───────────── A2: quiet hours, the digest, severity 3 ─────────────
describe("quiet hours and the morning digest", () => {
  // 2026-10-16 is in summer time: Berlin is UTC+2. 21:00 UTC is 23:00 in Berlin (quiet); 05:30 UTC next day is 07:30 (not quiet).
  const NIGHT = Date.UTC(2026, 9, 16, 21, 0, 0), MORNING = Date.UTC(2026, 9, 17, 5, 30, 0), NEXT_NOON = Date.UTC(2026, 9, 17, 10, 0, 0)
  it("a severity 2 problem opened overnight is held, not sent, and the held mark stops the retry from sending it", async () => {
    await run(stripeDown(NIGHT)); await run(stripeDown(NIGHT + 5 * M))
    expect(sent).toHaveLength(0)
    expect((await inc())[0]).toMatchObject({ status: "open", notified_at: null }); expect((await inc())[0].held_at).not.toBeNull()
    expect((await rows("SELECT kind, detail FROM alert_events ORDER BY id")).map((e) => e.kind)).toEqual(["opened", "held"])
    await run(stripeDown(NIGHT + 10 * M)); expect(sent).toHaveLength(0)
  })
  it("a severity 1 problem is sent at any hour", async () => {
    await run(stuckSev1(NIGHT)); expect(sent).toHaveLength(1); expect(sent[0].subject).toMatch(/SEV1/)
  })
  it("the morning digest lists everything held, once, marks it notified and is not repeated that day", async () => {
    await db.exec("UPDATE alert_heartbeat SET digest_on = '2026-10-16'")
    await run(stripeDown(NIGHT)); await run(stripeDown(NIGHT + 5 * M)); expect(sent).toHaveLength(0)
    const r = await run(stripeDown(MORNING))
    expect(r.digest).toBe(true); expect(sent).toHaveLength(1)
    expect(sent[0].subject).toBe("[Anker] Morning digest: 1 open"); expect(sent[0].text).toContain("SEV2 dependency_down: Stripe billing"); expect(sent[0].text).toContain("held overnight"); expect(sent[0].text).toContain("not acknowledged")
    expect((await inc())[0]).toMatchObject({ held_at: null }); expect((await inc())[0].notified_at).not.toBeNull()
    expect((await rows("SELECT kind FROM alert_events WHERE kind = 'digest'"))).toHaveLength(1)
    await run(stripeDown(MORNING + 5 * M)); expect(sent).toHaveLength(1)
    expect((await rows("SELECT digest_on::text d FROM alert_heartbeat"))[0].d).toBe("2026-10-17")
  })
  it("no digest when nothing is open, and no digest in quiet hours", async () => {
    await db.exec("UPDATE alert_heartbeat SET digest_on = NULL")
    expect((await run(snap(MORNING))).digest).toBe(false); expect(sent).toHaveLength(0)
    await db.exec("UPDATE alert_heartbeat SET digest_on = '2026-10-15'")
    await run(stuckSev1(NIGHT)); sent.length = 0
    expect((await run(stuckSev1(NIGHT + 5 * M))).digest).toBe(false); expect(sent).toHaveLength(0)
  })
  it("a severity 2 reminder that falls in quiet hours is skipped, and sent once the day starts", async () => {
    await run(stripeDown(NEXT_NOON)); await run(stripeDown(NEXT_NOON + 5 * M)); sent.length = 0
    const night = NEXT_NOON + 5 * M + 3 * REMIND_MS      // 22:05 UTC = 00:05 Berlin
    await run(stripeDown(night)); expect(sent.filter((m) => /still open/.test(m.subject))).toHaveLength(0)
    await run(stripeDown(night + 9 * H)); expect(sent.filter((m) => /still open/.test(m.subject)).length + sent.filter((m) => m.kind === "digest").length).toBeGreaterThan(0)
  })
  it("a severity 3 problem is never sent on its own: it waits for the digest", async () => {
    const deg = (now: number) => snap(now, { depHistory: { "Outreach footer address": ["degraded", "degraded", "degraded"] } })
    await run(deg(NEXT_NOON)); await run(deg(NEXT_NOON + 5 * M))
    expect(sent).toHaveLength(0); expect((await inc())[0]).toMatchObject({ rule_key: "dependency_degraded", severity: 3, status: "open" }); expect((await inc())[0].held_at).not.toBeNull()
    await db.exec("UPDATE alert_heartbeat SET digest_on = '2026-10-16'")
    await run(deg(NEXT_NOON + 10 * M)); expect(sent).toHaveLength(1); expect(sent[0].kind).toBe("digest"); expect(sent[0].text).toContain("SEV3 dependency_degraded")
  })
  it("buildDigest counts by severity and tells acknowledged from not", () => {
    const m = buildDigest([{ rule_key: "a", subject: "x", severity: 2, status: "acknowledged", summary: "s2", opened_at: new Date(T0 - 5 * H) }, { rule_key: "b", subject: "y", severity: 1, status: "open", summary: "s1", opened_at: new Date(T0 - 30 * M), held_at: null }], T0, {})
    expect(m.text.split("\n")[0]).toBe("2 open incidents: 1 SEV1, 1 SEV2"); expect(m.text.indexOf("SEV1 b")).toBeLessThan(m.text.indexOf("SEV2 a")); expect(m.text).toContain("acknowledged"); expect(m.kind).toBe("digest")
  })
})

describe("A2 rules through the engine", () => {
  it("an AI provider with too many failures opens an incident; a quiet provider, too few calls or a rate under the threshold do not", async () => {
    const ai = (n: number, f: number) => (now: number) => snap(now, { ai: { qwen: { calls: n, failed: f } } })
    await run(ai(20, 10)(T0)); await run(ai(20, 10)(T0 + 5 * M))
    expect((await inc())[0]).toMatchObject({ rule_key: "ai_failure_rate", subject: "qwen", severity: 2 }); expect(sent[0].text).toContain("10 of 20 AI calls failed")
    await db.exec("DELETE FROM alert_events; DELETE FROM alert_incidents"); sent.length = 0
    await run(ai(5, 5)(T0)); await run(ai(5, 5)(T0 + 5 * M)); await run(ai(50, 5)(T0 + 10 * M)); await run(ai(50, 5)(T0 + 15 * M))
    expect(await inc()).toHaveLength(0)
  })
  it("the threshold is a setting: 5% opens what the default 20% does not, and out-of-range values fall back", async () => {
    const ai = (now: number) => snap(now, { ai: { qwen: { calls: 100, failed: 10 } } })
    await run(ai(T0)); await run(ai(T0 + 5 * M)); expect(await inc()).toHaveLength(0)
    await db.exec(`INSERT INTO alert_rule_settings (rule_key, threshold) VALUES ('ai_failure_rate', '{"rate": 0.05}')`)
    await run(ai(T0 + 10 * M)); await run(ai(T0 + 15 * M)); expect(await inc()).toHaveLength(1)
    await db.exec("DELETE FROM alert_events; DELETE FROM alert_incidents; UPDATE alert_rule_settings SET threshold = '{\"rate\": 50}'")
    await run(ai(T0 + 20 * M)); await run(ai(T0 + 25 * M)); expect(await inc()).toHaveLength(0)   // 50 is not a rate: the default 20% applies and 10% is under it
  })
  it("a privacy request due within a week opens an incident that carries no personal data, and clears when the request is closed", async () => {
    const due = (now: number, days: number) => snap(now, { privacy: [{ id: "req-1", kind: "erasure", dueAt: now + days * 86_400_000 }] })
    await run(due(T0, 3)); await run(due(T0 + 5 * M, 3))
    expect((await inc())[0]).toMatchObject({ rule_key: "privacy_request_due", subject: "req-1" }); expect(sent[0].text).toContain("due in 3 day"); expect(sent[0].text).not.toMatch(/@/)
    await run(due(T0 + 10 * M, 20)); expect(await rows("SELECT status FROM alert_incidents")).toEqual([{ status: "open" }])
    for (let i = 0; i < RESOLVE_AFTER; i++) await run(snap(T0 + (15 + 5 * i) * M, { privacy: [] }))
    expect((await inc())[0].status).toBe("resolved")
  })
  it("the quiet-hours setting moves the window", async () => {
    await db.exec(`INSERT INTO alert_rule_settings (rule_key, threshold) VALUES ('quiet_hours', '{"start": 13, "end": 15}')`)   // 14:00 Berlin at T0 is now quiet
    await run(stripeDown(T0)); await run(stripeDown(T0 + 5 * M)); expect(sent).toHaveLength(0)
  })
})
