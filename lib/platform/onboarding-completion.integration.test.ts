import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest"
import { NextRequest } from "next/server"
const state = vi.hoisted(() => ({ user: "alice", active: "existing", failCookie: false, query: vi.fn(), put: vi.fn(), createDocument: vi.fn(), extract: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: (strings: TemplateStringsArray, ...values: unknown[]) => state.query(strings.reduce((q,s,i) => q + (i ? `$${i}` : "") + s, ""), values) }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user ? { id: state.user, email: `${state.user}@test.invalid` } : null } }) } }) }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: state.active }), set: (_key: string, value: string) => { if (state.failCookie) throw Error("cookie failure"); state.active = value } }) }))
vi.mock("@vercel/blob", () => ({ put: state.put }))
vi.mock("@/lib/portfolio/data-room", () => ({ createDocument: state.createDocument }))
vi.mock("@/lib/matching/v2/document-extractor", () => ({ extractStartupProfile: state.extract }))
import { POST as uploadDeck } from "@/app/api/dataroom/founder/upload/route"
import { POST as extractDeck } from "@/app/api/onboarding/extract/route"
import { GET, POST } from "@/app/api/onboarding/route"
import { createUserWorkspace, parseWorkspaceInput, getUserWorkspace, updateUserWorkspace } from "@/lib/org/workspaces"
import { onboardingCompanyId } from "@/lib/org/provision"
let db: PGlite
const migration = (name: string) => readFileSync(`scripts/migrations/${name}`, "utf8")
const req = (body?: unknown, persona = "founder") => new NextRequest(`https://test.invalid/api/onboarding?persona=${persona}`, body ? { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {})
const draft = (revision = 0, completed = false, extra = {}) => ({ account_type: "founder", step: completed ? 3 : 1, revision, completed, data: { name: "Ada", company: "Northstar", website: "northstar.test", sectors: ["Climate"], stage: "seed", oneliner: "Efficient energy", geography: "Berlin", target: "EUR 2m", ...extra } })
beforeAll(async () => {
  db = new PGlite()
  const funds = migration("2026-06-21-funds-and-lps.sql")
  await db.exec(funds.slice(funds.indexOf("CREATE TABLE IF NOT EXISTS funds"), funds.indexOf("CREATE TABLE IF NOT EXISTS fund_lps")))
  const orgs = migration("2026-08-08-personas-owner.sql")
  await db.exec(orgs.slice(orgs.indexOf("CREATE TABLE IF NOT EXISTS organizations")))
  const drafts = migration("2026-09-09-audit-repairs.sql")
  await db.exec(drafts.slice(0, drafts.indexOf("CREATE TABLE IF NOT EXISTS outreach_reply_deliveries")))
  await db.exec(migration("2026-09-12-workspace-setup-completion.sql"))
  await db.exec(migration("2026-09-12-workspace-setup-completion.sql"))
  state.query.mockImplementation(async (text, values) => (await db.query(text, values)).rows)
})
afterAll(async () => db.close())
beforeEach(async () => {
  state.user = "alice"; state.active = "existing"; state.failCookie = false
  state.put.mockReset().mockResolvedValue({ url: "https://private.invalid/deck" })
  state.createDocument.mockReset().mockResolvedValue({ id: "document-id" })
  state.extract.mockReset().mockResolvedValue({ name: "Extracted company" })
  await db.exec("DELETE FROM onboarding_drafts; DELETE FROM memberships; DELETE FROM organizations; DELETE FROM funds;")
})
it("saves and resumes drafts without legacy users or data-room tables", async () => {
  const saved = await POST(req(draft()))
  expect(saved.status).toBe(200)
  expect(await saved.json()).toMatchObject({ revision: 1, completed: false })
  const restored = await (await GET(req())).json()
  expect(restored.draft).toMatchObject({ revision: 1, data: { company: "Northstar" } })
  expect((await db.query("SELECT * FROM organizations")).rows).toHaveLength(0)
})
it("finishes in a separate company despite existing memberships, saves business fields and activates it", async () => {
  const existing = await createUserWorkspace("alice", parseWorkspaceInput({ name: "Other company", kind: "company" }))
  const response = await POST(req(draft(0, true)))
  const body = await response.json()
  expect(body).toMatchObject({ ok: true, completed: true, workspace: { name: "Northstar", settings: { profile: { website: "https://northstar.test", summary: "Efficient energy", raiseTarget: "EUR 2m", geography: "Berlin" } } } })
  expect(state.active).toBe(body.workspace.orgId)
  expect(state.active).not.toBe(existing.orgId)
  expect((await db.query("SELECT * FROM organizations")).rows).toHaveLength(2)
  expect((await getUserWorkspace("alice", existing.orgId))?.name).toBe("Other company")
})
it("recovers a lost completion response and rejects edits to completed setup", async () => {
  state.failCookie = true
  const failed = await POST(req(draft(0, true)))
  expect(failed.status).toBe(503)
  state.failCookie = false
  const replay = await POST(req(draft(0, true, { company: "Unreviewed replacement" })))
  expect((await replay.json()).workspace.name).toBe("Northstar")
  expect((await db.query("SELECT * FROM organizations")).rows).toHaveLength(1)
  expect((await POST(req(draft(1, false)))).status).toBe(409)
})
it("rolls back failed workspace completion while retaining the saved draft", async () => {
  await db.exec("CREATE FUNCTION reject_workspace() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'unavailable'; END $$; CREATE TRIGGER reject_workspace BEFORE INSERT ON organizations FOR EACH ROW EXECUTE FUNCTION reject_workspace();")
  try {
    const result = await POST(req(draft(0, true)))
    expect(result.status).toBe(503)
    const saved = (await db.query("SELECT completed, workspace_id, revision FROM onboarding_drafts")).rows[0]
    expect(saved).toEqual({ completed: false, workspace_id: null, revision: 1 })
    expect((await db.query("SELECT * FROM memberships")).rows).toHaveLength(0)
  } finally { await db.exec("DROP TRIGGER reject_workspace ON organizations; DROP FUNCTION reject_workspace();") }
  expect((await POST(req(draft(1, true)))).status).toBe(200)
})
it("repairs an old completed draft without mutating another workspace", async () => {
  await db.query("INSERT INTO onboarding_drafts(user_id,persona,data,step,revision,completed) VALUES ('alice','founder',$1,3,7,true)", [JSON.stringify(draft().data)])
  const restored = await (await GET(req())).json()
  expect(restored.draft).toMatchObject({ completed: false, needsRepair: true })
  expect((await POST(req(draft(7, true)))).status).toBe(200)
  expect((await (await GET(req())).json()).draft.completed).toBe(true)
})
it("allows only one concurrent completion and does not duplicate the company", async () => {
  const results = await Promise.all([POST(req(draft(0, true))), POST(req(draft(0, true)))])
  expect(results.some(r => r.status === 200)).toBe(true)
  expect(results.every(r => [200,409].includes(r.status))).toBe(true)
  expect((await db.query("SELECT * FROM organizations")).rows).toHaveLength(1)
  expect((await db.query<{ completed: boolean }>("SELECT completed FROM onboarding_drafts")).rows[0].completed).toBe(true)
})
it("uses a reserved upload room and denies resumed setup after membership removal", async () => {
  expect(await onboardingCompanyId("alice")).toBe("onboarding:founder:alice")
  await POST(req(draft(0, true)))
  await db.exec("DELETE FROM memberships WHERE user_id='alice'")
  expect((await GET(req())).status).toBe(403)
  await expect(onboardingCompanyId("alice")).rejects.toMatchObject({ status: 403 })
})
it("retains setup-only fields when editing a company and allows explicit clearing", async () => {
  const body = await (await POST(req(draft(0, true)))).json()
  const edited = await updateUserWorkspace("alice", body.workspace.orgId, parseWorkspaceInput({ name: "Renamed", kind: "company", profile: { website: "" } }))
  expect(edited.settings.profile).toMatchObject({ website: "", raiseTarget: "EUR 2m", summary: "Efficient energy" })
})
it("requires authentication and provides field errors before saving an invalid completion", async () => {
  state.user = ""
  expect((await GET(req())).status).toBe(401)
  expect((await POST(req(draft()))).status).toBe(401)
  state.user = "alice"
  expect((await POST(req(draft(0, true, { website: "javascript:alert(1)" })))).status).toBe(400)
  expect((await db.query("SELECT * FROM onboarding_drafts")).rows).toHaveLength(0)
})
it("keeps VC setup separate and stores human-readable check sizes without numeric profile failures", async () => {
  const result = await POST(req({ account_type: "vc", step: 3, revision: 0, completed: true, data: { name: "Ada", firm: "Climate Fund", vintage: "2026", size: "EUR 50M", checkMin: "EUR 250k", checkMax: "EUR 2M", theses: ["Climate"] } }))
  expect(result.status).toBe(200)
  const { workspace } = await result.json()
  expect(workspace.settings.profile).toMatchObject({ checkMin: "EUR 250k", fundSizeNote: "EUR 50M", vintageYear: 2026 })
  expect(workspace.fundId).toBeTruthy()
})

it("uploads into the setup company rather than another active company and reads a deck before membership exists", async () => {
  const other = await createUserWorkspace("alice", parseWorkspaceInput({ name: "Another company", kind: "company" }))
  state.active = other.orgId
  const form = new FormData(); form.set("file", new File(["%PDF-test"], "deck.pdf", { type: "application/pdf" })); form.set("section", "fundraising")
  const response = await uploadDeck(new NextRequest("https://test.invalid/api/dataroom/founder/upload?onboarding=1", { method: "POST", body: form }))
  expect(response.status).toBe(200)
  expect(state.createDocument).toHaveBeenCalledWith(expect.objectContaining({ companyId: "onboarding:founder:alice", uploadedBy: "alice" }))
  expect(state.put.mock.calls[0][2]).toMatchObject({ access: "private" })
  const extraction = new FormData(); extraction.set("pitch_deck", new File(["%PDF-test"], "deck.pdf", { type: "application/pdf" }))
  expect((await extractDeck(new Request("https://test.invalid/api/onboarding/extract", { method: "POST", body: extraction }))).status).toBe(200)
  expect(state.extract).toHaveBeenCalledOnce()
  const completed = await (await POST(req(draft(0, true)))).json()
  expect(completed.workspace.orgId).toBe(state.createDocument.mock.calls[0][0].companyId)
})
it("does not invoke extraction for unauthenticated or invalid file requests", async () => {
  state.user = ""
  expect((await extractDeck(new Request("https://test.invalid/api/onboarding/extract", { method: "POST" }))).status).toBe(401)
  state.user = "alice"
  const form = new FormData(); form.set("pitch_deck", new File(["not a PDF"], "deck.pdf"))
  expect((await extractDeck(new Request("https://test.invalid/api/onboarding/extract", { method: "POST", body: form }))).status).toBe(422)
  expect(state.extract).not.toHaveBeenCalled()
})
it("refuses non-setup uploads from a read-only workspace", async () => {
  await POST(req(draft(0, true)))
  await db.exec("UPDATE memberships SET org_role='viewer' WHERE user_id='alice'")
  const form = new FormData(); form.set("file", new File(["%PDF-test"], "deck.pdf", { type: "application/pdf" })); form.set("section", "fundraising")
  expect((await uploadDeck(new NextRequest("https://test.invalid/api/dataroom/founder/upload", { method: "POST", body: form }))).status).toBe(403)
  expect(state.put).not.toHaveBeenCalled()
})
