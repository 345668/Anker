/** Export and erasure against a real Postgres (PGlite): scoped to one workspace, children before parents, shared data untouched. */
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
const h = vi.hoisted(() => ({ db: null as any }))
vi.mock("@/lib/db", () => ({ sql: { unsafe: async (text: string, params: unknown[] = []) => (await h.db.query(text, params)).rows } }))
import { resolveScope, erasureBlockers, dryRun, driftOk, eraseWorkspace, buildExport, countRows, totalRows, bind } from "./executor"

let db: PGlite
const rowsOf = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[]
const count = async (t: string, where = "true") => Number((await rowsOf(`SELECT count(*)::int n FROM ${t} WHERE ${where}`))[0].n)

async function seed() {
  await db.exec(`
    TRUNCATE organizations, memberships, profiles, funds, journal_entries, deal_opportunities, deal_rooms, crm_entries, ai_calls, billing_subscriptions, billing_customers, outreach_messages, investors, email_suppressions, user_settings, tenant_lifecycle, tenant_entitlements, tenant_tombstones CASCADE;
    INSERT INTO funds VALUES ('fA'), ('fB');
    INSERT INTO organizations VALUES ('A', 'Acme Fund', 'fA', '{}'), ('B', 'Beta Fund', 'fB', '{}');
    INSERT INTO profiles VALUES ('uA', 'owner@acme.test'), ('uA2', 'analyst@acme.test'), ('uS', 'shared@both.test'), ('uB', 'owner@beta.test'), ('uAdmin', 'founder@an-ker.test');
    INSERT INTO memberships VALUES ('A','uA','workspace_owner'), ('A','uA2','member'), ('A','uS','admin'), ('B','uS','member'), ('B','uB','workspace_owner');
    INSERT INTO deal_opportunities (id, fund_id, company_name) VALUES ('dA1','fA','Deal A1'), ('dA2','fA','Deal A2'), ('dB1','fB','Deal B1');
    INSERT INTO deal_evaluations VALUES ('dA1','{}'), ('dB1','{}');
    INSERT INTO deal_rooms VALUES ('rA1','dA1'), ('rB1','dB1'); INSERT INTO deal_room_notes VALUES ('rA1','note A'), ('rB1','note B');
    INSERT INTO journal_entries VALUES ('jA','fA'), ('jB','fB'); INSERT INTO journal_lines VALUES ('jA'), ('jA'), ('jB');
    INSERT INTO crm_entries VALUES ('A','e1'), ('A','e2'), ('A','e3'), ('B','e4');
    INSERT INTO ai_calls VALUES ('A','uA','owner@acme.test','boom'), ('A','uA','owner@acme.test',NULL), ('B','uB','owner@beta.test',NULL);
    INSERT INTO billing_subscriptions VALUES ('A','canceled'), ('B','active'); INSERT INTO billing_customers VALUES ('A','cus_A');
    INSERT INTO outreach_messages VALUES ('uA','hello'), ('uA2','hi'), ('uS','shared sender'), ('uB','beta');
    INSERT INTO investors VALUES ('uA','Directory Person 1'), ('uA2','Directory Person 2'), ('uB','Directory Person 3');
    INSERT INTO email_suppressions VALUES (NULL,'optout@x.test'), ('uA','mine@x.test');
    INSERT INTO user_settings VALUES ('uA','sk-secret-key'), ('uB','sk-beta');
    INSERT INTO tenant_lifecycle VALUES ('A','offboarding'); INSERT INTO tenant_entitlements VALUES ('A','fund_pro');`)
}

beforeAll(async () => {
  db = new PGlite(); h.db = db
  await db.exec(`
    CREATE TABLE funds (id text PRIMARY KEY);
    CREATE TABLE organizations (id text PRIMARY KEY, name text, fund_id text, settings jsonb DEFAULT '{}');
    CREATE TABLE memberships (org_id text, user_id text, org_role text);
    CREATE TABLE profiles (id text, email text);
    CREATE TABLE deal_opportunities (id text PRIMARY KEY, fund_id text REFERENCES funds(id) ON DELETE CASCADE, company_name text);
    CREATE TABLE deal_evaluations (deal_id text REFERENCES deal_opportunities(id) ON DELETE CASCADE, scores jsonb);
    CREATE TABLE deal_rooms (id text PRIMARY KEY, deal_id text);
    CREATE TABLE deal_room_notes (room_id text REFERENCES deal_rooms(id), note text);
    CREATE TABLE journal_entries (id text PRIMARY KEY, fund_id text REFERENCES funds(id) ON DELETE CASCADE);
    CREATE TABLE journal_lines (entry_id text REFERENCES journal_entries(id) ON DELETE CASCADE);
    CREATE TABLE crm_entries (org_id text REFERENCES organizations(id), id text);
    CREATE TABLE ai_calls (workspace_id text, actor_id text, actor_email text, error text);
    CREATE TABLE billing_subscriptions (org_id text, status text);
    CREATE TABLE billing_customers (org_id text, stripe_customer_id text);
    CREATE TABLE outreach_messages (user_id text, body text);
    CREATE TABLE investors (user_id text, name text);
    CREATE TABLE email_suppressions (user_id text, email text);
    CREATE TABLE user_settings (user_id text, openai_api_key text);`)
  await db.exec(readFileSync("scripts/migrations/2026-10-04c-tenant-control.sql", "utf8"))
  await db.exec(readFileSync("scripts/migrations/2026-10-04e-tenant-tombstones.sql", "utf8"))
}, 30000)
afterAll(async () => db.close())
beforeEach(seed)

const admins = (e: string) => e === "founder@an-ker.test"

describe("bind", () => {
  const s = { orgId: "A", fundId: "fA", soleMembers: ["u1"], orgName: "", ownerEmails: [], memberEmails: [] }
  it("sends only the parameters a rule uses, renumbered", () => {
    expect(bind("org_id = $1", s)).toEqual({ where: "org_id = $1", values: ["A"] })
    expect(bind("fund_id = $2", s)).toEqual({ where: "fund_id = $1", values: ["fA"] })
    expect(bind("user_id = ANY($3::text[])", s)).toEqual({ where: "user_id = ANY($1::text[])", values: [["u1"]] })
    expect(bind("a = $2 OR b = $2 OR c = $1", s)).toEqual({ where: "a = $2 OR b = $2 OR c = $1", values: ["A", "fA"] })
  })
})

describe("scope", () => {
  it("finds the fund, the owners, and only the members who belong to no other workspace", async () => {
    const s = (await resolveScope("A"))!
    expect(s).toMatchObject({ orgId: "A", orgName: "Acme Fund", fundId: "fA" })
    expect(s.soleMembers.sort()).toEqual(["uA", "uA2"]); expect(s.ownerEmails.sort()).toEqual(["owner@acme.test", "shared@both.test"])
    expect(await resolveScope("nope")).toBeNull()
  })
})

describe("blockers", () => {
  it("an offboarding, unheld, non-platform workspace with no live subscription may proceed", async () => {
    expect(await erasureBlockers((await resolveScope("A"))!, { isPlatformAdmin: admins })).toEqual([])
  })
  it("refuses a workspace that is still active, held, protected, a platform owner's or subscribed", async () => {
    const codes = async (id: string, o: any = {}) => (await erasureBlockers((await resolveScope(id))!, { isPlatformAdmin: admins, ...o })).map((b) => b.code)
    expect(await codes("B")).toEqual(expect.arrayContaining(["not_offboarding", "subscription"]))
    await db.exec("UPDATE organizations SET settings = '{\"legal_hold\": true}' WHERE id = 'A'"); expect(await codes("A")).toContain("legal_hold")
    expect(await codes("A", { protectedOrgs: ["A"] })).toContain("protected")
    await db.exec("INSERT INTO memberships VALUES ('A','uAdmin','member')"); expect(await codes("A")).toContain("platform_owner")
  })
})

describe("dry run and drift", () => {
  it("counts only this workspace, shows retained and anonymised separately, and never counts the directory or suppression lists", async () => {
    const d = await dryRun((await resolveScope("A"))!)
    const n = (t: string) => d.counts.find((c) => c.table === t)
    expect(n("crm_entries")!.count).toBe(3); expect(n("deal_opportunities")!.count).toBe(2); expect(n("journal_lines")).toBeUndefined(); expect(n("journal_entries")!.count).toBe(1)
    expect(n("billing_subscriptions")).toMatchObject({ count: 1, action: "retain" }); expect(n("ai_calls")).toMatchObject({ count: 2, action: "anonymize" })
    expect(n("outreach_messages")!.count).toBe(2); expect(n("memberships")!.count).toBe(3)
    expect(d.counts.some((c) => ["investors", "email_suppressions"].includes(c.table))).toBe(false)
    expect(d.toDelete).toBeGreaterThan(10); expect(d.retained).toBe(2); expect(d.digest).toMatch(/^[0-9a-f]{16}$/)
  })
  it("tolerates a little growth after approval but not a lot", async () => {
    const before = await countRows((await resolveScope("A"))!)
    expect(driftOk(before, before).ok).toBe(true)
    const grown = before.map((c) => (c.table === "crm_entries" ? { ...c, count: c.count + 50 } : c)); expect(driftOk(before, grown).ok).toBe(true)
    const bigger = before.map((c) => (c.table === "crm_entries" ? { ...c, count: c.count + 5000 } : c)); expect(driftOk(before, bigger).ok).toBe(false)
  })
})

describe("erasure", () => {
  it("deletes the workspace's data, children before parents, and leaves every other workspace and shared record alone", async () => {
    const s = (await resolveScope("A"))!
    const r = await eraseWorkspace(s, "req1", "ops@sail.test")
    expect(await count("crm_entries", "org_id = 'A'")).toBe(0); expect(await count("deal_opportunities", "fund_id = 'fA'")).toBe(0); expect(await count("deal_rooms", "id = 'rA1'")).toBe(0)
    expect(await count("journal_lines")).toBe(1); expect(await count("journal_entries")).toBe(1)
    expect(await count("funds", "id = 'fA'")).toBe(0); expect(await count("organizations", "id = 'A'")).toBe(0); expect(await count("memberships", "org_id = 'A'")).toBe(0)
    // B is intact
    expect(await count("crm_entries", "org_id = 'B'")).toBe(1); expect(await count("deal_opportunities", "fund_id = 'fB'")).toBe(1); expect(await count("deal_room_notes", "room_id = 'rB1'")).toBe(1)
    expect(await count("organizations", "id = 'B'")).toBe(1); expect(await count("memberships", "org_id = 'B'")).toBe(2)
    // members' content: sole members' deleted, the shared member's and B's kept
    expect((await rowsOf("SELECT user_id FROM outreach_messages ORDER BY user_id")).map((x) => x.user_id)).toEqual(["uB", "uS"])
    expect(await count("user_settings", "user_id = 'uA'")).toBe(0); expect(await count("user_settings", "user_id = 'uB'")).toBe(1)
    // never touched: the directory and the do-not-contact list
    expect(await count("investors")).toBe(3); expect(await count("email_suppressions")).toBe(2)
    // retained and anonymised
    expect(await count("billing_subscriptions", "org_id = 'A'")).toBe(1); expect(await count("billing_customers", "org_id = 'A'")).toBe(1)
    expect(await count("ai_calls")).toBe(3); expect(await count("ai_calls", "workspace_id = 'A'")).toBe(0)
    expect((await rowsOf("SELECT actor_email, error FROM ai_calls WHERE workspace_id IS NULL"))).toEqual([{ actor_email: null, error: null }, { actor_email: null, error: null }])
    // control plane and proof
    expect(await count("tenant_lifecycle")).toBe(0); expect(await count("tenant_entitlements")).toBe(0)
    const t = (await rowsOf("SELECT * FROM tenant_tombstones"))[0]; expect(t).toMatchObject({ org_id: "A", request_id: "req1", status: "done", requested_by: "ops@sail.test" }); expect(JSON.stringify(t)).not.toContain("Acme")
    expect(r.counts.find((c) => c.table === "crm_entries")).toMatchObject({ deleted: 3 })
  })
  it("is idempotent: a second run deletes nothing and does not fail", async () => {
    const s = (await resolveScope("A"))!
    await eraseWorkspace(s, "req1", null)
    const again = await eraseWorkspace(s, "req1", null)
    expect(again.counts.every((c) => c.deleted === 0)).toBe(true); expect(await count("tenant_tombstones")).toBe(1)
  })
  it("a failure partway stops the run with the table named, and a retry completes it", async () => {
    const s = (await resolveScope("A"))!
    await db.exec("ALTER TABLE crm_entries RENAME COLUMN id TO eid; ALTER TABLE crm_entries ADD CONSTRAINT boom CHECK (true)")
    await db.exec("CREATE TABLE crm_people (org_id text, id text, broken_marker text); INSERT INTO crm_people VALUES ('A', 'p1', 'x')")
    await db.exec("CREATE OR REPLACE FUNCTION no_delete() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'blocked'; END $$ LANGUAGE plpgsql; CREATE TRIGGER no_del BEFORE DELETE ON crm_people FOR EACH ROW EXECUTE FUNCTION no_delete()")
    await expect(eraseWorkspace(s, "req2", null)).rejects.toThrow(/crm_people/)
    expect((await rowsOf("SELECT status FROM tenant_tombstones WHERE request_id='req2'"))[0].status).toBe("started")
    await db.exec("DROP TRIGGER no_del ON crm_people")
    await eraseWorkspace(s, "req2", null)
    expect(await count("crm_people", "org_id = 'A'")).toBe(0); expect((await rowsOf("SELECT status FROM tenant_tombstones WHERE request_id='req2'"))[0].status).toBe("done")
    await db.exec("DROP TABLE crm_people")
  })
})

describe("export", () => {
  it("bundles this workspace's tables with a manifest, leaves out secrets and other workspaces, and keeps retained records", async () => {
    const { unzipSync, strFromU8 } = await import("fflate")
    const out = await buildExport((await resolveScope("A"))!)
    const files = unzipSync(out.zip); const names = Object.keys(files).sort()
    expect(names).toEqual(expect.arrayContaining(["README.txt", "manifest.json", "data/crm_entries.json", "data/deal_opportunities.json", "data/billing_subscriptions.json", "data/user_settings.json"]))
    expect(JSON.parse(strFromU8(files["data/crm_entries.json"]))).toHaveLength(3)
    const settings = strFromU8(files["data/user_settings.json"]); expect(settings).not.toContain("sk-secret-key"); expect(settings).not.toContain("openai_api_key")
    expect(Object.values(files).map((f) => strFromU8(f)).join("")).not.toMatch(/Deal B1|sk-beta|Directory Person/)
    const m = JSON.parse(strFromU8(files["manifest.json"])); expect(m.workspace).toMatchObject({ id: "A", name: "Acme Fund" })
    expect(m.tables.find((t: any) => t.table === "billing_subscriptions").note).toMatch(/retention/)
  })
})

describe("the registry against the real counts", () => {
  it("totalRows adds up what a dry run reports", async () => {
    const c = await countRows((await resolveScope("A"))!)
    expect(totalRows(c)).toBe(totalRows(c, "delete") + totalRows(c, "anonymize") + totalRows(c, "retain"))
  })
})
