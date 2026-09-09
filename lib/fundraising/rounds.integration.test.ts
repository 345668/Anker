import { afterAll, beforeAll, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
const mock = vi.hoisted(() => ({ sql: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: mock.sql }))
import { createRaiseRound, listRaiseRounds, updateRaiseTarget } from "./rounds"
let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE organizations(id text PRIMARY KEY);
    CREATE TABLE memberships(user_id text, org_id text, persona text, org_role text);
    CREATE TABLE crm_boards(id text PRIMARY KEY, user_id text, name text, archived boolean DEFAULT false);
    INSERT INTO organizations VALUES ('a'),('b'),('foreign');
    INSERT INTO memberships VALUES ('u','a','founder','workspace_owner'),('u','b','founder','member'),('other','foreign','founder','workspace_owner'),('viewer','a','founder','viewer');
    INSERT INTO crm_boards(id,user_id,name) VALUES ('board-a','u','Seed'),('board-b','u','Series A'),('foreign-board','other','Other'),('viewer-board','viewer','View');`)
  await db.exec(readFileSync(new URL("../../scripts/migrations/2026-09-09-fundraising-rounds.sql", import.meta.url), "utf8"))
  mock.sql.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => (await db.query(strings.reduce((q, chunk, i) => q + (i ? `$${i}` : "") + chunk, ""), values)).rows)
})
afterAll(async () => { await db.close() })
it("persists rounds across two workspaces without exposing another member's boards", async () => {
  const a = await createRaiseRound("u", "a", { name: "Seed", boardId: "board-a", currency: "EUR", target: 100 })
  const b = await createRaiseRound("u", "b", { name: "A", boardId: "board-b", currency: "USD", target: 200 })
  expect(a).toMatchObject({ target: 100, currency: "EUR" })
  expect(b).toMatchObject({ target: 200, currency: "USD" })
  expect((await listRaiseRounds("u", "a")).map(r => r.id)).toEqual([a!.id])
  expect((await listRaiseRounds("u", "b")).map(r => r.id)).toEqual([b!.id])
  expect(await listRaiseRounds("other", "a")).toEqual([])
  expect(await createRaiseRound("u", "a", { name: "Foreign", boardId: "foreign-board", currency: "EUR", target: 1 })).toBeNull()
  expect(await createRaiseRound("viewer", "a", { name: "View", boardId: "viewer-board", currency: "EUR", target: 1 })).toBeNull()
  expect(await createRaiseRound("u", "b", { name: "Duplicate", boardId: "board-a", currency: "USD", target: 1 })).toBeNull()
  expect(await updateRaiseTarget("u", "b", a!.id, 999, 0)).toBeNull()
  const updates = await Promise.all([updateRaiseTarget("u", "a", a!.id, 150, 0), updateRaiseTarget("u", "a", a!.id, 175, 0)])
  expect(updates.filter(Boolean)).toHaveLength(1)
  const saved = (await listRaiseRounds("u", "a"))[0]
  expect(saved.revision).toBe(1)
  expect([150,175]).toContain(saved.target)
  expect((await listRaiseRounds("u", "b"))[0].target).toBe(200)
})
