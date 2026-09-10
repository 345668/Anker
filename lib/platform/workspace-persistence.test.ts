import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { afterAll, beforeAll, expect, it, vi } from "vitest"
import { createUserWorkspace, getUserWorkspace, listUserWorkspaces, parseWorkspaceInput, updateUserWorkspace } from "@/lib/org/workspaces"

const driver = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: (strings: TemplateStringsArray, ...values: unknown[]) =>
  driver.query(strings.reduce((text, part, i) => text + (i ? `$${i}` : "") + part, ""), values) }))
let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  driver.query.mockImplementation(async (text, values) => (await db.query(text, values)).rows)
  const funds = readFileSync("scripts/migrations/2026-06-21-funds-and-lps.sql", "utf8")
  const orgs = readFileSync("scripts/migrations/2026-08-08-personas-owner.sql", "utf8")
  await db.exec(funds.slice(funds.indexOf("CREATE TABLE IF NOT EXISTS funds"), funds.indexOf("CREATE TABLE IF NOT EXISTS fund_lps")))
  await db.exec(orgs.slice(orgs.indexOf("CREATE TABLE IF NOT EXISTS organizations")))
})
afterAll(async () => db.close())

it("creates separate founder and VC contexts and replays a creation request without duplicates", async () => {
  const input = parseWorkspaceInput({ name: "Climate Fund", kind: "fund", requestId: "00000000-0000-4000-8000-000000000001", currency: "EUR", profile: { targetSize: "10000000", vintageYear: 2026 } })
  const [first, replay] = await Promise.all([createUserWorkspace("alice", input), createUserWorkspace("alice", input)])
  expect(first.orgId).toBe(replay.orgId)
  expect(first).toMatchObject({ persona: "vc", orgRole: "workspace_owner", currency: "EUR" })
  expect((await listUserWorkspaces("alice"))).toHaveLength(1)
  const company = await createUserWorkspace("bob", parseWorkspaceInput({ name: "Climate Labs", kind: "company" }))
  expect(company).toMatchObject({ persona: "founder", fundId: null })
  expect(await getUserWorkspace("bob", first.orgId)).toBeNull()
})

it("denies foreign users, viewers, members and workspace-type changes", async () => {
  const [workspace] = await listUserWorkspaces("alice")
  for (const role of ["viewer", "member"]) {
    await db.query("INSERT INTO memberships (id,user_id,org_id,org_role,persona) VALUES ($1,$1,$2,$3,'vc')", [role, workspace.orgId, role])
    await expect(updateUserWorkspace(role, workspace.orgId, parseWorkspaceInput({ name: "Bad edit", kind: "fund" }))).rejects.toMatchObject({ code: "FORBIDDEN" })
  }
  await expect(updateUserWorkspace("bob", workspace.orgId, parseWorkspaceInput({ name: "Bad edit", kind: "fund" }))).rejects.toMatchObject({ code: "NOT_FOUND" })
  await expect(updateUserWorkspace("alice", workspace.orgId, parseWorkspaceInput({ name: "Bad edit", kind: "company" }))).rejects.toMatchObject({ code: "INVALID_KIND" })
})

it("preserves fund amounts, currency and unrelated settings when renaming and rejects stale edits", async () => {
  const [workspace] = await listUserWorkspaces("alice")
  await db.query("UPDATE organizations SET settings = settings || '{\"private_setting\":\"retained\"}'::jsonb WHERE id=$1", [workspace.orgId])
  await db.query("UPDATE funds SET metadata='{\"existing\":true}'::jsonb WHERE id=$1", [workspace.fundId])
  const input = parseWorkspaceInput({ name: "Climate Fund II", kind: "fund", revision: 0, profile: { thesis: "Energy" } })
  const results = await Promise.allSettled([updateUserWorkspace("alice", workspace.orgId, input), updateUserWorkspace("alice", workspace.orgId, input)])
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1)
  expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } })
  const saved = await getUserWorkspace("alice", workspace.orgId)
  expect(saved).toMatchObject({ revision: 1, currency: "EUR", settings: { profile: { targetSize: "10000000.00", vintageYear: 2026 } } })
  expect(saved?.settings).not.toHaveProperty("private_setting")
  const fund = (await db.query("SELECT name, metadata FROM funds WHERE id=$1", [workspace.fundId])).rows[0]
  expect(fund).toEqual({ name: "Climate Fund II", metadata: { existing: true } })
  const org = (await db.query<{ settings: Record<string, unknown> }>("SELECT settings FROM organizations WHERE id=$1", [workspace.orgId])).rows[0]
  expect(org.settings.private_setting).toBe("retained")
})

it("rolls back the workspace change if the canonical fund write fails", async () => {
  const [workspace] = await listUserWorkspaces("alice")
  await db.exec("CREATE FUNCTION reject_fund_edit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'unavailable'; END $$; CREATE TRIGGER reject_edit BEFORE UPDATE ON funds FOR EACH ROW EXECUTE FUNCTION reject_fund_edit();")
  await expect(updateUserWorkspace("alice", workspace.orgId, parseWorkspaceInput({ name: "Failed rename", kind: "fund", revision: 1 }))).rejects.toThrow()
  const saved = await getUserWorkspace("alice", workspace.orgId)
  expect(saved).toMatchObject({ name: "Climate Fund II", revision: 1 })
})
