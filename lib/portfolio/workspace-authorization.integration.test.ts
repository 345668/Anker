import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { NextRequest } from "next/server"

// Real handlers, membership resolution, query modules and PostgreSQL constraints.
// Only the session/cookie transport, SQL transport, AI and DOCX renderer are mocked.
const state = vi.hoisted(() => ({
  user: { id: "manager", email: "manager@example.test", user_metadata: {} } as any,
  org: "org-a",
  query: null as any,
  generate: vi.fn(),
  docx: vi.fn(async () => Buffer.from("docx")),
}))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }) }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: state.org }) }) }))
vi.mock("@/lib/ai/provider", () => ({ generate: state.generate }))
vi.mock("@/lib/ai/docx-export", () => ({ markdownToDocxBuffer: state.docx }))
vi.mock("@/lib/db", () => {
  const sql = Object.assign((parts: TemplateStringsArray, ...values: unknown[]) =>
    state.query(parts.reduce((text, part, i) => text + (i ? `$${i}` : "") + part, ""), values),
  { unsafe: (text: string, values: unknown[] = []) => state.query(text, values) })
  return { sql }
})

import * as companies from "@/app/api/portfolio/companies/route"
import * as company from "@/app/api/portfolio/companies/[id]/route"
import * as kpis from "@/app/api/portfolio/companies/[id]/kpis/route"
import * as reports from "@/app/api/portfolio/reports/route"
import * as report from "@/app/api/portfolio/reports/[id]/route"
import * as reportExport from "@/app/api/portfolio/reports/[id]/export/route"
import * as updates from "@/app/api/portfolio/kpi-updates/route"
import * as update from "@/app/api/portfolio/kpi-updates/[id]/route"
import * as approve from "@/app/api/portfolio/kpi-updates/[id]/approve/route"
import * as dismiss from "@/app/api/portfolio/kpi-updates/[id]/dismiss/route"
import * as compliance from "@/app/api/portfolio/compliance/route"
import * as profile from "@/app/api/portfolio/compliance/profile/route"
import * as settings from "@/app/api/portfolio/compliance/settings/route"
import * as deadlines from "@/app/api/portfolio/compliance/deadlines/route"
import * as capitalCalls from "@/app/api/portfolio/calls/route"
import * as distributions from "@/app/api/portfolio/distributions/route"
import * as digest from "@/app/api/portfolio/compliance/digest/route"
import { requireActiveFund } from "@/lib/auth/fund-access"

const migration = readFileSync("scripts/migrations/2026-09-11-portfolio-fund-authorization.sql", "utf8")
const extractionA = "00000000-0000-4000-8000-000000000001"
const extractionB = "00000000-0000-4000-8000-000000000002"
const request = (path: string, method = "GET", body?: unknown) => new NextRequest(`https://anker.test/api/portfolio/${path}`, {
  method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
})
const params = (id: string) => ({ params: Promise.resolve({ id }) })

describe("portfolio active-workspace authorization", () => {
  let db: PGlite
  let legacyScopes: string[]
  beforeAll(async () => {
    db = new PGlite()
    state.query = async (text: string, values: unknown[]) => (await db.query(text, values)).rows
    await db.exec(`
      CREATE TABLE funds (id text PRIMARY KEY, slug text UNIQUE, name text, metadata jsonb DEFAULT '{}');
      CREATE TABLE organizations (id text PRIMARY KEY, fund_id text, kind text, name text);
      CREATE TABLE memberships (org_id text, user_id text, org_role text, persona text, can_send_outreach boolean DEFAULT false, created_at timestamptz DEFAULT now());
      INSERT INTO funds (id, slug, name) VALUES ('fund-a', 'alpha', 'Alpha'), ('fund-b', 'beta', 'Beta');
      INSERT INTO organizations VALUES ('org-a', 'fund-a', 'fund', 'Alpha'), ('org-b', 'fund-b', 'fund', 'Beta');
    `)
    for (const file of ["2026-06-20-portfolio-tracker.sql", "2026-06-20-lp-quarterly-reports.sql", "2026-07-17-kpi-extractions.sql", "2026-07-17-compliance.sql"]) {
      await db.exec(readFileSync(`scripts/migrations/${file}`, "utf8"))
    }
    await db.exec(`
      INSERT INTO portfolio_companies (id, fund_id, name, slug) VALUES ('legacy', 'alpha', 'Legacy', 'legacy');
      INSERT INTO lp_quarterly_reports (fund_id, quarter_end, quarter_label) VALUES ('alpha', '2026-06-30', '2026-Q2');
      INSERT INTO portfolio_kpi_extractions (company_id, raw_text) VALUES ('legacy', 'Legacy update');
    `)
    await db.exec(migration)
    await db.exec(migration)
    legacyScopes = (await db.query<{ fund_id: string }>(`SELECT fund_id FROM portfolio_companies UNION ALL SELECT fund_id FROM lp_quarterly_reports UNION ALL SELECT fund_id FROM portfolio_kpi_extractions`)).rows.map(r => r.fund_id)
  }, 30000)

  beforeEach(async () => {
    state.user = { id: "manager", email: "manager@example.test", user_metadata: {} }
    state.org = "org-a"
    state.generate.mockReset()
    state.docx.mockClear()
    await db.exec(`
      TRUNCATE memberships, portfolio_companies, lp_quarterly_reports, portfolio_kpi_extractions, fund_compliance_profile, compliance_fund_settings, compliance_deadlines CASCADE;
      INSERT INTO memberships (org_id, user_id, org_role, persona, created_at) VALUES
        ('org-a', 'manager', 'workspace_owner', 'vc', '2026-01-01'),
        ('org-b', 'manager', 'admin', 'vc', '2026-01-02'),
        ('org-b', 'other', 'workspace_owner', 'vc', '2026-01-01');
      INSERT INTO portfolio_companies (id, fund_id, name, slug, total_invested_amount) VALUES
        ('company-a', 'fund-a', 'Company A', 'company', 100), ('company-b', 'fund-b', 'Company B', 'company', 900);
      INSERT INTO portfolio_kpis_monthly (company_id, month_end, arr) VALUES ('company-a', '2026-08-31', 120), ('company-b', '2026-08-31', 9000);
      INSERT INTO lp_quarterly_reports (id, fund_id, quarter_end, quarter_label, content_md) VALUES
        ('report-a', 'fund-a', '2026-06-30', '2026-Q2', 'Alpha private'), ('report-b', 'fund-b', '2026-06-30', '2026-Q2', 'Beta private');
      INSERT INTO portfolio_kpi_extractions (id, fund_id, company_id, month_end, raw_text, arr) VALUES
        ('${extractionA}', 'fund-a', 'company-a', '2026-08-31', 'Alpha update', 200),
        ('${extractionB}', 'fund-b', 'company-b', '2026-08-31', 'Beta update', 10000);
    `)
  })
  afterAll(async () => { await db?.close() })

  it("migrates legacy slugs and company-linked null scopes idempotently", () => {
    expect(legacyScopes).toEqual(["fund-a", "fund-a", "fund-a"])
  })

  it("allows non-staff owners/admins and switches both pages and APIs with the active workspace", async () => {
    expect((await requireActiveFund()).id).toBe("fund-a")
    const first = await (await companies.GET(request("companies"))).json()
    expect(first.rows.map((r: any) => r.id)).toEqual(["company-a"])
    expect(first.rollup.total_invested).toBe(100)
    state.org = "org-b"
    expect((await requireActiveFund()).id).toBe("fund-b")
    const second = await (await companies.GET(request("companies"))).json()
    expect(second.rows.map((r: any) => r.id)).toEqual(["company-b"])
    expect(second.rollup.total_invested).toBe(900)
    expect((await company.GET(request("companies/company-a"), params("company-a"))).status).toBe(404)
  })

  it("rejects a different fund selector even when the user belongs to both funds", async () => {
    for (const selector of ["fund-b", "beta", "unknown", ""]) {
      expect((await companies.GET(request(`companies?fundId=${selector}`))).status).toBe(403)
      expect((await companies.POST(request("companies", "POST", { fundId: selector, name: "Bad" }))).status).toBe(403)
    }
    expect((await companies.GET(request("companies?fundId=alpha"))).status).toBe(200)
    expect((await companies.GET(request("companies?fundId=alpha&fundId=beta"))).status).toBe(403)
    expect((await companies.POST(request("companies", "POST", { fundId: null, name: "Bad" }))).status).toBe(403)
  })

  it("validates forged workspace cookies against the actual user's memberships", async () => {
    state.user.id = "other"
    state.org = "org-a"
    const data = await (await companies.GET(request("companies"))).json()
    expect(data.rows.map((r: any) => r.id)).toEqual(["company-b"])
  })

  it.each(["member", "viewer", "removed", "founder", "lp", "unlinked", "staff"])("denies %s access without a fund owner/admin membership", async kind => {
    if (kind === "removed" || kind === "staff") {
      await db.exec("DELETE FROM memberships WHERE user_id = 'manager'")
      state.user.user_metadata = { role: "admin", is_admin: true }
    } else if (kind === "unlinked") {
      await db.exec("UPDATE organizations SET fund_id = NULL WHERE id = 'org-a'")
    } else if (["founder", "lp"].includes(kind)) {
      await db.query("UPDATE memberships SET persona = $1 WHERE user_id = 'manager'", [kind])
    } else {
      await db.query("UPDATE memberships SET org_role = $1 WHERE user_id = 'manager'", [kind])
    }
    try { expect((await companies.GET(request("companies"))).status).toBe(403) }
    finally { await db.exec("UPDATE organizations SET fund_id = 'fund-a' WHERE id = 'org-a'") }
  })

  it("returns 401 when signed out and rejects malformed mutation bodies", async () => {
    state.user = null
    expect((await companies.GET(request("companies"))).status).toBe(401)
    state.user = { id: "manager" }
    expect((await companies.POST(request("companies", "POST", []))).status).toBe(400)
    expect((await companies.POST(new NextRequest("https://anker.test/api/portfolio/companies", { method: "POST", body: "{" }))).status).toBe(400)
  })

  it("allows own company CRUD and monthly KPIs", async () => {
    const created = await companies.POST(request("companies", "POST", { name: "New Company" }))
    expect(created.status).toBe(201)
    const { company: row } = await created.json()
    expect(row.fund_id).toBe("fund-a")
    expect((await company.PATCH(request("companies/new", "PATCH", { name: "Updated" }), params(row.id))).status).toBe(200)
    expect((await kpis.POST(request("companies/new/kpis", "POST", { monthEnd: "2026-09-01", arr: 700 }), params(row.id))).status).toBe(201)
    expect((await (await kpis.GET(request("companies/new/kpis"), params(row.id))).json()).rows[0].arr).toBe(700)
    expect((await company.DELETE(request("companies/new", "DELETE"), params(row.id))).status).toBe(200)
  })

  it("blocks cross-fund company and KPI reads and writes", async () => {
    const calls = [
      () => company.GET(request("companies/company-b"), params("company-b")),
      () => company.PATCH(request("companies/company-b", "PATCH", { name: "Hacked", slug: "hacked" }), params("company-b")),
      () => company.DELETE(request("companies/company-b", "DELETE"), params("company-b")),
      () => kpis.GET(request("companies/company-b/kpis"), params("company-b")),
      () => kpis.POST(request("companies/company-b/kpis", "POST", { monthEnd: "2026-08-31", arr: 0 }), params("company-b")),
    ]
    for (const call of calls) expect((await call()).status).toBe(404)
    expect((await db.query("SELECT name FROM portfolio_companies WHERE id = 'company-b'")).rows[0]).toEqual({ name: "Company B" })
    expect(Number((await db.query<{ arr: number }>("SELECT arr FROM portfolio_kpis_monthly WHERE company_id = 'company-b'")).rows[0].arr)).toBe(9000)
  })

  it("scopes report lists, generation, review and exports", async () => {
    expect((await (await reports.GET(request("reports"))).json()).rows.map((r: any) => r.id)).toEqual(["report-a"])
    for (const call of [
      () => report.GET(request("reports/report-b"), params("report-b")),
      () => report.PATCH(request("reports/report-b", "PATCH", { contentMd: "Hacked" }), params("report-b")),
      () => report.DELETE(request("reports/report-b", "DELETE"), params("report-b")),
      () => reportExport.GET(request("reports/report-b/export"), params("report-b")),
    ]) expect((await call()).status).toBe(404)
    expect(state.docx).not.toHaveBeenCalled()
    expect((await reports.POST(request("reports", "POST", { fundId: "fund-b", quarterEnd: "2026-06-30" }))).status).toBe(403)
    expect(state.generate).not.toHaveBeenCalled()
    state.generate.mockResolvedValue(JSON.stringify({ summary: "Alpha", contentMd: "Alpha letter" }))
    expect((await reports.POST(request("reports", "POST", { quarterEnd: "2026-06-30" }))).status).toBe(201)
    expect(state.generate.mock.calls[0][0]).toContain("Company A")
    expect(state.generate.mock.calls[0][0]).not.toContain("Company B")
    const reviewed = await report.PATCH(request("reports/report-a", "PATCH", { status: "reviewed", reviewedBy: "spoofed" }), params("report-a"))
    expect((await reviewed.json()).report.reviewed_by).toBe("manager@example.test")
    expect((await reportExport.GET(request("reports/report-a/export"), params("report-a"))).status).toBe(200)
  })

  it("isolates KPI queues, company reassignment, approval, dismissal and deletion", async () => {
    expect((await (await updates.GET(request("kpi-updates"))).json()).extractions.map((r: any) => r.id)).toEqual([extractionA])
    for (const call of [
      () => update.PATCH(request("kpi-updates/b", "PATCH", { arr: 0 }), params(extractionB)),
      () => update.DELETE(request("kpi-updates/b", "DELETE"), params(extractionB)),
      () => approve.POST(request("kpi-updates/b/approve", "POST"), params(extractionB)),
      () => dismiss.POST(request("kpi-updates/b/dismiss", "POST"), params(extractionB)),
      () => update.PATCH(request("kpi-updates/a", "PATCH", { companyId: "company-b" }), params(extractionA)),
    ]) expect((await call()).status).toBe(404)
    expect((await updates.POST(request("kpi-updates", "POST", { fundId: "fund-b", rawText: "A long private investor update" }))).status).toBe(403)
    expect(state.generate).not.toHaveBeenCalled()
    expect((await approve.POST(request("kpi-updates/a/approve", "POST"), params(extractionA))).status).toBe(200)
    expect(Number((await db.query<{ arr: number }>("SELECT arr FROM portfolio_kpis_monthly WHERE company_id = 'company-a'")).rows[0].arr)).toBe(200)
    expect((await approve.POST(request("kpi-updates/a/approve", "POST"), params(extractionA))).status).toBe(404)
    expect((await db.query("SELECT status FROM portfolio_kpi_extractions WHERE id = $1", [extractionB])).rows[0]).toEqual({ status: "pending" })
  })

  it("scopes compliance profiles and digest counts to the active fund", async () => {
    expect((await profile.POST(request("compliance/profile", "POST", { fundId: "beta", registration_status: "ria" }))).status).toBe(403)
    expect((await profile.POST(request("compliance/profile", "POST", { registration_status: "ria" }))).status).toBe(200)
    expect((await (await compliance.GET(request("compliance"))).json()).fundId).toBe("fund-a")
    await db.exec(`INSERT INTO compliance_deadlines (fund_id, compliance_item_id, year, due_date, status)
      SELECT f.id, i.id, 2026, '2026-01-01', 'upcoming' FROM funds f CROSS JOIN (SELECT id FROM compliance_items LIMIT 1) i`)
    const data = await (await digest.GET(request("compliance/digest"))).json()
    expect(data.funds.map((f: any) => f.fundId)).toEqual(["fund-a"])
    expect(data.count).toBe(1)
    expect((await compliance.GET(request("compliance?fundId=missing"))).status).toBe(403)
    expect((await db.query("SELECT id FROM funds")).rows).toHaveLength(2)
  })

  it("rechecks simultaneous KPI approvals and rolls back failed KPI writes", async () => {
    const results = await Promise.all([
      approve.POST(request("kpi-updates/a/approve", "POST"), params(extractionA)),
      approve.POST(request("kpi-updates/a/approve", "POST"), params(extractionA)),
    ])
    expect(results.map(r => r.status).sort()).toEqual([200, 404])
    await db.exec(`UPDATE portfolio_kpi_extractions SET status = 'pending', arr = -1 WHERE id = '${extractionA}';
      ALTER TABLE portfolio_kpis_monthly ADD CONSTRAINT test_positive_arr CHECK (arr >= 0);`)
    try {
      await expect(approve.POST(request("kpi-updates/a/approve", "POST"), params(extractionA))).rejects.toThrow()
      expect((await db.query("SELECT status FROM portfolio_kpi_extractions WHERE id = $1", [extractionA])).rows[0]).toEqual({ status: "pending" })
      expect(Number((await db.query<{ arr: number }>("SELECT arr FROM portfolio_kpis_monthly WHERE company_id = 'company-a'")).rows[0].arr)).toBe(200)
    } finally { await db.exec("ALTER TABLE portfolio_kpis_monthly DROP CONSTRAINT test_positive_arr") }
  })

  it("checks fund authorization on capital-call and distribution creation", async () => {
    for (const route of [capitalCalls, distributions]) {
      expect((await route.POST(request("activity", "POST", { fundId: "fund-b", title: "Bad" }))).status).toBe(403)
      state.user = null
      expect((await route.POST(request("activity", "POST", { title: "Bad" }))).status).toBe(401)
      state.user = { id: "manager" }
    }
  })

  it("checks compliance overrides and deadline ownership before updates", async () => {
    const item = (await db.query<{ id: string }>("SELECT id FROM compliance_items LIMIT 1")).rows[0].id
    expect((await settings.PATCH(request("compliance/settings", "PATCH", { fundId: "fund-b", compliance_item_id: item, dismissed: true }))).status).toBe(403)
    expect((await settings.PATCH(request("compliance/settings", "PATCH", { compliance_item_id: item, dismissed: true }))).status).toBe(200)
    expect((await db.query("SELECT fund_id FROM compliance_fund_settings")).rows).toEqual([{ fund_id: "fund-a" }])
    const row = (await db.query<{ id: string }>("INSERT INTO compliance_deadlines (fund_id, compliance_item_id, year, due_date) VALUES ('fund-b', $1, 2026, '2026-01-01') RETURNING id", [item])).rows[0]
    expect((await deadlines.PATCH(request("compliance/deadlines", "PATCH", { deadlineId: row.id, status: "filed" }))).status).toBe(404)
    expect((await db.query("SELECT status FROM compliance_deadlines WHERE id = $1", [row.id])).rows[0]).toEqual({ status: "upcoming" })
    expect((await deadlines.POST(request("compliance/deadlines", "POST", { fundId: "fund-b", year: 2026 }))).status).toBe(403)
  })

  it("enforces canonical fund and same-fund company relationships in PostgreSQL", async () => {
    await expect(db.exec("INSERT INTO portfolio_companies (fund_id, name, slug) VALUES ('alpha', 'Bad', 'bad')")).rejects.toThrow()
    await expect(db.exec("INSERT INTO portfolio_companies (name, slug) VALUES ('Bad', 'bad')")).rejects.toThrow()
    await expect(db.query("UPDATE portfolio_kpi_extractions SET company_id = 'company-b' WHERE id = $1", [extractionA])).rejects.toThrow()
    // Existing single-column FK still detaches an extraction when its company is deleted.
    expect((await company.DELETE(request("companies/company-a", "DELETE"), params("company-a"))).status).toBe(200)
    expect((await db.query("SELECT company_id FROM portfolio_kpi_extractions WHERE id = $1", [extractionA])).rows[0]).toEqual({ company_id: null })
  })
})
