import { PGlite } from "@electric-sql/pglite"
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest"
const st = vi.hoisted(() => ({ q: null as any }))
vi.mock("@/lib/db", () => { const f: any = (s: TemplateStringsArray, ...v: unknown[]) => st.q(s.reduce((q, t, i) => q + (i ? `$${i}` : "") + t, ""), v); return { sql: f } })
import { getPortalData, getPortalLetter, mintPortalToken, verifyPortalToken } from "./lp-portal"

/** The tables here have the columns production has (checked 2026-10-17): the investor portal returned a server error for every investor because a query asked a table for a column it does not have. */
let db: PGlite
beforeAll(async () => {
  db = new PGlite(); st.q = async (q: string, v: unknown[] = []) => (await db.query(q, v)).rows
  await db.exec(`CREATE TABLE funds (id text PRIMARY KEY, name text);
    CREATE TABLE fund_lps (id text PRIMARY KEY, fund_id text, lp_name text, commitment_amount numeric, called_amount numeric, distributed_amount numeric, ownership_pct numeric);
    CREATE TABLE lp_portal_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lp_id text, fund_id text, token_hash text, prefix text, label text, expires_at timestamptz, revoked boolean DEFAULT false, last_seen_at timestamptz, view_count int DEFAULT 0, created_by text, created_at timestamptz DEFAULT now());
    CREATE TABLE lp_positions (id text PRIMARY KEY, fund_id text, lp_id text, lp_name text, as_of date, commitment numeric, called numeric, distributed numeric, nav numeric, source text, import_id text, created_by text, created_at timestamptz DEFAULT now());
    CREATE TABLE lp_reports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fund_id text, report_type text, period_start date, period_end date, title text, status text, generated_by text, approved_by text, approved_at timestamptz, pdf_url text, file_size int, sent_to_lps boolean, sent_at timestamptz, notes text, report_data jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE lp_quarterly_reports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fund_id text, quarter_end date, quarter_label text, content_md text, summary text, kpis_snapshot jsonb, status text, sent_at timestamptz, reviewed_by text, generated_by text, generator_model text, generation_ms int, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    INSERT INTO funds VALUES ('f1', 'Fund One'); INSERT INTO fund_lps VALUES ('lp1', 'f1', 'Anna', 100000, 40000, 5000, 0.1);
    INSERT INTO lp_quarterly_reports (id, fund_id, quarter_end, quarter_label, content_md, status, sent_at) VALUES ('11111111-1111-1111-1111-111111111111', 'f1', '2026-06-30', 'Q2 2026', '# Q2', 'sent', now()), ('22222222-2222-2222-2222-222222222222', 'f1', '2026-09-30', 'Q3 2026', 'draft text', 'draft', NULL);
    INSERT INTO lp_reports (fund_id, report_type, title, status, pdf_url, approved_at) VALUES ('f1', 'annual', 'Annual report 2025', 'approved', 'https://x.test/a.pdf', now());`)
}, 30000)
afterAll(async () => db.close())

describe("the investor portal's data, against the real column names", () => {
  it("assembles the investor's view: position, sent letters only (named by quarter), approved reports", async () => {
    const m = await mintPortalToken("lp1", "f1", { days: 1 }); const lp = (await verifyPortalToken(m.token))!
    const d = await getPortalData(lp)
    expect(d.lp).toMatchObject({ name: "Anna", commitment: 100000, called: 40000, distributed: 5000 })
    expect(d.letters).toEqual([expect.objectContaining({ title: "Quarterly letter, Q2 2026", quarter: "Q2 2026" })])      // the draft is not shown
    expect(d.documents.map((x) => x.title)).toEqual(["Annual report 2025"])
  })
  it("a sent letter opens by id, a draft does not, and another fund's id finds nothing", async () => {
    expect(await getPortalLetter("f1", "11111111-1111-1111-1111-111111111111")).toMatchObject({ title: "Quarterly letter, Q2 2026", contentMd: "# Q2" })
    expect(await getPortalLetter("f1", "22222222-2222-2222-2222-222222222222")).toBeNull(); expect(await getPortalLetter("f2", "11111111-1111-1111-1111-111111111111")).toBeNull()
  })
})
