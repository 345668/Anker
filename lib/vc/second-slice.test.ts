import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
const h = vi.hoisted(() => ({ sql: vi.fn() as any }))
vi.mock("@/lib/db", () => ({ sql: h.sql }))
vi.mock("@/lib/linkedin/action-queue", () => ({ enqueueAction: vi.fn() }))
import { addTopLps } from "./shortlist"
import { quickFundSchema, saveQuickFund, QuickFundError } from "./fund-quick"
import { linkedinCounts, queueLinkedIn } from "./linkedin-wave"
import { raiseState } from "./raise-path"

let db: PGlite
const ORG = "org-a",
  U = "u1"
const FP = "fp1"
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE fund_profiles (id text PRIMARY KEY, org_id text, user_id text, is_active boolean, name text, fund_name text, gp_name text, target_raise numeric, minimum_commitment numeric, thesis_description text, sectors jsonb DEFAULT '[]', primary_sectors jsonb DEFAULT '[]', geographic_focus jsonb DEFAULT '[]', headquarters_location text, gp_commitment numeric, fund_number int, target_lp_types jsonb DEFAULT '[]', value_proposition text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE lp_match_sessions (id text PRIMARY KEY, fund_profile_id text, status text, total_firms_matched int, total_contacts_matched int, created_at timestamptz DEFAULT now());
    CREATE TABLE investors (id text PRIMARY KEY, firm_id text);
    CREATE TABLE lp_firm_matches (id text PRIMARY KEY, session_id text, firm_id text, score numeric);
    CREATE TABLE lp_contact_matches (id text PRIMARY KEY, session_id text, firm_match_id text, contact_id text, investor_id text, contact_name text, contact_title text, contact_email text, contact_linkedin text, contact_location text, contact_type text, score numeric, tier text, why_this_lp text, is_decision_maker boolean);
    CREATE TABLE crm_boards (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id text, user_id text, name text, source_session_id text, position int, archived boolean DEFAULT false);
    CREATE UNIQUE INDEX crm_boards_src ON crm_boards (org_id, source_session_id) WHERE source_session_id IS NOT NULL;
    CREATE TABLE crm_entries (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, org_id text, user_id text, source text, source_session_id text, board_id uuid, import_key text, firm_id text, investor_id text, display_name text, display_title text, display_email text, display_linkedin text, display_location text, display_type text, display_score int, display_tier text, why_match text, stage text, added_at timestamptz DEFAULT now());
    CREATE UNIQUE INDEX crm_entries_id_ix ON crm_entries (org_id, source, import_key);
    CREATE TABLE outreach_messages (id serial PRIMARY KEY, crm_entry_id text, kind text, user_id text, channel text, status text, body text, created_at timestamptz DEFAULT now());
    CREATE TABLE action_proposals (id serial PRIMARY KEY, org_id text, capability text, status text, input jsonb, run_id text, created_at timestamptz DEFAULT now());
    CREATE TABLE send_authorizations (id serial PRIMARY KEY, org_id text);
    CREATE TABLE outreach_replies (id serial PRIMARY KEY, crm_entry_id text);
    CREATE TABLE li_action_queue (id serial PRIMARY KEY, user_id text, crm_entry_id text, action_type text, status text);
    CREATE TABLE linkedin_senders (id text PRIMARY KEY, user_id text, status text, created_at timestamptz DEFAULT now());`)
  const run = (q: string, v: unknown[]) => db.query(q, v).then((r) => r.rows)
  const fn: any = async (strings: TemplateStringsArray, ...v: unknown[]) =>
    run(
      strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""),
      v.map((x) => (Array.isArray(x) ? JSON.stringify(x) : x)),
    )
  fn.unsafe = (q: string, v: unknown[] = []) => run(q, v)
  h.sql.mockImplementation(fn)
  Object.assign(h.sql, { unsafe: fn.unsafe })
})
afterAll(async () => db.close())
beforeEach(async () => {
  await db.exec(
    "DELETE FROM fund_profiles; DELETE FROM lp_match_sessions; DELETE FROM lp_firm_matches; DELETE FROM investors; DELETE FROM lp_contact_matches; DELETE FROM crm_entries; DELETE FROM crm_boards; DELETE FROM outreach_messages; DELETE FROM action_proposals; DELETE FROM li_action_queue; DELETE FROM linkedin_senders",
  )
  await db.exec(
    `INSERT INTO fund_profiles (id, org_id, user_id, is_active, name) VALUES ('${FP}','${ORG}','${U}',true,'Seed Fund')`,
  )
})
const session = (id: string, status = "completed", age = 0) =>
  db.query(
    "INSERT INTO lp_match_sessions (id, fund_profile_id, status, total_firms_matched, total_contacts_matched, created_at) VALUES ($1,$2,$3,10,10, now() - $4::interval)",
    [id, FP, status, `${age} hours`],
  )
// A matched contact; when a firm is given, the run's firm match for it is recorded too (the real data often has none).
const contact = async (id: string, firm: string, over: Record<string, unknown> = {}) => {
  if (firm)
    await db.query(
      "INSERT INTO lp_firm_matches (id, session_id, firm_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
      [firm, over.session ?? "s1", `firm-${firm}`],
    )
  return db.query(
    "INSERT INTO lp_contact_matches (id, session_id, firm_match_id, contact_id, investor_id, contact_name, contact_email, contact_linkedin, score, tier, is_decision_maker, why_this_lp) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'priority_a',$10,'a fit')",
    [
      id,
      over.session ?? "s1",
      firm,
      over.cid ?? id,
      over.inv ?? `inv-${id}`,
      over.name ?? `Name ${id}`,
      over.email ?? null,
      over.li === null ? null : (over.li ?? "https://www.linkedin.com/in/x"),
      over.score ?? 50,
      over.dm ?? false,
    ],
  )
}

describe("one-click shortlist", () => {
  it("takes the best contact at each of the top firms from the latest completed run, not two from one firm", async () => {
    await session("s1")
    await session("s0", "completed", 5)
    await contact("c1", "f1", { score: 90, email: null, name: "Firm One No Email" })
    await contact("c2", "f1", { score: 80, email: "two@f1.test", name: "Firm One With Email" })
    await contact("c3", "f2", { score: 70, email: "three@f2.test" })
    await contact("c4", "f3", { score: 60, li: null, email: null }) // no way to reach
    await contact("old", "f9", { session: "s0", score: 99, email: "old@x.test" })
    const r = await addTopLps({ orgId: ORG, userId: U }, 25)
    expect(r).toMatchObject({ added: 2, alreadyThere: 0, noRun: false, boardName: "LP shortlist: Seed Fund" })
    const rows = (
      await db.query<any>(
        "SELECT display_name, display_email, stage, source, board_id FROM crm_entries ORDER BY display_score DESC NULLS LAST, display_name",
      )
    ).rows
    expect(rows.map((x) => x.display_name).sort()).toEqual(["Firm One With Email", "Name c3"]) // the one with an email wins at f1; the unreachable and the old run's are absent
    expect(rows.every((x) => x.stage === "queued" && x.source === "lp_matching" && x.board_id)).toBe(true)
  })
  it("adds nobody twice: by email or by directory id, and a second click adds nothing", async () => {
    await session("s1")
    await contact("c1", "f1", { score: 90, email: "a@f.test" })
    await contact("c2", "f2", { score: 80, email: null, inv: "inv-known" })
    await contact("c3", "f3", { score: 70, email: "c@f.test" })
    await db.exec(
      `INSERT INTO crm_entries (org_id, user_id, source, import_key, display_email, stage) VALUES ('${ORG}','${U}','manual','m1','A@F.test','queued'), ('${ORG}','${U}','manual','m2',NULL,'queued')`,
    )
    await db.exec(`UPDATE crm_entries SET investor_id = 'inv-known' WHERE import_key = 'm2'`)
    const r = await addTopLps({ orgId: ORG, userId: U }, 25)
    expect(r).toMatchObject({ added: 1, alreadyThere: 2 })
    expect(await addTopLps({ orgId: ORG, userId: U }, 25)).toMatchObject({ added: 0 })
  })
  it("says so when there is no finished run, never goes over the limit, and only reads this workspace's fund", async () => {
    expect(await addTopLps({ orgId: ORG, userId: U })).toMatchObject({ noRun: true, added: 0 })
    await session("run-running", "running")
    await contact("x", "fx", { session: "run-running" })
    expect((await addTopLps({ orgId: ORG, userId: U })).noRun).toBe(true) // an unfinished run is not used
    await session("s1")
    for (let i = 0; i < 60; i++) await contact(`m${i}`, `f${i}`, { score: 100 - i, email: `m${i}@f.test` })
    expect((await addTopLps({ orgId: ORG, userId: U }, 500)).added).toBe(50)
    expect((await addTopLps({ orgId: "other-org", userId: U })).noRun).toBe(true)
  })
})

describe("shortlist on the shapes real matching data has", () => {
  it("finds the firm through the directory record or the email company when the run did not record it, and ignores a website or Twitter link as a LinkedIn address", async () => {
    await session("s1")
    // The matching run records no firm link on its contacts: two people at one firm (same directory firm), two at another (same email company), a Gmail user, and a contact whose "LinkedIn" is a website.
    await db.exec("INSERT INTO investors (id, firm_id) VALUES ('i1','firmA'), ('i2','firmA')")
    await contact("c1", null as any, { inv: "i1", score: 90, email: "p1@firma.test" })
    await contact("c2", null as any, { inv: "i2", score: 85, email: "p2@firma.test" })
    await contact("c3", null as any, { inv: "x3", score: 80, email: "q1@familyoffice.test" })
    await contact("c4", null as any, { inv: "x4", score: 75, email: "q2@familyoffice.test" })
    await contact("c5", null as any, { inv: "x5", score: 70, email: "me@gmail.com" })
    await contact("c6", null as any, { inv: "x6", score: 65, email: "me2@gmail.com" })
    await contact("c7", null as any, { inv: "x7", score: 99, email: null, li: "bagnolsfamilyoffice.com" }) // not reachable: no email, not a LinkedIn address
    await contact("c8", null as any, { inv: "x8", score: 60, email: "z@z.test", li: "https://twitter.com/z" })
    const r = await addTopLps({ orgId: ORG, userId: U }, 25)
    expect(r.added).toBe(5) // firmA once, familyoffice.test once, two separate Gmail users, z.test once
    const rows = (
      await db.query<any>(
        "SELECT display_name, display_linkedin FROM crm_entries ORDER BY display_score DESC",
      )
    ).rows
    expect(rows.map((x) => x.display_name)).toEqual(["Name c1", "Name c3", "Name c5", "Name c6", "Name c8"])
    expect(rows.find((x) => x.display_name === "Name c8")!.display_linkedin).toBeNull() // a Twitter link is not kept as a LinkedIn address
  })
})

describe("the short fund form", () => {
  it("creates a profile with what was typed, and requires a name to create", async () => {
    await db.exec("DELETE FROM fund_profiles")
    await expect(saveQuickFund({ orgId: ORG, userId: U }, { gpName: "Dana" })).rejects.toBeInstanceOf(
      QuickFundError,
    )
    const r = await saveQuickFund(
      { orgId: ORG, userId: U },
      quickFundSchema.parse({
        name: "Seed Fund",
        gpName: "Dana Reyes",
        targetRaise: 5000000,
        sectors: "AI, Consumer, Fintech, Health",
        geographicFocus: "Europe; North America",
        thesisDescription: "Pre-seed and seed in applied AI products.",
      }),
    )
    expect(r.created).toBe(true)
    expect(
      (
        await db.query<any>(
          "SELECT name, gp_name, target_raise, sectors, primary_sectors, geographic_focus, is_active FROM fund_profiles",
        )
      ).rows[0],
    ).toMatchObject({
      name: "Seed Fund",
      gp_name: "Dana Reyes",
      target_raise: "5000000",
      sectors: ["AI", "Consumer", "Fintech", "Health"],
      primary_sectors: ["AI", "Consumer", "Fintech"],
      geographic_focus: ["Europe", "North America"],
      is_active: true,
    })
  })
  it("fills only what was typed into an existing profile and leaves everything else as it was", async () => {
    await db.exec(
      `UPDATE fund_profiles SET gp_name='Original GP', minimum_commitment=250000, gp_commitment=3, value_proposition='Kept', sectors='["Climate"]', headquarters_location='Zurich'`,
    )
    const r = await saveQuickFund(
      { orgId: ORG, userId: U },
      quickFundSchema.parse({
        targetRaise: 8000000,
        thesisDescription: "Backing climate founders across Europe.",
      }),
    )
    expect(r.created).toBe(false)
    expect(
      (
        await db.query<any>(
          "SELECT gp_name, minimum_commitment, gp_commitment, value_proposition, sectors, headquarters_location, target_raise, thesis_description FROM fund_profiles",
        )
      ).rows[0],
    ).toMatchObject({
      gp_name: "Original GP",
      minimum_commitment: "250000",
      gp_commitment: "3",
      value_proposition: "Kept",
      sectors: ["Climate"],
      headquarters_location: "Zurich",
      target_raise: "8000000",
      thesis_description: "Backing climate founders across Europe.",
    })
  })
  it("rejects a thin thesis, a negative raise and unknown fields, and never touches another workspace", async () => {
    for (const bad of [{ thesisDescription: "AI." }, { targetRaise: -5 }, { name: "x", extra: 1 }])
      expect(quickFundSchema.safeParse(bad).success).toBe(false)
    await db.exec(
      `INSERT INTO fund_profiles (id, org_id, user_id, is_active, name, gp_name) VALUES ('other','org-b','u9',true,'Other','Keep')`,
    )
    await saveQuickFund({ orgId: ORG, userId: U }, quickFundSchema.parse({ gpName: "New GP" }))
    expect((await db.query<any>("SELECT gp_name FROM fund_profiles WHERE id='other'")).rows[0].gp_name).toBe(
      "Keep",
    )
  })
})

describe("LinkedIn for the first wave", () => {
  const entry = async (n: string, over: Record<string, unknown> = {}) => {
    const id = (
      await db.query<{ id: string }>(
        "INSERT INTO crm_entries (org_id, user_id, source, import_key, display_name, display_linkedin, display_score, stage) VALUES ($1,$2,'lp_matching',$3,$4,$5,$6,'queued') RETURNING id",
        [ORG, U, n, `LP ${n}`, over.li ?? `https://www.linkedin.com/in/${n}`, over.score ?? 50],
      )
    ).rows[0].id
    if (over.dm !== null)
      await db.query(
        "INSERT INTO outreach_messages (crm_entry_id, kind, user_id, channel, status, body) VALUES ($1,'dm_intro',$2,'linkedin','draft',$3)",
        [
          id,
          U,
          over.dm ?? "Hi, I run Seed Fund. Your early-stage focus stood out. Open to a 20-minute intro call?",
        ],
      )
    return id
  }
  it("queues each saved message as a connection request with that note, pending approval, best match first", async () => {
    await entry("a", { score: 10 })
    await entry("b", { score: 90 })
    await entry("c", { li: "https://example.com/not-linkedin" })
    await entry("d", { dm: null })
    expect(await linkedinCounts({ orgId: ORG, userId: U })).toEqual({ ready: 2, pending: 0 })
    const calls: any[] = []
    const r = await queueLinkedIn({ orgId: ORG, userId: U }, 25, (async (uid: string, input: any) => {
      calls.push({ uid, input })
      await db.query(
        "INSERT INTO li_action_queue (user_id, crm_entry_id, action_type, status) VALUES ($1,$2,'connect_request','pending_approval')",
        [uid, input.crmEntryId],
      )
      return {}
    }) as any)
    expect(r).toEqual({ queued: 2, skipped: [] })
    expect(calls.map((c) => c.input.targetName)).toEqual(["LP b", "LP a"])
    expect(calls[0].input).toMatchObject({
      actionType: "connect_request",
      senderId: null,
      payload: { message: expect.stringMatching(/Seed Fund/), source: "raise-path" },
    })
    expect(calls[0].input.autoApprove).toBeUndefined()
    expect(await linkedinCounts({ orgId: ORG, userId: U })).toEqual({ ready: 0, pending: 2 }) // a second click queues nothing new
  })
  it("uses the user's own active LinkedIn sender when there is one, and skips a note that is too long or empty", async () => {
    await db.exec(
      `INSERT INTO linkedin_senders (id, user_id, status) VALUES ('sender1','${U}','active'), ('other','u9','active')`,
    )
    await entry("long", { dm: "x".repeat(301) })
    await entry("ok")
    const calls: any[] = []
    const r = await queueLinkedIn({ orgId: ORG, userId: U }, 25, (async (_u: string, input: any) => {
      calls.push(input)
      return {}
    }) as any)
    expect(r.queued).toBe(1)
    expect(r.skipped[0].reason).toMatch(/301 characters/)
    expect(calls[0].senderId).toBe("sender1")
  })
  it("keeps going when one action cannot be queued, and ignores other workspaces and other senders", async () => {
    await entry("a")
    await entry("b")
    await db.exec(
      `INSERT INTO crm_entries (org_id, user_id, source, import_key, display_name, display_linkedin, stage) VALUES ('org-b','${U}','lp_matching','z','Other WS','https://www.linkedin.com/in/z','queued')`,
    )
    let n = 0
    const r = await queueLinkedIn({ orgId: ORG, userId: U }, 25, (async () => {
      if (n++ === 0) throw new Error("db hiccup")
      return {}
    }) as any)
    expect(r.queued).toBe(1)
    expect(r.skipped).toHaveLength(1)
    expect(await linkedinCounts({ orgId: ORG, userId: "someone-else" })).toEqual({ ready: 0, pending: 0 })
  })
})

describe("the card's new actions", () => {
  it("offers the form while the profile is incomplete and the shortlist once matching has results", async () => {
    await db.exec("UPDATE fund_profiles SET gp_name = NULL")
    let s = await raiseState(ORG, U)
    expect(s.next).toMatchObject({ id: "fund", action: "profile" })
    expect(s.fund!.form.name).toBe("Seed Fund")
    await db.exec(
      "UPDATE fund_profiles SET gp_name='Dana', target_raise=5000000, thesis_description='Seed in AI.'",
    )
    expect((await raiseState(ORG, U)).next).toMatchObject({ id: "match", action: null })
    await session("s1")
    await contact("c1", "f1", { email: "a@f.test" })
    s = await raiseState(ORG, U)
    expect(s.next).toMatchObject({ id: "shortlist", action: "shortlist" })
    expect(s.counts.sessionContacts).toBe(1)
    await addTopLps({ orgId: ORG, userId: U })
    expect((await raiseState(ORG, U)).counts.lpContacts).toBe(1)
  })
})
