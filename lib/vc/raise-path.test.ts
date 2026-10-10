import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
const h = vi.hoisted(() => ({ sql: vi.fn() as any }))
vi.mock("@/lib/db", () => ({ sql: h.sql }))
vi.mock("@/lib/ai/provider", () => ({ generateDetailed: vi.fn() }))
vi.mock("@/lib/actions/store", () => ({ propose: vi.fn() }))
import { raiseState, missingForDrafts, toFundFacts, SHORTLIST_MIN } from "./raise-path"
import { buildLpPrompt, checkLpDraft, fundFactLines, inventedFigures } from "./lp-draft"
import { draftLpWave, WaveError, WAVE_PER_DAY } from "./lp-wave"

let db: PGlite
const ORG = "org-a"
const fundRow = (over: Record<string, unknown> = {}) => ({
  id: "fp1",
  name: "Winner Capital Seed Fund",
  gp_name: "Dana Reyes",
  target_raise: "5000000",
  minimum_commitment: "250000",
  thesis_description: "Pre-seed and seed rounds in consumer AI.",
  sectors: ["AI/ML", "Consumer"],
  geographic_focus: ["North America"],
  gp_commitment: "2",
  fund_number: 1,
  headquarters_location: "Berlin",
  target_lp_types: ["Family Office"],
  value_proposition: null,
  ...over,
})
const setFund = async (over: Record<string, unknown> = {}) => {
  await db.exec("DELETE FROM fund_profiles")
  const r = fundRow(over)
  await db.query(
    "INSERT INTO fund_profiles (id, org_id, is_active, name, gp_name, target_raise, minimum_commitment, thesis_description, sectors, geographic_focus, gp_commitment, fund_number, headquarters_location, target_lp_types, value_proposition) VALUES ($1,$2,true,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
    [
      r.id,
      ORG,
      r.name,
      r.gp_name,
      r.target_raise,
      r.minimum_commitment,
      r.thesis_description,
      JSON.stringify(r.sectors),
      JSON.stringify(r.geographic_focus),
      r.gp_commitment,
      r.fund_number,
      r.headquarters_location,
      JSON.stringify(r.target_lp_types),
      r.value_proposition,
    ],
  )
}
const lp = (id: string, name: string, over: Record<string, unknown> = {}) =>
  db.query(
    "INSERT INTO crm_entries (id, org_id, source, display_name, display_email, display_linkedin, display_score, stage, added_at, display_type, display_location, why_match) VALUES ($1,$2,'lp_matching',$3,$4,$5,$6,'queued', now(), 'Family Office', 'Zurich', 'invests in early-stage AI')",
    [id, ORG, name, over.email ?? null, over.li ?? "https://linkedin.com/in/x", over.score ?? 50],
  )

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE fund_profiles (id text PRIMARY KEY, org_id text, is_active boolean, name text, gp_name text, target_raise numeric, minimum_commitment numeric, thesis_description text, sectors jsonb, geographic_focus jsonb, gp_commitment numeric, fund_number int, headquarters_location text, target_lp_types jsonb, value_proposition text, updated_at timestamptz DEFAULT now());
    CREATE TABLE lp_match_sessions (id serial PRIMARY KEY, fund_profile_id text, total_firms_matched int, total_contacts_matched int);
    CREATE TABLE crm_entries (id text PRIMARY KEY, org_id text, source text, display_name text, display_email text, display_linkedin text, display_score int, stage text, added_at timestamptz, display_title text, display_type text, display_location text, why_match text, research_summary text);
    CREATE TABLE outreach_messages (id serial PRIMARY KEY, crm_entry_id text, kind text, user_id text, channel text, status text, created_at timestamptz DEFAULT now());
    CREATE TABLE action_proposals (id serial PRIMARY KEY, org_id text, capability text, status text, input jsonb, run_id text, created_at timestamptz DEFAULT now());
    CREATE TABLE send_authorizations (id serial PRIMARY KEY, org_id text);
    CREATE TABLE outreach_replies (id serial PRIMARY KEY, crm_entry_id text);`)
  h.sql.mockImplementation(
    async (strings: TemplateStringsArray, ...v: unknown[]) =>
      (
        await db.query(
          strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""),
          v.map((x) => (Array.isArray(x) ? JSON.stringify(x) : x)),
        )
      ).rows,
  )
})
afterAll(async () => db.close())
beforeEach(async () => {
  await db.exec(
    "DELETE FROM fund_profiles; DELETE FROM lp_match_sessions; DELETE FROM crm_entries; DELETE FROM outreach_messages; DELETE FROM action_proposals; DELETE FROM send_authorizations; DELETE FROM outreach_replies",
  )
})

const good = (name = "Pat") =>
  JSON.stringify({
    subject: "Winner Capital Seed Fund and your AI interest",
    email: `Hello ${name},\n\nI am Dana Reyes, General Partner of Winner Capital Seed Fund. We are raising 5M for pre-seed and seed rounds in consumer AI, and your work backing early-stage AI made me think of you.\n\nWould you be open to a 20-minute introductory call?\n\nDana Reyes, Winner Capital Seed Fund`,
    dm: "Hi, I run Winner Capital Seed Fund, a 5M pre-seed AI fund. Your early-stage AI work stood out. Open to a 20-minute intro call?",
  })

describe("raise path state", () => {
  it("an empty fund workspace starts at step 1 and says what the profile lacks", async () => {
    const s = await raiseState(ORG)
    expect(s.complete).toBe(false)
    expect(s.next?.id).toBe("fund")
    expect(s.fund).toBeNull()
    await setFund({ gp_name: null, thesis_description: null, sectors: [] })
    const t = await raiseState(ORG)
    expect(t.next?.id).toBe("fund")
    expect(t.fund!.missing).toEqual(["GP name", "a thesis or sectors"])
    expect(t.steps[0].detail).toMatch(/GP name, a thesis or sectors/)
  })
  it("moves through the steps from the records alone and completes when a wave has been approved", async () => {
    await setFund()
    expect((await raiseState(ORG)).next?.id).toBe("match")
    await db.exec(
      "INSERT INTO lp_match_sessions (fund_profile_id, total_firms_matched, total_contacts_matched) VALUES ('fp1', 40, 120)",
    )
    expect((await raiseState(ORG)).next?.id).toBe("shortlist")
    for (let i = 0; i < SHORTLIST_MIN; i++)
      await lp(`l${i}`, `LP ${i}`, { email: i < 4 ? `lp${i}@fund.test` : null })
    let s = await raiseState(ORG)
    expect(s.next).toMatchObject({ id: "draft", action: "drafts" })
    expect(s.counts).toMatchObject({ lpContacts: 10, withEmail: 4, draftable: 10 })
    await db.exec(
      "INSERT INTO action_proposals (org_id, capability, status, input) VALUES ('org-a','outreach_save_drafts','pending','{\"entryId\":\"l0\"}')",
    )
    s = await raiseState(ORG)
    expect(s.steps.find((x) => x.id === "draft")).toMatchObject({
      done: true,
      href: "/dashboard/actions",
      action: null,
    })
    expect(s.next).toMatchObject({ id: "send", href: "/dashboard/actions", button: "Approve the drafts" })
    expect(s.counts).toMatchObject({ pendingProposals: 1, draftable: 9 })
    // Drafts saved by approval: the send step now opens the review for the sender's own email drafts, with an address, best match first.
    await db.exec("UPDATE action_proposals SET status = 'applied'")
    await db.exec(
      "INSERT INTO outreach_messages (crm_entry_id, kind, user_id, channel, status) VALUES ('l1','email_intro','u1','email','draft'), ('l3','email_intro','u1','email','draft'), ('l0','email_intro','u1','email','draft'), ('l2','email_intro','u2','email','draft'), ('l0','dm_intro','u1','linkedin','draft')",
    )
    s = await raiseState(ORG, "u1")
    expect(s.counts.draftEmails).toBe(3)
    expect(s.draftEmailIds).toHaveLength(3)
    expect(s.next).toMatchObject({
      id: "send",
      action: "send",
      href: null,
      button: "Review and send 3 emails",
    })
    expect((await raiseState(ORG)).draftEmailIds).toEqual([]) // without a sender there is nothing to review
    await db.exec("INSERT INTO send_authorizations (org_id) VALUES ('org-a')")
    s = await raiseState(ORG)
    expect(s.complete).toBe(true)
    expect(s.next).toBeNull()
    expect(s.steps.find((x) => x.id === "follow")!.done).toBe(false)
    await db.exec("INSERT INTO outreach_replies (crm_entry_id) VALUES ('l0')")
    expect((await raiseState(ORG)).steps.find((x) => x.id === "follow")!.done).toBe(true)
  })
  it("does not count another workspace's records", async () => {
    await setFund()
    await db.exec(
      "INSERT INTO crm_entries (id, org_id, source, stage) VALUES ('x','org-b','lp_matching','queued')",
    )
    expect((await raiseState(ORG)).counts.lpContacts).toBe(0)
  })
})

describe("what the writer may say", () => {
  const fund = toFundFacts(fundRow())
  it("needs a name, a GP, a target raise and a thesis or sectors", () => {
    expect(missingForDrafts(fund)).toEqual([])
    expect(
      missingForDrafts(
        toFundFacts(fundRow({ gp_name: null, target_raise: 0, thesis_description: null, sectors: [] })),
      ),
    ).toEqual(["GP name", "target raise", "a thesis or sectors"])
  })
  it("gives the model the fund's facts and tells it to use nothing else", () => {
    const p = buildLpPrompt({ display_name: "Pat Lee", display_type: "Family Office" }, fund)
    expect(p).toMatch(/use ONLY the facts under FUND FACTS/i)
    expect(p).toContain("Raising: 5M")
    expect(p).toContain("Written by: Dana Reyes")
    expect(p).toContain("Minimum commitment: 250K")
    expect(fundFactLines(toFundFacts(fundRow({ target_raise: null }))).join("\n")).not.toContain("Raising")
  })
  it("catches a figure that is not in the profile and accepts the ones that are", () => {
    expect(inventedFigures("We are raising 5M and the minimum is 250K.", fund)).toEqual([])
    expect(inventedFigures("Our first fund returned 3x with a 28% IRR.", fund).length).toBeGreaterThan(0)
    expect(inventedFigures("We manage 200M.", fund)).toEqual(["200M"])
    expect(inventedFigures("a 20-minute call", fund)).toEqual([])
    expect(inventedFigures("We are raising €5M.", fund)).toEqual(["€5M"]) // the profile states no currency, so the message may not add one
    expect(inventedFigures("We are raising 5M.", fund)).toEqual([])
  })
  it("accepts a good draft and refuses an unusable answer, a short email and an invented return", () => {
    const e = { display_name: "Pat Lee" }
    expect(checkLpDraft(good(), e, fund).skip).toBeUndefined()
    expect(checkLpDraft("sorry I cannot", e, fund).skip).toMatch(/could not be used/)
    expect(
      checkLpDraft(JSON.stringify({ subject: "x", email: "Too short.", dm: "hi" }), e, fund).skip,
    ).toMatch(/too short/)
    const invented = JSON.parse(good())
    invented.email += "\n\nOur prior fund returned 3.2x net to LPs."
    expect(checkLpDraft(JSON.stringify(invented), e, fund).skip).toMatch(/not in the fund profile/)
  })
})

describe("writing the first wave", () => {
  const mk = (over: Partial<Parameters<typeof draftLpWave>[2]> = {}) => {
    const proposals: any[] = []
    return {
      proposals,
      deps: {
        generate: vi.fn(async () => good()),
        propose: vi.fn(async (_s: any, cap: string, input: any, ctx: any) => {
          proposals.push({ cap, input, ctx })
          await db.query(
            "INSERT INTO action_proposals (org_id, capability, status, input, run_id) VALUES ($1,$2,'pending',$3,$4)",
            [ORG, cap, JSON.stringify(input), ctx.runId],
          )
          return {}
        }),
        ...over,
      } as any,
    }
  }
  const scope = { orgId: ORG, userId: "u1", persona: "vc" }
  it("refuses until the fund profile has what the messages need", async () => {
    await expect(draftLpWave(scope, 5, mk().deps)).rejects.toThrow(/Create the fund profile/)
    await setFund({ gp_name: null })
    await expect(draftLpWave(scope, 5, mk().deps)).rejects.toThrow(/GP name/)
  })
  it("proposes a pair for each contact, emails first, as untrusted-source R1 proposals, and sends nothing", async () => {
    await setFund()
    await lp("a", "No Email", { score: 99 })
    await lp("b", "Has Email", { email: "b@fund.test", score: 10 })
    const { deps, proposals } = mk()
    const r = await draftLpWave(scope, 5, deps)
    expect(r).toMatchObject({ proposed: 2, considered: 2 })
    expect(proposals.map((p) => p.input.entryId)).toEqual(["b", "a"]) // the one with an email first, despite the lower score
    for (const p of proposals) {
      expect(p.cap).toBe("outreach_save_drafts")
      expect(p.ctx).toEqual({ runId: "raise-path", trust: "untrusted" })
      expect(Object.keys(p.input).sort()).toEqual(["dm", "email", "entryId", "subject"])
    }
    expect((await db.query<{ n: number }>("SELECT count(*)::int n FROM outreach_messages")).rows[0].n).toBe(0)
  })
  it("skips a contact that already has a draft or a pending proposal, and one whose draft is not usable", async () => {
    await setFund()
    for (const [i, n] of ["a", "b", "c", "d"].entries())
      await lp(n, `LP ${n}`, { email: `${n}@fund.test`, score: 90 - i })
    await db.exec("INSERT INTO outreach_messages (crm_entry_id, kind) VALUES ('a','email_intro')")
    await db.exec(
      "INSERT INTO action_proposals (org_id, capability, status, input) VALUES ('org-a','outreach_save_drafts','pending','{\"entryId\":\"b\"}')",
    )
    let call = 0
    const { deps, proposals } = mk({ generate: vi.fn(async () => (call++ === 0 ? "no json here" : good())) })
    const r = await draftLpWave(scope, 10, deps)
    expect(r.considered).toBe(2)
    expect(r.proposed).toBe(1)
    expect(r.skipped).toEqual([{ name: "LP c", reason: "the model's answer could not be used" }])
    expect(proposals[0].input.entryId).toBe("d")
  })
  it("never drafts more than ten per request or the daily limit, and says when the limit is reached", async () => {
    await setFund()
    for (let i = 0; i < 15; i++) await lp(`m${i}`, `LP ${i}`, { email: `m${i}@fund.test`, score: 90 - i })
    const a = mk()
    expect((await draftLpWave(scope, 50, a.deps)).proposed).toBe(10)
    await db.exec(`UPDATE action_proposals SET status = 'applied'`)
    for (let i = 0; i < WAVE_PER_DAY; i++)
      await db.exec(
        "INSERT INTO action_proposals (org_id, capability, status, run_id) VALUES ('org-a','outreach_save_drafts','applied','raise-path')",
      )
    const err = await draftLpWave(scope, 5, mk().deps).catch((e) => e)
    expect(err).toBeInstanceOf(WaveError)
    expect(err.status).toBe(429)
    expect(err.message).toMatch(/limit of 25/)
  })
  it("keeps what it has already proposed when the AI spending limit stops it, and survives a contact that errors", async () => {
    await setFund()
    for (const n of ["a", "b", "c"])
      await lp(n, `LP ${n}`, { email: `${n}@fund.test`, score: n === "a" ? 90 : n === "b" ? 80 : 70 })
    let call = 0
    const { deps, proposals } = mk({
      generate: vi.fn(async () => {
        call++
        if (call === 1) return good()
        if (call === 2) throw new Error("timeout")
        throw Object.assign(new Error("limit"), { status: "budget_stopped" })
      }),
    })
    const r = await draftLpWave(scope, 10, deps)
    expect(r.proposed).toBe(1)
    expect(r.stoppedAtLimit).toBe(true)
    expect(r.skipped.map((s) => s.reason)).toEqual([
      expect.stringMatching(/^no draft: timeout/),
      "stopped at the AI spending limit",
    ])
    expect(proposals).toHaveLength(1)
  })
})
