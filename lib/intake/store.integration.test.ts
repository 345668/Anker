/** The intake pipeline end to end against a real Postgres (PGlite) with the real migration: submit, assess, land in the pipeline, rank. */
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
const h = vi.hoisted(() => ({ sql: vi.fn(), gen: vi.fn(), mail: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: h.sql }))
vi.mock("@/lib/ai/provider", () => ({ generateDetailed: h.gen }))
vi.mock("@/lib/email/resend", () => ({ isResendConfigured: () => true, sendEmail: h.mail }))
vi.mock("@/lib/portfolio/deal-pipeline", () => ({
  hasDealTables: async () => true,
  createDeal: async (i: any) => (await h.sql`INSERT INTO deal_opportunities (fund_id, company_name, sector, source, submitted_via, deck_url, contact_email) VALUES (${i.fundId}, ${i.companyName}, ${i.sector ?? null}, ${i.source}, ${i.submittedVia}, ${i.deckUrl ?? null}, ${i.contactEmail}) RETURNING *`)[0],
  upsertEvaluation: async (dealId: string, scores: any) => { await h.sql`INSERT INTO deal_evaluations (deal_id, scores) VALUES (${dealId}, ${JSON.stringify(scores)}::jsonb) ON CONFLICT (deal_id) DO UPDATE SET scores = EXCLUDED.scores` },
}))
import { getConfig, saveConfig, getPublicIntake, createSubmission, processSubmission, rerunSubmission, sweepSubmissions } from "./store"

let db: PGlite
const reply = (n: number) => JSON.stringify({ dimensions: ["team", "market", "product", "traction", "thesis", "valuation"].map((key) => ({ key, score: n, note: "n" })), summary: "ok", strengths: [], concerns: [], questions: [] })
const sub = (over: Record<string, unknown> = {}, ref = "INT-" + Math.random().toString(36).slice(2, 8)) => createSubmission({ fundId: "f1", publicRef: ref, companyName: "Acme", contactName: "Ann", contactEmail: "ann@acme.io",
  answers: { stage: "Seed", sectors: "AI", location: "United States", raise_amount: "1000000", problem: "p", terms_accepted: "x", ...over } })
const row = async (id: string) => (await db.query("SELECT * FROM intake_submissions WHERE id = $1", [id])).rows[0] as any

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE funds (id text PRIMARY KEY, name text, slug text);
    CREATE TABLE deal_opportunities (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, fund_id text, company_name text, sector text, source text, submitted_via text, deck_url text, contact_email text, metadata jsonb DEFAULT '{}'::jsonb, updated_at timestamptz DEFAULT now(), created_at timestamptz DEFAULT now());
    CREATE TABLE deal_evaluations (deal_id text PRIMARY KEY, scores jsonb);
    CREATE TABLE organizations (id text PRIMARY KEY, fund_id text); CREATE TABLE memberships (org_id text, user_id text, org_role text); CREATE TABLE profiles (id text, email text);
    INSERT INTO funds VALUES ('f1', 'Summit', 'summit'), ('f2', 'Other', 'other');
    INSERT INTO organizations VALUES ('o1', 'f1'); INSERT INTO memberships VALUES ('o1', 'u1', 'workspace_owner'), ('o1', 'u2', 'admin'), ('o1', 'u3', 'member');
    INSERT INTO profiles VALUES ('u1', 'owner@fund.test'), ('u2', 'admin@fund.test'), ('u3', 'member@fund.test');`)
  await db.exec(readFileSync("scripts/migrations/2026-10-04-fund-intake.sql", "utf8"))
  await db.exec(readFileSync("scripts/migrations/2026-10-04b-intake-notified.sql", "utf8"))
  h.sql.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => (await db.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values)).rows)
}, 30000)
afterAll(async () => db.close())
beforeEach(async () => {
  await db.exec("DELETE FROM intake_submissions; DELETE FROM deal_opportunities; DELETE FROM deal_evaluations; DELETE FROM fund_intake_configs")
  h.gen.mockReset(); h.gen.mockResolvedValue({ text: reply(5) }); h.mail.mockReset(); h.mail.mockResolvedValue({})
  await saveConfig("f1", { enabled: true, thesis: "software", gates: { stages: ["Seed"], sectors: ["AI"], excludedSectors: ["Crypto"] } }, "u1")
})

describe("config", () => {
  it("saves, versions up, and rejects bad weights", async () => {
    expect((await getConfig("f1")).version).toBe(1)
    await saveConfig("f1", { enabled: true, thesis: "changed" }, "u1")
    expect(await getConfig("f1")).toMatchObject({ version: 2, config: { thesis: "changed" } })
    await expect(saveConfig("f1", { rubric: [{ key: "a", label: "A", weight: 0.4 }] }, "u1")).rejects.toThrow()
  })
  it("the public view needs an enabled fund and never carries the thesis, gates or rubric", async () => {
    const p = await getPublicIntake("summit")
    expect(p).toMatchObject({ fundId: "f1", fundName: "Summit" }); expect(JSON.stringify(p)).not.toContain("software")
    expect(await getPublicIntake("other")).toBeNull(); expect(await getPublicIntake("nope")).toBeNull()
    await saveConfig("f1", { enabled: false }, "u1"); expect(await getPublicIntake("summit")).toBeNull()
  })
})

describe("processing", () => {
  it("assesses, lands a deal carrying the engine result, and fills the scorecard", async () => {
    const id = await sub()
    expect(await processSubmission(id)).toMatchObject({ outcome: "assessed", category: "passed" })
    const r = await row(id)
    expect(r).toMatchObject({ status: "assessed", category: "passed", config_version: 1 }); expect(Number(r.score)).toBe(100)
    const deal = (await db.query("SELECT * FROM deal_opportunities WHERE id = $1", [r.deal_id])).rows[0] as any
    expect(deal).toMatchObject({ fund_id: "f1", submitted_via: "public_form", source: "inbound: fund intake form" })
    expect(deal.metadata.engine.category).toBe("passed"); expect(deal.metadata.intake.publicRef).toBe(r.public_ref)
    expect(((await db.query("SELECT scores FROM deal_evaluations WHERE deal_id = $1", [r.deal_id])).rows[0] as any).scores.team.score).toBe(5)
  })
  it("categorises a weak, a borderline and a clearly out-of-scope submission differently", async () => {
    h.gen.mockResolvedValueOnce({ text: reply(2) }); const weak = await sub()
    h.gen.mockResolvedValueOnce({ text: reply(4) }); const mid = await sub({ stage: "Series B" })
    const out = await sub({ sectors: "Crypto" })
    await sweepSubmissions(); await sweepSubmissions()
    expect((await row(weak)).category).toBe("not_a_fit")
    expect((await row(mid)).category).toBe("review")
    expect((await row(out)).category).toBe("not_a_fit"); expect(h.gen).toHaveBeenCalledTimes(2)
  })
  it("is idempotent: a second claim does nothing, and a re-run updates the same deal", async () => {
    const id = await sub()
    await processSubmission(id); expect(await processSubmission(id)).toMatchObject({ outcome: "skipped" })
    const first = (await row(id)).deal_id
    h.gen.mockResolvedValue({ text: reply(2) })
    expect(await rerunSubmission(id, "f1")).toMatchObject({ outcome: "assessed", category: "not_a_fit" })
    expect((await row(id)).deal_id).toBe(first); expect((await db.query("SELECT 1 FROM deal_opportunities")).rows.length).toBe(1)
    expect((((await db.query("SELECT metadata FROM deal_opportunities")).rows[0]) as any).metadata.engine.category).toBe("not_a_fit")
    expect(await rerunSubmission(id, "f2")).toMatchObject({ outcome: "skipped" })
  })
  it("an AI fault routes to Review, and a database fault retries then stops after three attempts without losing the submission", async () => {
    h.gen.mockResolvedValue({ text: "", error: "boom" })
    const a = await sub(); await processSubmission(a)
    expect(await row(a)).toMatchObject({ status: "assessed", category: "review" })
    const b = await sub()
    await db.exec("ALTER TABLE deal_opportunities RENAME TO deal_opportunities_x")
    for (let i = 0; i < 3; i++) await sweepSubmissions()
    expect(await row(b)).toMatchObject({ status: "failed", attempts: 3 }); expect((await row(b)).last_error).toBeTruthy()
    await db.exec("ALTER TABLE deal_opportunities_x RENAME TO deal_opportunities")
    expect((await row(b)).company_name).toBe("Acme")
  })
  it("the sweep recovers a run that crashed while assessing", async () => {
    const id = await sub()
    await db.query("UPDATE intake_submissions SET status = 'assessing', updated_at = now() - interval '20 minutes' WHERE id = $1", [id])
    await sweepSubmissions(); expect((await row(id)).status).toBe("assessed")
  })
})

describe("telling the fund", () => {
  it("emails the owners and admins, not plain members, once, with a link to the deal", async () => {
    const id = await sub(); await processSubmission(id)
    expect(h.mail.mock.calls.map((c) => c[0].to).sort()).toEqual(["admin@fund.test", "owner@fund.test"])
    const m = h.mail.mock.calls[0][0]
    expect(m).toMatchObject({ purpose: "transactional", noTracking: true }); expect(m.subject).toMatch(/Passed: Acme applied \(score 100\)/); expect(m.text).toContain(`/dashboard/portfolio/fund/deals/${(await row(id)).deal_id}`)
    h.mail.mockClear(); await rerunSubmission(id, "f1"); expect(h.mail).not.toHaveBeenCalled()
  })
  it("Not a fit stays quiet by default, and the switch and the ticks are honoured", async () => {
    await processSubmission(await sub({ sectors: "Crypto" })); expect(h.mail).not.toHaveBeenCalled()
    await saveConfig("f1", { enabled: true, gates: { stages: ["Seed"], sectors: ["AI"], excludedSectors: ["Crypto"] }, notify: { onNew: true, notAFit: true } }, "u1")
    await processSubmission(await sub({ sectors: "Crypto" })); expect(h.mail).toHaveBeenCalledTimes(2)
    h.mail.mockClear(); await saveConfig("f1", { enabled: true, notify: { onNew: false } }, "u1")
    await processSubmission(await sub()); expect(h.mail).not.toHaveBeenCalled()
  })
  it("a failing email never fails the assessment", async () => {
    h.mail.mockRejectedValue(new Error("smtp down")); const id = await sub()
    expect(await processSubmission(id)).toMatchObject({ outcome: "assessed" })
  })
})
