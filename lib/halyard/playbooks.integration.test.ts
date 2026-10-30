import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
process.env.SECRET_KEY = "halyard-playbook-test-secret"
vi.mock("server-only", () => ({}))
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const st = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => st.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values), { unsafe: (q: string, v: unknown[]) => st.query(q, v) }) }))
vi.mock("@/lib/entitlements", () => ({ isFlagOn: async () => true, getEffective: async () => ({ features: { halyard: true }, limits: {} }), limitOf: async () => null }))
vi.mock("@/lib/metering/allowance", () => ({ assertCan: async () => {} }))
vi.mock("@/lib/ai/data-policy", () => ({ assertProviderAllowed: async () => {} }))
vi.mock("@/lib/ai/provider", () => ({ generateDetailed: async () => ({ text: "", model: null, error: "none" }) }))

import { createPlaybook, updatePlaybook, deletePlaybook, listPlaybooks, previewPlaybook, shippedText, playbookSkill, MAX_PERSONAL, MAX_WORKSPACE, MAX_FILE_CHARS } from "./playbooks"
import { createSession, addSegment } from "./sessions"
import { act } from "./brain"
import { notesContext, emailContext } from "./notes"
import { exportPersonalData } from "./personal-export"
import { parseSkillMarkdown, skillFromText } from "./core"

let db: PGlite
const ORG = "org-1", ME = { orgId: ORG, userId: "me", role: "member" }, ADMIN = { orgId: ORG, userId: "boss", role: "admin" }, VIEWER = { orgId: ORG, userId: "v", role: "viewer" }
const file = (name = "renewals", extra = "", mode = "Renewal call") => `---
name: ${name}
description: Helps on renewal calls. Use when renewing an existing customer.
halyard:
  base: call
  mode: "${mode}"
  notesFocus: "Usage, risks to the renewal, price changes, who signs."
  ${extra}
---

# Renewals

You are the account manager. "Them" is the customer.

## Action: say

Lead with the value they got. RENEWAL-SAY-MARKER.

## Action: notes

Capture the renewal date, price and blockers. RENEWAL-NOTES-MARKER.

## Action: email

Confirm the renewal terms in three lines. RENEWAL-EMAIL-MARKER.
`
const model = (log: string[]) => async (p: string) => { log.push(p); return { text: "Say it.", model: "m", error: null } }
const one = async (q: string, v: unknown[] = []) => (await db.query<any>(q, v)).rows[0]

beforeAll(async () => {
  db = new PGlite(); st.query.mockImplementation(async (q, values) => (await db.query(q, values as any[])).rows)
  await db.exec(`CREATE TABLE platform_flags(key text PRIMARY KEY, enabled boolean, rollout_pct int, description text); CREATE TABLE plan_catalog(plan text PRIMARY KEY, features jsonb DEFAULT '{}', limits jsonb DEFAULT '{}');`)
  for (const f of ["2026-10-27-halyard-sessions", "2026-10-28-halyard-governance", "2026-10-30-halyard-playbooks"]) await db.exec(readFileSync(`scripts/migrations/${f}.sql`, "utf8"))
})
afterAll(async () => db.close())
beforeEach(async () => { await db.exec("DELETE FROM halyard_playbooks; DELETE FROM halyard_sessions; DELETE FROM halyard_prep") })

describe("what is accepted", () => {
  it("a valid playbook is understood: its label, its sections, whether it guides notes and email", () => {
    expect(previewPlaybook(file())).toMatchObject({ ok: true, errors: [], slug: "renewals", label: "Renewal call", sections: ["say", "notes", "email"], hasNotesGuide: true, hasEmailGuide: true })
  })
  it("the validator's own words come back, and the playbook-specific rules are added", () => {
    const bad = (t: string) => previewPlaybook(t).errors.join(" | ")
    expect(bad("")).toMatch(/empty/); expect(bad("x".repeat(MAX_FILE_CHARS + 1))).toMatch(/longer than 24,000/); expect(bad("no frontmatter at all")).toMatch(/frontmatter/)
    expect(bad(file("Bad Name"))).toMatch(/lowercase letters, numbers and hyphens/); expect(bad(file("my-claude-mode"))).toMatch(/claude/)
    expect(bad(file("x".repeat(41)))).toMatch(/at most 40/); expect(bad(file("sales-call"))).toMatch(/already a built-in mode/); expect(bad(file("founder-investor-call"))).toMatch(/already a built-in mode/)
    expect(bad(file("ok-name", "base: interview"))).toMatch(/desktop-only/); expect(bad(file("ok-name", "replaces: sales-call"))).toMatch(/built-in modes/)
    expect(bad(file().replace("## Action: say", "## Action: dance"))).toMatch(/dance|unknown/i)
  })
  it("the built-in text can be copied to start from, and only a built-in id is ever read", () => {
    expect(shippedText("sales-call")).toContain("name: sales-call"); expect(shippedText("../../etc/passwd")).toBeNull(); expect(shippedText("interview-coaching")).toBeNull(); expect(previewPlaybook((shippedText("sales-call") ?? "").replace("name: sales-call", "name: my-sales")).ok).toBe(true)
  })
})

describe("who can write and see what", () => {
  it("a member writes personal ones only; an admin writes for the workspace; a viewer writes nothing; names are unique across the workspace", async () => {
    await expect(createPlaybook(ME, { scope: "workspace", text: file("a-one") })).rejects.toMatchObject({ code: "role" }); await expect(createPlaybook(VIEWER, { scope: "personal", text: file("a-two") })).rejects.toMatchObject({ code: "role" })
    const mine = await createPlaybook(ME, { scope: "personal", text: file("mine") }); expect(mine).toMatchObject({ scope: "personal", slug: "mine", mode: "pb-mine", label: "Renewal call" })
    const shared = await createPlaybook(ADMIN, { scope: "workspace", text: file("team", "", "Team call") }); expect(shared.scope).toBe("workspace")
    await expect(createPlaybook(ADMIN, { scope: "workspace", text: file("mine") })).rejects.toMatchObject({ code: "taken", status: 409 })
    await expect(createPlaybook(ME, { scope: "personal", text: "not valid" })).rejects.toMatchObject({ code: "invalid_playbook", status: 400 })
    expect((await listPlaybooks(ORG, "me")).map((p) => p.slug).sort()).toEqual(["mine", "team"]); expect((await listPlaybooks(ORG, "other")).map((p) => p.slug)).toEqual(["team"]); expect(await listPlaybooks("other-org", "me")).toEqual([])
  })
  it("only the author edits a personal one, only an owner or admin a workspace one; the name is locked; delete follows the same rules", async () => {
    const mine = await createPlaybook(ME, { scope: "personal", text: file("mine") }), team = await createPlaybook(ADMIN, { scope: "workspace", text: file("team") })
    await expect(updatePlaybook({ ...ME, userId: "other" }, mine.id, file("mine"))).rejects.toMatchObject({ status: 404 })      // someone else's personal one does not even exist for them
    await expect(updatePlaybook(ME, team.id, file("team"))).rejects.toMatchObject({ code: "role" }); await expect(deletePlaybook(ME, team.id)).rejects.toMatchObject({ code: "role" })
    await expect(updatePlaybook(ME, mine.id, file("renamed"))).rejects.toMatchObject({ code: "name_locked" })
    const upd = await updatePlaybook(ME, mine.id, file("mine", "", "Renewal v2")); expect(upd.label).toBe("Renewal v2"); expect(upd.updatedBy).toBe("me")
    await updatePlaybook(ADMIN, team.id, file("team", "", "Team v2")); await deletePlaybook(ADMIN, team.id); await deletePlaybook(ME, mine.id); expect(await listPlaybooks(ORG, "me")).toEqual([])
  })
  it("the limits hold: 10 personal, 20 for the workspace", async () => {
    for (let i = 0; i < MAX_PERSONAL; i++) await createPlaybook(ME, { scope: "personal", text: file(`p-${i}`) })
    await expect(createPlaybook(ME, { scope: "personal", text: file("p-over") })).rejects.toMatchObject({ code: "limit" }); await createPlaybook({ ...ME, userId: "u2" }, { scope: "personal", text: file("u2-one") })   // another person has their own allowance
    for (let i = 0; i < MAX_WORKSPACE; i++) await createPlaybook(ADMIN, { scope: "workspace", text: file(`w-${i}`) })
    await expect(createPlaybook(ADMIN, { scope: "workspace", text: file("w-over") })).rejects.toMatchObject({ code: "limit" })
  })
  it("the text is stored encrypted", async () => { await createPlaybook(ME, { scope: "personal", text: file("mine") }); expect((await one("SELECT markdown_enc FROM halyard_playbooks")).markdown_enc).not.toContain("RENEWAL-SAY-MARKER") })
})

describe("using a playbook in a call", () => {
  it("a session in a playbook's mode puts its section and the call-type notes and email guidance into the prompts, with the guard still after it", async () => {
    await createPlaybook(ME, { scope: "personal", text: file("renewals") })
    const s = await createSession({ orgId: ORG, userId: "me", consentAttested: true, mode: "pb-renewals" } as any); expect(s.mode).toBe("pb-renewals")
    await addSegment(s, { seq: 0, channel: "them", text: "We are thinking about whether to renew for another year", startedMs: 0 })
    const log: string[] = []; await act(s, "say", {}, model(log))
    expect(log[0]).toContain("RENEWAL-SAY-MARKER"); expect(log[0].indexOf("RENEWAL-SAY-MARKER")).toBeLessThan(log[0].indexOf("EVIDENCE of what was said")); expect(log[0]).toContain("You have no tools")
    const n = await notesContext(s), e = await emailContext(s)
    expect(n).toContain("Call type: Renewal call."); expect(n).toContain("Usage, risks to the renewal"); expect(n).toContain("RENEWAL-NOTES-MARKER"); expect(e).toContain("RENEWAL-EMAIL-MARKER")
  })
  it("a playbook that is not the person's to use, does not exist, or was deleted gives the general mode, never an error mid-call", async () => {
    const mine = await createPlaybook(ME, { scope: "personal", text: file("renewals") })
    expect((await createSession({ orgId: ORG, userId: "intruder", consentAttested: true, mode: "pb-renewals" } as any)).mode).toBe("general")      // a personal playbook is invisible to others
    expect((await createSession({ orgId: ORG, userId: "u3", consentAttested: true, mode: "pb-nope" } as any)).mode).toBe("general")
    expect((await createSession({ orgId: ORG, userId: "u4", consentAttested: true, mode: "sales-call" } as any)).mode).toBe("sales-call")
    const s = await createSession({ orgId: ORG, userId: "me", consentAttested: true, mode: "pb-renewals" } as any); await addSegment(s, { seq: 0, channel: "them", text: "Shall we talk about the contract terms today", startedMs: 0 })
    await deletePlaybook(ME, mine.id); const log: string[] = []; await act(s, "say", {}, model(log)); expect(log[0]).not.toContain("RENEWAL-SAY-MARKER"); expect(log[0]).toContain("EVIDENCE of what was said")
    expect(await playbookSkill(ORG, "me", "pb-renewals")).toBeNull(); expect(await playbookSkill(ORG, "me", "sales-call")).toBeNull()
  })
  it("a workspace playbook is usable by every member", async () => {
    await createPlaybook(ADMIN, { scope: "workspace", text: file("team", "", "Team call") })
    expect((await createSession({ orgId: ORG, userId: "anyone", consentAttested: true, mode: "pb-team" } as any)).mode).toBe("pb-team"); expect(await playbookSkill("other-org", "anyone", "pb-team")).toBeNull()
  })
})

describe("the person's export", () => { it("includes their own playbooks with their text, and not other people's", async () => {
  await createPlaybook(ME, { scope: "personal", text: file("mine") }); await createPlaybook({ ...ME, userId: "other" }, { scope: "personal", text: file("theirs") })
  const x = await exportPersonalData(ORG, "me"); expect(x.playbooks.map((p) => p.name)).toEqual(["mine"]); expect(x.playbooks[0].text).toContain("RENEWAL-SAY-MARKER")
}) })

describe("parse and the shared skill builder agree", () => { it("skillFromText gives the same record the file loader does for a shipped skill", () => {
  const text = shippedText("sales-call")!; const rec = skillFromText(text, "app", "x") as any; expect(rec.id).toBe("sales-call"); expect(rec.sections.length).toBeGreaterThan(3); expect(parseSkillMarkdown(text).errors).toEqual([])
}) })
