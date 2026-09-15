// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { randomUUID } from "node:crypto"

/**
 * These tests exercise the same Postgres predicates used by the platform
 * contracts against a real in-memory Postgres engine. They deliberately use
 * two users, two workspaces, and two funds so a passing test proves that
 * tenant scope is not just a fixture-level convention.
 */
describe("multi-workspace platform contracts", () => {
  let db: PGlite

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE TABLE organizations (id text PRIMARY KEY, kind text NOT NULL, owner_user_id text NOT NULL, fund_id text);
      CREATE TABLE organization_memberships (org_id text NOT NULL, user_id text NOT NULL, org_role text NOT NULL, persona text NOT NULL, PRIMARY KEY (org_id, user_id));
      CREATE TABLE funds (id text PRIMARY KEY, slug text UNIQUE NOT NULL, name text NOT NULL);
      CREATE TABLE deal_opportunities (id text PRIMARY KEY, fund_id text NOT NULL, name text NOT NULL, amount numeric NOT NULL);
      CREATE TABLE onboarding_drafts (user_id text NOT NULL, persona text NOT NULL, revision integer NOT NULL DEFAULT 0, step integer NOT NULL DEFAULT 0, data jsonb NOT NULL DEFAULT '{}'::jsonb, completed boolean NOT NULL DEFAULT false, PRIMARY KEY (user_id, persona));
      CREATE TABLE discovery_investors (id text PRIMARY KEY, name text NOT NULL, country text, sectors text[] NOT NULL DEFAULT '{}', stages text[] NOT NULL DEFAULT '{}');
      CREATE TABLE fund_lps (id text PRIMARY KEY, fund_id text NOT NULL, commitment numeric NOT NULL, called numeric NOT NULL, distributed numeric NOT NULL);
      CREATE TABLE outbound_email (id text PRIMARY KEY, status text NOT NULL, claimed_at timestamptz);
      CREATE TABLE outreach_reply_deliveries (reply_id text PRIMARY KEY, outreach_message_id text, user_id text NOT NULL, status text NOT NULL, approved_draft text NOT NULL, first_attempt_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), last_error text);
      CREATE UNIQUE INDEX outreach_reply_deliveries_message_idx ON outreach_reply_deliveries (outreach_message_id) WHERE outreach_message_id IS NOT NULL;

      INSERT INTO funds VALUES ('fund-a', 'alpha', 'Fund Alpha'), ('fund-b', 'beta', 'Fund Beta');
      INSERT INTO organizations VALUES ('org-a', 'fund', 'user-a', 'fund-a'), ('org-b', 'fund', 'user-b', 'fund-b');
      INSERT INTO organization_memberships VALUES ('org-a', 'user-a', 'workspace_owner', 'vc'), ('org-b', 'user-b', 'workspace_owner', 'vc');
      INSERT INTO deal_opportunities VALUES ('deal-a', 'fund-a', 'Alpha deal', 100), ('deal-b', 'fund-b', 'Beta deal', 200);
      INSERT INTO discovery_investors VALUES
        ('inv-1', 'Climate Alpha', 'DE', ARRAY['Climate'], ARRAY['seed']),
        ('inv-2', 'Fintech Beta', 'DE', ARRAY['Fintech'], ARRAY['seed']),
        ('inv-3', 'Climate US', 'US', ARRAY['Climate'], ARRAY['series-a']);
      INSERT INTO fund_lps VALUES ('lp-a1', 'fund-a', 1000, 400, 50), ('lp-a2', 'fund-a', 2000, 800, 100), ('lp-b1', 'fund-b', 9000, 3000, 500);
      INSERT INTO onboarding_drafts (user_id, persona, revision, step, data) VALUES ('user-a', 'founder', 0, 1, '{"company":"Alpha"}');
      INSERT INTO outbound_email VALUES ('out-1', 'queued', NULL);
    `)
  })

  afterAll(async () => { await db.close() })

  it("isolates fund URLs and deal totals by authorized workspace", async () => {
    const visible = async (userId: string, fundId: string) => db.query<{ id: string; amount: number }>(`
      SELECT d.id, d.amount
      FROM deal_opportunities d
      JOIN funds f ON f.id = d.fund_id
      JOIN organizations o ON o.fund_id = f.id
      JOIN organization_memberships m ON m.org_id = o.id
      WHERE m.user_id = $1 AND f.id = $2
      ORDER BY d.id
    `, [userId, fundId])

    expect((await visible("user-a", "fund-a")).rows.map((r) => r.id)).toEqual(["deal-a"])
    expect((await visible("user-a", "fund-b")).rows).toHaveLength(0)
    expect((await visible("user-b", "fund-b")).rows.map((r) => r.id)).toEqual(["deal-b"])
  })

  it("resumes onboarding with compare-and-swap revisions", async () => {
    const first = await db.query<{ revision: number }>(
      `UPDATE onboarding_drafts SET step = $1, data = $2::jsonb, revision = revision + 1 WHERE user_id = $3 AND persona = $4 AND revision = $5 RETURNING revision`,
      [2, JSON.stringify({ company: "Alpha", stage: "seed" }), "user-a", "founder", 0],
    )
    const stale = await db.query(
      `UPDATE onboarding_drafts SET step = $1, revision = revision + 1 WHERE user_id = $2 AND persona = $3 AND revision = $4 RETURNING revision`,
      [3, "user-a", "founder", 0],
    )
    expect(first.rows[0].revision).toBe(1)
    expect(stale.rows).toHaveLength(0)
    const saved = await db.query<{ step: number; data: { stage: string } }>(`SELECT step, data FROM onboarding_drafts WHERE user_id = 'user-a' AND persona = 'founder'`)
    expect(saved.rows[0]).toMatchObject({ step: 2, data: { stage: "seed" } })
  })

  it("filters discovery before pagination and returns the full filtered total", async () => {
    const params = ["DE", "Climate"]
    const page = await db.query<{ id: string }>(
      `SELECT id FROM discovery_investors WHERE country = $1 AND $2 = ANY(sectors) ORDER BY name LIMIT 1 OFFSET 0`, params,
    )
    const count = await db.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM discovery_investors WHERE country = $1 AND $2 = ANY(sectors)`, params,
    )
    expect(page.rows.map((r) => r.id)).toEqual(["inv-1"])
    expect(count.rows[0].total).toBe(1)
  })

  it("keeps LP aggregates fund-scoped", async () => {
    const result = await db.query<{ commitment: number; called: number; distributed: number }>(
      `SELECT sum(commitment)::int AS commitment, sum(called)::int AS called, sum(distributed)::int AS distributed FROM fund_lps WHERE fund_id = $1`, ["fund-a"],
    )
    expect(result.rows[0]).toEqual({ commitment: 3000, called: 1200, distributed: 150 })
  })

  it("allows only one concurrent delivery claim", async () => {
    const claim = () => db.query<{ id: string }>(
      `UPDATE outbound_email SET status = 'sending', claimed_at = now() WHERE id = 'out-1' AND status = 'queued' RETURNING id`,
    )
    const claims = await Promise.all([claim(), claim()])
    expect(claims.filter((result) => result.rows.length === 1)).toHaveLength(1)
    const current = await db.query<{ status: string }>(`SELECT status FROM outbound_email WHERE id = 'out-1'`)
    expect(current.rows[0].status).toBe("sending")

    // A failed provider attempt returns the row to queued; a concurrent retry
    // must still have exactly one claimant rather than sending twice.
    await db.query(`UPDATE outbound_email SET status = 'queued', claimed_at = NULL WHERE id = 'out-1'`)
    const retries = await Promise.all([claim(), claim()])
    expect(retries.filter((result) => result.rows.length === 1)).toHaveLength(1)
  })

  it("keeps durable delivery state across queued, sending, and failed transitions", async () => {
    const upsert = (status: string, lastError: string | null) => db.query(`
      INSERT INTO outreach_reply_deliveries (reply_id, outreach_message_id, user_id, status, approved_draft, last_error)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (outreach_message_id) WHERE outreach_message_id IS NOT NULL
      DO UPDATE SET status = EXCLUDED.status, last_error = EXCLUDED.last_error, updated_at = now()
    `, [randomUUID(), "out-1", "user-a", status, "Approved reply", lastError])
    await upsert("queued", null)
    await upsert("sending", null)
    await upsert("failed", "provider timeout")
    const result = await db.query<{ status: string; last_error: string }>(`SELECT status, last_error FROM outreach_reply_deliveries WHERE outreach_message_id = 'out-1'`)
    expect(result.rows).toEqual([{ status: "failed", last_error: "provider timeout" }])
  })
})
