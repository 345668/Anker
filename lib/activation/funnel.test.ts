import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
const h = vi.hoisted(() => ({ sql: vi.fn() as any }))
vi.mock("@/lib/db", () => ({ sql: h.sql }))
import { activationFunnel } from "./funnel"
let db: PGlite
const T = (d: number) => new Date(Date.UTC(2026, 9, 1) + d * 86_400_000).toISOString()
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE organizations (id text PRIMARY KEY, kind text, name text, created_at timestamptz, archived_at timestamptz);
    CREATE TABLE crm_entries (id text PRIMARY KEY, org_id text, added_at timestamptz);
    CREATE TABLE outreach_messages (id text PRIMARY KEY, crm_entry_id text, status text, created_at timestamptz, sent_at timestamptz);
    CREATE TABLE outreach_replies (id serial PRIMARY KEY, crm_entry_id text, received_at timestamptz, created_at timestamptz);
    CREATE TABLE send_authorizations (id text PRIMARY KEY, org_id text, approved_at timestamptz);
    CREATE TABLE send_items (id serial PRIMARY KEY, org_id text, status text, sent_at timestamptz);
    CREATE TABLE action_proposals (id text PRIMARY KEY, org_id text, status text, decided_at timestamptz);
    CREATE TABLE agent_executions (id text PRIMARY KEY, org_id text, status text, finished_at timestamptz);`)
  await db.exec(readFileSync("scripts/migrations/2026-10-10b-activation-view.sql", "utf8"))
  await db.exec(`INSERT INTO organizations VALUES ('empty','company','Empty Co','${T(0)}',NULL), ('contacts','company','Contacts Co','${T(0)}',NULL), ('drafted','company','Drafted Co','${T(0)}',NULL), ('authorized','company','Auth Co','${T(0)}',NULL),
      ('sent','fund','Sent Fund','${T(0)}',NULL), ('replied','company','Replied Co','${T(0)}',NULL), ('gone','company','Gone Co','${T(0)}','${T(5)}');
    INSERT INTO crm_entries VALUES ('c1','contacts','${T(1)}'), ('c2','contacts','${T(2)}'), ('d1','drafted','${T(1)}'), ('a1','authorized','${T(1)}'), ('s1','sent','${T(1)}'), ('r1','replied','${T(1)}');
    INSERT INTO outreach_messages VALUES ('md','d1','draft','${T(2)}',NULL), ('ma','a1','queued','${T(2)}',NULL), ('ms','s1','sent','${T(2)}','${T(3)}'), ('mr','r1','replied','${T(2)}','${T(4)}');
    INSERT INTO send_authorizations VALUES ('x1','authorized','${T(3)}'), ('x2','sent','${T(3)}'), ('x3','replied','${T(3)}');
    INSERT INTO send_items (org_id, status, sent_at) VALUES ('sent','sent','${T(3)}'), ('sent','failed',NULL), ('replied','sent','${T(4)}');
    INSERT INTO outreach_replies (crm_entry_id, received_at, created_at) VALUES ('r1','${T(6)}','${T(6)}');
    INSERT INTO action_proposals VALUES ('p1','sent','applied','${T(4)}'), ('p2','sent','pending',NULL), ('p3','sent','rejected','${T(4)}');
    INSERT INTO agent_executions VALUES ('e1','sent','completed','${T(5)}'), ('e2','sent','failed','${T(5)}');`)
  h.sql.mockImplementation(async (strings: TemplateStringsArray, ...v: unknown[]) => (await db.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), v)).rows)
})
afterAll(async () => db.close())
describe("activation funnel", () => {
  it("places each workspace at the furthest step it has reached, from the records alone", async () => {
    const f = await activationFunnel({ now: new Date(T(7)) })
    const at = Object.fromEntries(f.rows.map((r) => [r.orgId, r.furthest]))
    expect(at).toEqual({ empty: "workspace_created", contacts: "contacts_added", drafted: "outreach_drafted", authorized: "send_authorized", sent: "email_sent", replied: "reply_received" })
    expect(f.workspaces).toBe(6) // the archived workspace is not counted
  })
  it("counts how many workspaces reached each step, cumulatively", async () => {
    const f = await activationFunnel({ now: new Date(T(7)) })
    expect(f.reached).toEqual({ workspace_created: 6, contacts_added: 5, outreach_drafted: 4, send_authorized: 3, email_sent: 2, reply_received: 1 })
  })
  it("reports time to first send, decided proposals, finished agent runs and weekly activity", async () => {
    const f = await activationFunnel({ now: new Date(T(7)) })
    const s = f.rows.find((r) => r.orgId === "sent")!
    expect(s).toMatchObject({ itemsSent: 1, proposalsDecided: 2, agentRuns: 1, hoursToFirstSend: 72, weeklyActive: true })
    expect(f.proposalsDecided).toBe(2); expect(f.agentsUsed).toBe(1)
    expect(f.rows.find((r) => r.orgId === "empty")).toMatchObject({ hoursToFirstSend: null })
    expect((await activationFunnel({ now: new Date(T(30)) })).weeklyActive).toBe(0)
  })
  it("can leave out throwaway workspaces", async () => {
    const f = await activationFunnel({ exclude: ["empty", "contacts"], now: new Date(T(7)) })
    expect(f.workspaces).toBe(4); expect(f.reached.workspace_created).toBe(4)
  })
})
