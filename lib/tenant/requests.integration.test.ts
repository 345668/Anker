/** The request flow around the executor, against a real Postgres (PGlite): dry run, typed confirmation, the waiting period, the cron, cancellation, export. */
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
const h = vi.hoisted(() => ({ db: null as any, mail: vi.fn(), put: vi.fn(), del: vi.fn(), list: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: { unsafe: async (text: string, params: unknown[] = []) => (await h.db.query(text, params)).rows } }))
vi.mock("@/lib/email/resend", () => ({ isResendConfigured: () => true, sendEmail: h.mail }))
vi.mock("@vercel/blob", () => ({ put: h.put, del: h.del, list: h.list }))
import { requestDryRun, scheduleErasure, cancelRequest, runDueErasures, requestExport, expireExports, listRequests, RequestError } from "./requests"

let db: PGlite
const rowsOf = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[]
const count = async (t: string, where = "true") => Number((await rowsOf(`SELECT count(*)::int n FROM ${t} WHERE ${where}`))[0].n)
const fail = async (p: Promise<unknown>) => p.then(() => null, (e) => e as RequestError)

async function seed() {
  await db.exec(`
    TRUNCATE organizations, memberships, profiles, funds, deal_opportunities, crm_entries, ai_calls, billing_subscriptions, tenant_lifecycle, tenant_entitlements, tenant_tombstones, tenant_requests, workspace_access_events CASCADE;
    INSERT INTO funds VALUES ('fA'), ('fB');
    INSERT INTO organizations VALUES ('A', 'Acme Fund', 'fA', '{}'), ('B', 'Beta Fund', 'fB', '{}');
    INSERT INTO profiles VALUES ('uA', 'owner@acme.test'), ('uA2', 'analyst@acme.test'), ('uB', 'owner@beta.test');
    INSERT INTO memberships VALUES ('A','uA','workspace_owner'), ('A','uA2','member'), ('B','uB','workspace_owner');
    INSERT INTO deal_opportunities VALUES ('dA1','fA','Deal A1'), ('dB1','fB','Deal B1');
    INSERT INTO crm_entries VALUES ('A','e1'), ('A','e2'), ('B','e3');
    INSERT INTO tenant_lifecycle VALUES ('A','offboarding','customer asked to leave');`)
}

beforeAll(async () => {
  db = new PGlite(); h.db = db
  await db.exec(`
    CREATE TABLE funds (id text PRIMARY KEY);
    CREATE TABLE organizations (id text PRIMARY KEY, name text, fund_id text, settings jsonb DEFAULT '{}');
    CREATE TABLE memberships (org_id text, user_id text, org_role text);
    CREATE TABLE profiles (id text, email text);
    CREATE TABLE deal_opportunities (id text PRIMARY KEY, fund_id text REFERENCES funds(id) ON DELETE CASCADE, company_name text);
    CREATE TABLE crm_entries (org_id text REFERENCES organizations(id), id text);
    CREATE TABLE ai_calls (workspace_id text, actor_id text, actor_email text, error text);
    CREATE TABLE billing_subscriptions (org_id text, status text);
    CREATE TABLE workspace_access_events (id bigserial PRIMARY KEY, org_id text, actor_user_id text, action text, details jsonb);`)
  await db.exec(readFileSync("scripts/migrations/2026-10-04c-tenant-control.sql", "utf8"))
  await db.exec(readFileSync("scripts/migrations/2026-10-04e-tenant-tombstones.sql", "utf8"))
}, 30000)
afterAll(async () => db.close())
beforeEach(async () => { await seed(); h.mail.mockReset(); h.mail.mockResolvedValue({}); h.put.mockReset(); h.del.mockReset(); h.list.mockReset(); h.list.mockResolvedValue({ blobs: [], hasMore: false }); process.env.BLOB_READ_WRITE_TOKEN = "t"; delete process.env.ERASURE_PROTECTED_ORGS })

const readyToSchedule = async () => { const d = await requestDryRun("A", "ops@sail.test"); return d.id }

describe("dry run", () => {
  it("records what would go and what blocks it, and a workspace that is not offboarding is blocked", async () => {
    await db.exec("DELETE FROM tenant_lifecycle")
    const d = await requestDryRun("A", "ops@sail.test")
    expect(d.blockers.map((b) => b.code)).toContain("not_offboarding"); expect(d.dryRun.toDelete).toBeGreaterThan(3)
    const r = (await listRequests("A"))[0]; expect(r).toMatchObject({ kind: "erasure", status: "dry_run", requested_by: "ops@sail.test" }); expect(r.detail.dryRun.counts.length).toBeGreaterThan(3)
    expect(await count("crm_entries", "org_id = 'A'")).toBe(2) // a dry run deletes nothing
  })
  it("a new dry run replaces an unapproved one; an approved one must be cancelled first; an unknown workspace is a 404", async () => {
    const a = await requestDryRun("A", "ops@sail.test"); const b = await requestDryRun("A", "ops@sail.test")
    expect(a.id).not.toBe(b.id); expect((await rowsOf("SELECT status FROM tenant_requests WHERE id = $1", [a.id]))[0].status).toBe("cancelled")
    await scheduleErasure(b.id, { confirmName: "Acme Fund", approvedBy: "root@sail.test" })
    expect((await fail(requestDryRun("A", "ops@sail.test")))?.status).toBe(409); expect((await fail(requestDryRun("nope", "x")))?.status).toBe(404)
  })
})

describe("scheduling", () => {
  it("needs the workspace name typed exactly, a fresh dry run and no blockers", async () => {
    const id = await readyToSchedule()
    expect((await fail(scheduleErasure(id, { confirmName: "acme fund", approvedBy: "r" })))?.message).toMatch(/typed exactly/)
    expect((await fail(scheduleErasure(id, { confirmName: "", approvedBy: "r" })))?.message).toMatch(/typed exactly/)
    await db.query("UPDATE tenant_requests SET detail = jsonb_set(detail, '{dryRun,takenAt}', to_jsonb(now() - interval '30 hours')) WHERE id = $1", [id])
    expect((await fail(scheduleErasure(id, { confirmName: "Acme Fund", approvedBy: "r" })))?.message).toMatch(/older than 24 hours/)
    const id2 = await readyToSchedule(); await db.exec("INSERT INTO billing_subscriptions VALUES ('A','active')")
    expect((await fail(scheduleErasure(id2, { confirmName: "Acme Fund", approvedBy: "r" })))?.message).toMatch(/subscription/)
    expect(await count("tenant_requests", "status = 'approved'")).toBe(0)
  })
  it("schedules seven days out, tells the owners and the workspace's own log, and can be cancelled with another notice", async () => {
    const id = await readyToSchedule()
    const { executeAfter } = await scheduleErasure(id, { confirmName: "Acme Fund", approvedBy: "root@sail.test" })
    const days = (new Date(executeAfter).getTime() - Date.now()) / 86_400_000; expect(days).toBeGreaterThan(6.9); expect(days).toBeLessThan(7.1)
    expect(h.mail.mock.calls.map((c) => c[0].to).sort()).toEqual(["analyst@acme.test".replace("analyst", "owner")].sort())
    expect(h.mail.mock.calls[0][0]).toMatchObject({ purpose: "transactional" }); expect(h.mail.mock.calls[0][0].text).toMatch(/can be cancelled/)
    expect((await rowsOf("SELECT action FROM workspace_access_events"))[0].action).toBe("staff_erasure_scheduled")
    await cancelRequest(id, "root@sail.test")
    expect((await rowsOf("SELECT status FROM tenant_requests WHERE id = $1", [id]))[0].status).toBe("cancelled"); expect(h.mail).toHaveBeenCalledTimes(2)
    expect((await fail(cancelRequest(id, "x")))?.status).toBe(409)
  })
})

describe("the cron", () => {
  const approve = async () => { const id = await readyToSchedule(); await scheduleErasure(id, { confirmName: "Acme Fund", approvedBy: "root@sail.test" }); return id }
  it("does nothing before the waiting period ends", async () => {
    await approve(); expect(await runDueErasures()).toEqual([]); expect(await count("organizations", "id = 'A'")).toBe(1)
  })
  it("after the waiting period it erases the workspace only, writes the tombstone and tells the owners", async () => {
    const id = await approve(); await db.exec("UPDATE tenant_requests SET execute_after = now() - interval '1 minute'"); h.mail.mockClear()
    expect(await runDueErasures()).toEqual([{ id, outcome: "done" }])
    expect(await count("organizations", "id = 'A'")).toBe(0); expect(await count("crm_entries", "org_id = 'A'")).toBe(0); expect(await count("organizations", "id = 'B'")).toBe(1); expect(await count("crm_entries", "org_id = 'B'")).toBe(1)
    expect((await rowsOf("SELECT status FROM tenant_requests WHERE id = $1", [id]))[0].status).toBe("done"); expect((await rowsOf("SELECT status, org_id FROM tenant_tombstones"))[0]).toEqual({ status: "done", org_id: "A" })
    expect(h.mail.mock.calls[0][0].subject).toMatch(/has been erased/)
    // Files are removed by this workspace's own prefixes and its own deals' folders, never by a prefix that other workspaces share.
    const prefixes = h.list.mock.calls.map((c) => c[0].prefix)
    expect(prefixes).toEqual(expect.arrayContaining(["assistant-uploads/org-A/", "tools-convert/org-A/", "deal-documents/dA1/"])); expect(prefixes).not.toContain("deal-documents/"); expect(prefixes.some((p: string) => p.includes("dB1") || p.includes("org-B"))).toBe(false)
    expect(await runDueErasures()).toEqual([]) // nothing left to run
  })
  it("stops if the workspace stopped being eligible or grew since the dry run, and says why", async () => {
    let id = await approve(); await db.exec("UPDATE tenant_requests SET execute_after = now() - interval '1 minute'; INSERT INTO billing_subscriptions VALUES ('A','active')")
    expect((await runDueErasures())[0]).toMatchObject({ id, outcome: "blocked" }); expect(await count("organizations", "id = 'A'")).toBe(1)
    expect((await rowsOf("SELECT status, detail->>'blocked' AS why FROM tenant_requests WHERE id = $1", [id]))[0]).toMatchObject({ status: "rejected" })
    await seed(); id = await approve(); await db.exec("UPDATE tenant_requests SET execute_after = now() - interval '1 minute'")
    for (let i = 0; i < 300; i++) await db.query("INSERT INTO crm_entries VALUES ('A', $1)", ["x" + i])
    expect((await runDueErasures())[0]).toMatchObject({ outcome: "blocked", detail: expect.stringMatching(/new dry run/) }); expect(await count("crm_entries", "org_id = 'A'")).toBe(302)
  })
  it("a request cancelled in the meantime is not run, and a failing run retries and then stops for a person", async () => {
    let id = await approve(); await cancelRequest(id, "r"); await db.exec("UPDATE tenant_requests SET execute_after = now() - interval '1 minute'"); expect(await runDueErasures()).toEqual([])
    await seed(); id = await approve(); await db.exec("UPDATE tenant_requests SET execute_after = now() - interval '1 minute'; CREATE OR REPLACE FUNCTION no_del() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'blocked'; END $$ LANGUAGE plpgsql; CREATE TRIGGER t BEFORE DELETE ON crm_entries FOR EACH ROW EXECUTE FUNCTION no_del()")
    for (let i = 1; i <= 4; i++) { expect((await runDueErasures())[0]).toMatchObject({ outcome: "failed" }); expect((await rowsOf("SELECT status FROM tenant_requests WHERE id = $1", [id]))[0].status).toBe("approved") }
    await runDueErasures(); expect((await rowsOf("SELECT status FROM tenant_requests WHERE id = $1", [id]))[0].status).toBe("failed")
    await db.exec("DROP TRIGGER t ON crm_entries")
  })
})

describe("export", () => {
  it("builds the bundle, stores it privately, emails the owners the protected link, and tells the workspace", async () => {
    h.put.mockResolvedValue({ url: "https://abc.private.blob.vercel-storage.com/tenant-exports/x.zip" })
    const r = await requestExport("A", "ops@sail.test")
    expect(r.tables).toBeGreaterThan(2); expect(h.put.mock.calls[0][0]).toMatch(/^tenant-exports\/.+\.zip$/); expect(h.put.mock.calls[0][2]).toMatchObject({ access: "private" })
    const req = (await listRequests("A")).find((x) => x.kind === "export")!; expect(req).toMatchObject({ status: "done" }); expect(req.detail.blobUrl).toContain("tenant-exports")
    expect(h.mail.mock.calls[0][0]).toMatchObject({ to: "owner@acme.test" }); expect(h.mail.mock.calls[0][0].text).toContain(`/api/tenant/export/${r.id}`)
    expect((await rowsOf("SELECT action FROM workspace_access_events"))[0].action).toBe("staff_export")
  })
  it("a storage failure marks the request failed and says so; an unknown workspace is a 404", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN
    expect((await fail(requestExport("A", "ops@sail.test")))?.status).toBe(503)
    expect((await listRequests("A")).find((x) => x.kind === "export")!.status).toBe("failed")
    expect((await fail(requestExport("nope", "x")))?.status).toBe(404)
  })
  it("exports older than 14 days are removed from storage and no longer downloadable", async () => {
    h.put.mockResolvedValue({ url: "https://abc.private.blob.vercel-storage.com/tenant-exports/y.zip" }); h.del.mockResolvedValue(undefined)
    const r = await requestExport("A", "ops@sail.test")
    await db.query("UPDATE tenant_requests SET detail = jsonb_set(detail, '{expiresAt}', to_jsonb(now() - interval '1 day')) WHERE id = $1", [r.id])
    expect(await expireExports()).toBe(1); expect(h.del).toHaveBeenCalledWith("https://abc.private.blob.vercel-storage.com/tenant-exports/y.zip", expect.anything())
    expect((await rowsOf("SELECT detail ? 'blobUrl' AS has FROM tenant_requests WHERE id = $1", [r.id]))[0].has).toBe(false)
  })
})
