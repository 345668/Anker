import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
process.env.SECRET_KEY = "halyard-notes-test-secret"
vi.mock("server-only", () => ({}))
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const st = vi.hoisted(() => ({ query: vi.fn(), allowance: null as string | null }))
vi.mock("@/lib/db", () => ({ sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => st.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values), { unsafe: (q: string, v: unknown[]) => st.query(q, v) }) }))
vi.mock("@/lib/entitlements", () => ({ isFlagOn: async () => true, getEffective: async () => ({ features: { halyard: true }, limits: {} }), limitOf: async () => null }))
vi.mock("@/lib/metering/allowance", () => ({ assertCan: async () => { if (st.allowance) throw new Error(st.allowance) } }))
vi.mock("@/lib/ai/data-policy", () => ({ assertProviderAllowed: async () => {} }))
vi.mock("@/lib/ai/provider", () => ({ generateDetailed: async () => ({ text: "", model: null, error: "no model in tests" }) }))
vi.mock("@/lib/calls/analyze", () => ({ analyzeCall: vi.fn() }))
vi.mock("@/lib/actions/store", () => ({ propose: vi.fn() }))

import { createSession, addSegment, endSession, type SessionRow } from "./sessions"
import { draftNotes, draftEmailFromNotes, saveNotes, latestNotes, compileTranscript } from "./notes"
import { finishSession, TRUNCATION_MARKER } from "./finish"
import { exportMarkdown } from "./export"
import { foldIfDue, type ModelCall } from "./brain"
import { refreshLiveNotes, LIVE_MIN_NEW_TURNS } from "./notes"
import { shareSession, unshareSession, viewableSession, listMembers, sharedWithMe } from "./sharing"
import { proposeFollowupDraft } from "./finish"
import { markdownToPdf } from "./pdf"
import { CAPABILITIES } from "@/lib/actions/capabilities"

let db: PGlite
const one = async (q: string, v: unknown[] = []) => (await db.query<any>(q, v)).rows[0]
const ORG = "org-1", USER = "user-1"
const scope = { userId: USER, orgId: ORG, persona: "founder" as const, writable: true, workspace: "Demo" }
const GOOD = "Meeting Summary:\nThey closed the seed round.\nKey Points:\n- Five LOIs worth $2.5m\nDecisions:\n- Proceed to diligence\nAction Items:\n- Send the data room\nFollow-Up:\n- Pricing for year two?"
const model = (log: any[] = []) => async (q: any) => { log.push(q); return /consecutive parts/.test(q.text) ? "Whole call summary." : /Write the email/.test(q.text) ? "Hi there,\nThanks for the call.\n[Your name]" : GOOD }
const start = (over: Record<string, unknown> = {}) => createSession({ orgId: ORG, userId: USER, consentAttested: true, mode: "founder-investor-call", ...over } as any)
async function fill(s: SessionRow, n: number, size = 60) {
  for (let i = 0; i < n; i++) await addSegment(s, { seq: i, channel: i % 2 ? "you" : "them", startedMs: i * 15000, endedMs: i * 15000 + 9000, text: i === 3 ? "We signed a term sheet for €1.2 million at a 3x multiple." : `Turn ${i}: ` + Array.from({ length: Math.ceil(size / 7) }, (_, k) => `w${(i * 131 + k * 17) % 997}x${k}`).join(" ") + `, number ${i * 7}.` })
}

beforeAll(async () => {
  db = new PGlite()
  st.query.mockImplementation(async (q, values) => (await db.query(q, values as any[])).rows)
  await db.exec(`CREATE TABLE platform_flags(key text PRIMARY KEY, enabled boolean, rollout_pct int, description text);
    CREATE TABLE plan_catalog(plan text PRIMARY KEY, features jsonb DEFAULT '{}', limits jsonb DEFAULT '{}');
    CREATE TABLE crm_entries(id text PRIMARY KEY, org_id text, display_name text, display_email text);
    CREATE TABLE memberships(user_id text, org_id text, org_role text, UNIQUE(user_id, org_id));
    CREATE TABLE profiles(id text PRIMARY KEY, email text, full_name text);
    CREATE TABLE outreach_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text, crm_entry_id text, call_id text, kind text, step_number int, channel text, body text, status text, subject text, email_to text, tracking_id text, created_at timestamptz, updated_at timestamptz);
    CREATE UNIQUE INDEX ON outreach_messages(call_id) WHERE call_id IS NOT NULL;
    CREATE TABLE investor_calls(id text PRIMARY KEY DEFAULT gen_random_uuid()::text, user_id text, org_id text, persona text, title text, investor_name text, transcript text, crm_entry_id text, occurred_at timestamptz,
      external_id text, content_hash text, source text, status text, summary text, sentiment text, interest_level text, objections jsonb, next_steps jsonb, key_questions jsonb, draft_followup text, recommended_stage text,
      generated_by text, outreach_message_id text, analyzed_at timestamptz, analysis_error text, deleted_at timestamptz, updated_at timestamptz DEFAULT now());
    CREATE UNIQUE INDEX ON investor_calls(user_id, org_id, external_id) WHERE external_id IS NOT NULL;`)
  await db.exec(readFileSync("scripts/migrations/2026-10-27-halyard-sessions.sql", "utf8"))
  await db.exec(readFileSync("scripts/migrations/2026-10-28-halyard-governance.sql", "utf8")); await db.exec(readFileSync("scripts/migrations/2026-10-30-halyard-playbooks.sql", "utf8"))
})
afterAll(async () => db.close())
beforeEach(async () => { st.allowance = null; await db.exec("DELETE FROM halyard_sessions; DELETE FROM investor_calls; DELETE FROM crm_entries; DELETE FROM halyard_prep; DELETE FROM outreach_messages; DELETE FROM memberships; DELETE FROM profiles") })

describe("notes", () => {
  it("are drafted from the transcript with the figures put in by code, saved as an AI version, and stored encrypted", async () => {
    const s = await start(); await fill(s, 12)
    const log: any[] = []; const r = await draftNotes(s, model(log))
    expect(r.saved).toBe(true); const n = (r as any).notes
    expect(n.by).toBe("ai"); expect(n.body.summary).toBe("They closed the seed round."); expect(n.body.actionItems).toEqual(["Send the data room"]); expect(n.body.decisions).toEqual(["Proceed to diligence"])
    expect(n.body.figures.map((f: any) => f.value).join(" ")).toMatch(/1\.2 million/); expect(n.body.figures.find((f: any) => /1\.2/.test(f.value))).toMatchObject({ who: "You" })
    expect(log[0].text).toContain("[00:45] You: We signed a term sheet"); expect(log[0].system).toContain("Call type: Investor call"); expect(log[0].system).toContain("pay particular attention")
    expect((await one("SELECT body_enc FROM halyard_notes WHERE session_id=$1", [s.id])).body_enc).not.toContain("seed round")
  })
  it("a person's edit is never overwritten: the next draft comes back beside it and is not saved", async () => {
    const s = await start(); await fill(s, 12)
    await draftNotes(s, model()); const mine = await saveNotes(s, { summary: "My own summary.", keyPoints: ["Mine"], decisions: [], actionItems: [], followUp: [], figures: [], email: "" }, "user")
    expect(mine.version).toBe(2)
    const r = await draftNotes(s, model()); expect(r.saved).toBe(false); expect((r as any).current.body.summary).toBe("My own summary."); expect((r as any).draft.summary).toBe("They closed the seed round.")
    expect((await latestNotes(s.id))!.version).toBe(2)
  })
  it("the follow-up email is written from the notes only, saved with them, and needs notes first", async () => {
    const s = await start(); await fill(s, 12)
    await expect(draftEmailFromNotes(s, model())).rejects.toMatchObject({ code: "no_notes" })
    await draftNotes(s, model()); const log: any[] = []; const n = await draftEmailFromNotes(s, model(log))
    expect(n.body.email).toContain("Thanks for the call"); expect(n.body.summary).toBe("They closed the seed round."); expect(log[0].text).not.toContain("Turn 5")
    expect((await latestNotes(s.id))!.body.email).toContain("Thanks")
  })
  it("a 90-minute call (over 50,000 characters) is drafted in parts and merged, within the allowance check", async () => {
    const s = await start(); await fill(s, 360, 240)
    const t = await compileTranscript(s.id); expect(t.length).toBeGreaterThan(90000)
    const log: any[] = []; const r = await draftNotes(s, model(log)); expect((r as any).notes.body.summary).toBe("Whole call summary.")
    expect(log.length).toBeGreaterThanOrEqual(3); expect(log.some((q) => /part 1 of/.test(q.text))).toBe(true)
    st.allowance = "Allowance used."; await expect(draftNotes(s, model())).rejects.toMatchObject({ code: "allowance" })
  }, 60000)
  it("refuses when there is no transcript, and says plainly when the model fails", async () => {
    const s = await start(); await expect(draftNotes(s, model())).rejects.toMatchObject({ code: "no_transcript" })
    await fill(s, 8); await expect(draftNotes(s, async () => { const { NoteGenerationError } = await import("./core"); throw new NoteGenerationError("The provider returned no notes.") })).rejects.toMatchObject({ code: "draft", status: 422 })
  })
})

describe("end of call", () => {
  const analysis = { summary: "Strong call.", sentiment: "positive", interestLevel: "high", objections: [], nextSteps: ["Send the data room", "Book diligence"], keyQuestions: [], draftFollowup: "Hi", recommendedStage: "meeting", generatedBy: "test:call" }
  it("makes the call record, drafts notes, analyses, and PROPOSES (never writes) the stage move and tasks for the linked contact", async () => {
    await db.query("INSERT INTO crm_entries (id, org_id) VALUES ('c1', $1)", [ORG])
    const s = await start({ crmEntryId: "c1", title: "Call with Dana" }); await fill(s, 12)
    const proposals: any[] = []; const analyze = vi.fn(async () => analysis as any)
    const r = await finishSession({ ...s, crm_entry_id: "c1" }, scope, { notesModel: model(), analyze, proposeAction: (async (_sc: any, cap: string, input: any, ctx: any) => { proposals.push({ cap, input, ctx }); return {} }) as any })
    expect(r).toMatchObject({ notes: true, analysis: true, proposals: 4, truncatedInCall: false, warnings: [] })
    const call = await one("SELECT * FROM investor_calls WHERE id=$1", [r.callId]); expect(call).toMatchObject({ source: "halyard-web", title: "Call with Dana", status: "needs_review", summary: "Strong call.", crm_entry_id: "c1", external_id: s.id })
    expect((await one("SELECT call_id, state, delete_after FROM halyard_sessions WHERE id=$1", [s.id]))).toMatchObject({ call_id: r.callId, state: "ended" })
    expect(proposals.map((p) => p.cap)).toEqual(["crm_update_stage", "call_save_followup", "crm_add_task", "crm_add_task"]); expect(proposals[1].input).toEqual({ callId: r.callId, draft: "Hi" }); expect(proposals[0].input).toEqual({ entryId: "c1", stage: "meeting" }); expect(proposals.every((p) => p.ctx.trust === "untrusted" && p.ctx.runId === `halyard:${s.id}`)).toBe(true)
  })
  it("a call over the 60,000-character cap keeps its full text in the session, a marker in the call row, and analyses a condensed version", async () => {
    const s = await start(); await fill(s, 360, 240)
    const brief: ModelCall = async () => ({ text: "- Brief line about the seed.\n- 1.2 million term sheet.", model: "m", error: null }); await foldIfDue(s, brief)
    const analyze = vi.fn(async () => analysis as any), r = await finishSession(s, scope, { notesModel: model(), analyze })
    expect(r.truncatedInCall).toBe(true); const call = await one("SELECT transcript FROM investor_calls WHERE id=$1", [r.callId])
    expect(call.transcript.length).toBeLessThanOrEqual(60000); expect(call.transcript.endsWith(TRUNCATION_MARKER)).toBe(true)
    expect((await compileTranscript(s.id)).length).toBeGreaterThan(90000)
    const sent = (analyze.mock.calls[0] as any[])[0] as string; expect(sent.length).toBeLessThanOrEqual(60000); expect(sent).toContain("longer than the analysis limit"); expect(sent).toContain("Running brief:")
  }, 60000)
  it("a failure after the end is a warning, not an undone call; ending twice makes one call; too little text makes none", async () => {
    const s = await start(); await fill(s, 10)
    const r1 = await finishSession(s, scope, { notesModel: async () => { throw new Error("down") }, analyze: async () => { throw new Error("no provider") } })
    expect(r1.session.state).toBe("ended"); expect(r1.callId).toBeTruthy(); expect(r1.notes).toBe(false); expect(r1.analysis).toBe(false); expect(r1.warnings.join(" ")).toMatch(/Notes could not be drafted/); expect(r1.warnings.join(" ")).toMatch(/could not be analysed/)
    expect((await one("SELECT status FROM investor_calls WHERE id=$1", [r1.callId])).status).toBe("analysis_failed")
    const r2 = await finishSession({ ...s, call_id: r1.callId }, scope, { notesModel: model(), analyze: async () => analysis as any }); expect(r2.callId).toBe(r1.callId)
    expect((await one("SELECT count(*)::int n FROM investor_calls")).n).toBe(1)
    const empty = await start({ userId: "u2" }); const r3 = await finishSession(empty, { ...scope, userId: "u2" }, { notesModel: model() }); expect(r3.callId).toBeNull(); expect(r3.warnings[0]).toMatch(/too little/)
  })
  it("an LP workspace gets a call record but no stage or task proposals", async () => {
    const s = await start({ crmEntryId: "c9" }); await fill(s, 10); const made: string[] = []
    await finishSession({ ...s, crm_entry_id: "c9" }, { ...scope, persona: "lp" }, { notesModel: model(), analyze: async () => analysis as any, proposeAction: (async (_s: any, c: string) => { made.push(c); return {} }) as any })
    expect(made).toEqual([])
  })
})

describe("export", () => {
  it("is one document: summary, lists, figures with their sentences, the draft email, the transcript with times and speakers, and the suggestions on request", async () => {
    const s = await start({ title: "Call with Dana" }); await fill(s, 12); await draftNotes(s, model()); await draftEmailFromNotes(s, model())
    await db.query("INSERT INTO halyard_suggestions (session_id, action, text_enc) VALUES ($1, 'say', $2)", [s.id, (await import("@/lib/db/secrets")).encryptSecret("Ask about the timeline.")])
    const md = await exportMarkdown(await endSession(s)), withS = await exportMarkdown(s, { suggestions: true })
    for (const x of ["# Call with Dana", "## Summary", "They closed the seed round.", "## Action items", "- Send the data room", "## Figures", "1.2 million", "## Follow-up email (draft)", "> Hi there,", "[00:45] **You:** We signed a term sheet", "[00:30] **Them:**"]) expect(md, x).toContain(x)
    expect(md).not.toContain("Suggestions shown"); expect(withS).toContain("Ask about the timeline.")
  })
})

describe("live notes", () => {
  const T0 = Date.parse("2026-10-27T12:00:00Z")
  it("update only when enough is new and a minute has passed, merge lists in code, keep the figures, and stop for good once the person edits", async () => {
    const s = await start(); await fill(s, LIVE_MIN_NEW_TURNS - 1)
    expect(await refreshLiveNotes(s, model(), T0)).toEqual({ updated: false, reason: "too_few" })
    await fill(s, 12)                                           // seq 0..11 (those already stored are skipped)
    const log: any[] = []; const a = await refreshLiveNotes(s, model(log), Date.now()); expect(a.updated).toBe(true)
    expect((a as any).notes.by).toBe("ai"); expect((a as any).notes.body.uptoSeq).toBe(11); expect((a as any).notes.body.keyPoints).toEqual(["Five LOIs worth $2.5m"]); expect((a as any).notes.body.figures.length).toBeGreaterThan(0)
    expect(await refreshLiveNotes(s, model(), Date.now())).toEqual({ updated: false, reason: "too_soon" })
    for (let i = 12; i < 24; i++) await addSegment(s, { seq: i, channel: "them", startedMs: i * 15000, text: `Later turn ${i} ` + Array.from({ length: 12 }, (_, k) => `z${i * 31 + k}`).join(" ") })
    const log2: any[] = []; const b = await refreshLiveNotes(s, async (q) => { log2.push(q); return "Meeting Summary:\nLater stretch.\nKey Points:\n- Five LOIs worth $2.5m\n- A new point\nAction Items:\n- Book diligence" }, Date.now() + 120000)
    expect(b.updated).toBe(true); const nb = (b as any).notes.body
    expect(nb.keyPoints).toEqual(["Five LOIs worth $2.5m", "A new point"]); expect(nb.actionItems).toEqual(["Send the data room", "Book diligence"]); expect(nb.summary).toBe("Later stretch."); expect(nb.decisions).toEqual(["Proceed to diligence"])
    expect(log2[0].text).toContain("Later turn 12"); expect(log2[0].text).not.toContain("Turn 5:")   // only what is new went to the model
    await saveNotes(s, { summary: "Mine", keyPoints: [], decisions: [], actionItems: [], followUp: [], figures: [], email: "" }, "user")
    expect(await refreshLiveNotes(s, model(), Date.now() + 999999)).toEqual({ updated: false, reason: "edited" }); expect((await latestNotes(s.id))!.body.summary).toBe("Mine")
  })
  it("do nothing outside a live session and respect the allowance", async () => {
    const s = await start(); await fill(s, 12)
    expect(await refreshLiveNotes({ ...s, state: "ended" }, model())).toEqual({ updated: false, reason: "not_live" })
    st.allowance = "Allowance used."; await expect(refreshLiveNotes(s, model(), Date.now())).rejects.toMatchObject({ code: "allowance" })
  })
})

describe("saving the follow-up email as a draft", () => {
  const seedCall = async () => {
    await db.query("INSERT INTO crm_entries (id, org_id, display_name, display_email) VALUES ('c1', $1, 'Dana', 'dana@example.com')", [ORG])
    const s = await start({ crmEntryId: "c1", title: "Call with Dana" }); await fill(s, 12)
    const r = await finishSession({ ...s, crm_entry_id: "c1" }, scope, { notesModel: model(), analyze: async () => ({ summary: "S", sentiment: "positive", interestLevel: "high", objections: [], nextSteps: [], keyQuestions: [], draftFollowup: "", recommendedStage: "none", generatedBy: "t" }) as any, proposeAction: (async () => ({})) as any })
    await draftEmailFromNotes(r.session, model()); return { s: r.session, callId: r.callId! }
  }
  it("is a proposal: nothing is written until a person approves; approving saves a draft (never sends); undo removes it only if unedited", async () => {
    const { s, callId } = await seedCall(); const made: any[] = []
    const out = await proposeFollowupDraft(s, scope, (async (_sc: any, cap: string, input: any, ctx: any) => { made.push({ cap, input, ctx }); return { proposal: { id: "p1" }, existing: false } }) as any)
    expect(out).toEqual({ proposalId: "p1", alreadyPending: false }); expect(made[0]).toMatchObject({ cap: "call_save_followup", input: { callId, draft: expect.stringContaining("Thanks for the call") }, ctx: { trust: "untrusted" } })
    expect((await one("SELECT count(*)::int n FROM outreach_messages")).n).toBe(0)
    const cap = CAPABILITIES.call_save_followup; expect(cap.risk).toBe("R1")
    const plan = await cap.plan({ orgId: ORG, userId: USER }, made[0].input); expect(plan.summary).toContain("Dana"); expect(plan.diff[0].after).toContain("Thanks for the call")
    const applied = await cap.apply({ orgId: ORG, userId: USER }, made[0].input); expect(applied.message).toMatch(/Nothing was sent/)
    expect(await one("SELECT kind, status, email_to, subject FROM outreach_messages")).toMatchObject({ kind: "follow_up", status: "draft", email_to: "dana@example.com" })
    expect((await one("SELECT outreach_message_id FROM investor_calls WHERE id=$1", [callId])).outreach_message_id).toBeTruthy()
    await expect(cap.plan({ orgId: ORG, userId: USER }, made[0].input)).rejects.toThrow(/already has a follow-up/)
    await db.query("UPDATE outreach_messages SET body = body || ' edited'"); await expect(cap.undo({ orgId: ORG, userId: USER }, made[0].input, applied.undo)).rejects.toThrow(/edited or sent/)
    await db.query("UPDATE outreach_messages SET body = $1", [made[0].input.draft]); await cap.undo({ orgId: ORG, userId: USER }, made[0].input, applied.undo)
    expect((await one("SELECT count(*)::int n FROM outreach_messages")).n).toBe(0); expect((await one("SELECT outreach_message_id FROM investor_calls WHERE id=$1", [callId])).outreach_message_id).toBeNull()
  })
  it("refuses without a call, a contact or an email, and for LP workspaces", async () => {
    const s = await start(); await fill(s, 10)
    await expect(proposeFollowupDraft(s, scope, (async () => ({})) as any)).rejects.toMatchObject({ code: "no_call" })
    await expect(proposeFollowupDraft({ ...s, call_id: "x" }, scope, (async () => ({})) as any)).rejects.toMatchObject({ code: "no_contact" })
    await expect(proposeFollowupDraft({ ...s, call_id: "x", crm_entry_id: "c" }, scope, (async () => ({})) as any)).rejects.toMatchObject({ code: "no_email" })
    await expect(proposeFollowupDraft({ ...s, call_id: "x", crm_entry_id: "c" }, { ...scope, persona: "lp" }, (async () => ({})) as any)).rejects.toMatchObject({ code: "role" })
  })
})

describe("sharing a finished call", () => {
  const people = async () => { for (const [id, n] of [["user-1", "Owner"], ["mate", "Teammate"], ["outsider", "Outsider"]]) await db.query("INSERT INTO profiles (id, email, full_name) VALUES ($1, $2, $3)", [id, `${id}@x.test`, n]); await db.query("INSERT INTO memberships (user_id, org_id, org_role) VALUES ('user-1', $1, 'workspace_owner'), ('mate', $1, 'member'), ('outsider', 'other-org', 'member')", [ORG]) }
  it("only a member of the workspace, read-only, withdrawable, and gone when the person leaves", async () => {
    await people(); const s = await start(); await fill(s, 10)
    await shareSession(s, "mate")                       // a live call can be shared too: the colleague follows along
    expect((await viewableSession(s.id, ORG, "mate")).role).toBe("viewer"); await unshareSession(s, "mate")
    const ended = await endSession(s)
    await expect(shareSession(ended, "outsider")).rejects.toMatchObject({ code: "not_member" }); await expect(shareSession(ended, USER)).rejects.toMatchObject({ code: "bad_target" })
    expect((await listMembers(ORG, USER)).map((m) => m.userId)).toEqual(["mate"])
    await expect(viewableSession(s.id, ORG, "mate")).rejects.toMatchObject({ status: 404 })
    await shareSession(ended, "mate")
    expect(await viewableSession(s.id, ORG, "mate")).toMatchObject({ role: "viewer", ownerName: "Owner" }); expect((await viewableSession(s.id, ORG, USER)).role).toBe("owner")
    await expect(viewableSession(s.id, "other-org", "mate")).rejects.toMatchObject({ status: 404 }); await expect(viewableSession(s.id, ORG, "outsider")).rejects.toMatchObject({ status: 404 })
    expect((await sharedWithMe(ORG, "mate")).map((x) => x.session.id)).toEqual([s.id])
    await db.query("DELETE FROM memberships WHERE user_id = 'mate'"); await expect(viewableSession(s.id, ORG, "mate")).rejects.toMatchObject({ status: 404 })
    await db.query("INSERT INTO memberships (user_id, org_id, org_role) VALUES ('mate', $1, 'member')", [ORG]); await expect(viewableSession(s.id, ORG, "mate")).resolves.toBeTruthy()
    await unshareSession(ended, "mate"); await expect(viewableSession(s.id, ORG, "mate")).rejects.toMatchObject({ status: 404 }); expect(await sharedWithMe(ORG, "mate")).toEqual([])
    await shareSession(ended, "mate"); await expect(viewableSession(s.id, ORG, "mate")).resolves.toBeTruthy()   // sharing again restores it
  })
  it("a call that is deleted takes its shares with it", async () => {
    await people(); const s = await endSession(await start()); await shareSession(s, "mate"); await db.query("DELETE FROM halyard_sessions WHERE id=$1", [s.id])
    expect((await one("SELECT count(*)::int n FROM halyard_viewers")).n).toBe(0)
  })
})
