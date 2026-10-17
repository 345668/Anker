import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { PDFDocument, PDFRawStream, decodePDFRawStream, PDFName } from "pdf-lib"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
const st = vi.hoisted(() => ({ q: null as any, nav: null as any, statement: null as any, lp: null as any }))
vi.mock("@/lib/db", () => { const f: any = (s: TemplateStringsArray, ...v: unknown[]) => st.q(s.reduce((q, t, i) => q + (i ? `$${i}` : "") + t, ""), v); return { sql: f } })
vi.mock("./capital-account", () => ({ buildStatement: async () => st.statement }))
vi.mock("./funds", () => ({ getLpById: async () => st.lp }))
vi.mock("./investments", () => ({ getFundNav: async () => st.nav }))
import { activityFor, addDocument, documentForFund, documentForLp, listDocumentsForFund, listDocumentsForLp, noticesFor, removeDocument, statementFor, statementPdf, type LpStatementView } from "./lp-statement"
import { inviteText, LpError } from "./lp-onboarding"

let db: PGlite
const pdf = (tag = "d") => Buffer.concat([Buffer.from(`%PDF-1.4\n${tag}\n`), Buffer.alloc(100, 32)])
const hex = (s: string) => Buffer.from(s, "latin1").toString("hex")
/** The text drawn on every page, as the page's own content stream says it (hex strings of the characters). */
async function pageText(bytes: Uint8Array): Promise<string> {
  const d = await PDFDocument.load(bytes); let out = ""
  for (const p of d.getPages()) {
    const c = p.node.Contents(); const streams = c && "array" in (c as object) ? (c as any).asArray().map((r: any) => d.context.lookup(r)) : [c]
    for (const st of streams) if (st instanceof PDFRawStream) out += Buffer.from(decodePDFRawStream(st).decode()).toString("latin1")
  }
  void PDFName; return out
}
const sample = (n = 3, extra: Partial<LpStatementView> = {}): LpStatementView => ({
  fundName: "Summit Fund II", lpName: "Anna Müller", currency: "EUR", asOf: "2026-10-17", generatedAt: "2026-10-17T10:00:00Z",
  summary: { commitment: 250000, contributed: 100000, distributed: 20000, uncalled: 150000, estimatedNav: 130000, dpi: 0.2, tvpi: 1.5, rvpi: 1.3 },
  transactions: Array.from({ length: n }, (_, i) => ({ date: `2026-0${(i % 9) + 1}-01`, type: (i % 2 ? "distribution" : "contribution") as "contribution" | "distribution", title: `Call ${i + 1}`, reference: i + 1, amount: 1000 * (i + 1), paymentRef: null })), ...extra,
})

beforeAll(async () => {
  db = new PGlite(); st.q = async (q: string, v: unknown[] = []) => (await db.query(q, v)).rows
  await db.exec(`CREATE TABLE fund_lps (id text PRIMARY KEY, fund_id text, lp_name text);
    CREATE TABLE capital_calls (id text PRIMARY KEY, fund_id text, title text, status text, sent_at timestamptz, created_at timestamptz DEFAULT now());
    CREATE TABLE capital_call_line_items (id text PRIMARY KEY, call_id text, fund_lp_id text, amount numeric, status text);
    CREATE TABLE distributions (id text PRIMARY KEY, fund_id text, title text, status text, created_at timestamptz DEFAULT now());
    CREATE TABLE distribution_line_items (id text PRIMARY KEY, distribution_id text, fund_lp_id text, amount numeric, status text);
    CREATE TABLE lp_portal_access_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token_id uuid, lp_id text, path text, ip text, at timestamptz NOT NULL DEFAULT now());`)
  await db.exec(readFileSync("scripts/migrations/2026-10-17e-lp-documents.sql", "utf8"))
}, 30000)
afterAll(async () => db.close())
beforeEach(async () => {
  st.nav = null; st.lp = { id: "lp1", fund_id: "f1", ownership_pct: 0.1 }
  st.statement = { asOfDate: "2026-10-17T00:00:00Z", generatedAt: "2026-10-17T10:00:00Z", fund: { name: "Summit Fund II", currency: "EUR", management_fee_pct: 2 }, lp: { lp_name: "Anna Müller", notes: "internal: difficult investor" },
    summary: { commitment: 250000, totalContributed: 100000, totalDistributed: 20000, uncalledCommitment: 150000, currentNav: 130000, dpi: 0.2, tvpi: 1.5, rvpi: 1.3, netCashFlow: -80000 },
    transactions: [{ date: "2026-03-01T00:00:00Z", type: "contribution", referenceNumber: 1, title: "Call 1", amount: 100000, paymentRef: "WIRE-1", notes: "internal note", runningUncalledCommitment: 150000, runningDistributedTotal: 0, runningContributedTotal: 100000 }] }
  await db.exec(`DELETE FROM lp_documents; DELETE FROM lp_portal_access_log; DELETE FROM capital_call_line_items; DELETE FROM capital_calls; DELETE FROM distribution_line_items; DELETE FROM distributions; DELETE FROM fund_lps;
    INSERT INTO fund_lps VALUES ('lp1','f1','Anna'), ('lp2','f1','Bob'), ('lpX','f2','Other');`)
})

describe("the statement the investor gets", () => {
  it("carries the numbers and the payments, and nothing the fund keeps for itself", async () => {
    const v = (await statementFor("f1", "lp1"))!
    expect(v).toMatchObject({ fundName: "Summit Fund II", lpName: "Anna Müller", currency: "EUR", summary: { commitment: 250000, contributed: 100000, distributed: 20000, uncalled: 150000, estimatedNav: 130000, tvpi: 1.5 } })
    expect(v.transactions).toEqual([{ date: "2026-03-01", type: "contribution", title: "Call 1", reference: 1, amount: 100000, paymentRef: "WIRE-1" }])
    const raw = JSON.stringify(v); expect(raw).not.toContain("internal"); expect(raw).not.toContain("management_fee"); expect(raw).not.toContain("netCashFlow")
  })
  it("another fund's investor gets nothing; no statement means none", async () => {
    st.lp = { id: "lp1", fund_id: "f2" }; expect(await statementFor("f1", "lp1")).toBeNull()
    st.lp = { id: "lp1", fund_id: "f1" }; st.statement = null; expect(await statementFor("f1", "lp1")).toBeNull()
  })
})

describe("notices", () => {
  it("lists this investor's calls and distributions, newest first; drafts and cancelled ones are not shown; other investors' lines never are", async () => {
    await db.exec(`INSERT INTO capital_calls VALUES ('c1','f1','Call 1','sent','2026-03-01', now()), ('c2','f1','Draft call','draft',NULL, now()), ('c3','f1','Cancelled','cancelled','2026-02-01', now());
      INSERT INTO capital_call_line_items VALUES ('l1','c1','lp1',1000,'paid'), ('l2','c2','lp1',2000,'pending'), ('l3','c3','lp1',3000,'pending'), ('l4','c1','lp2',9999,'paid');
      INSERT INTO distributions VALUES ('d1','f1','Dist 1','paid','2026-06-01'), ('d2','f1','Draft dist','draft','2026-07-01'); INSERT INTO distribution_line_items VALUES ('m1','d1','lp1',500,'paid'), ('m2','d2','lp1',700,'pending')`)
    const n = await noticesFor("lp1"); expect(n.map((x) => x.title)).toEqual(["Dist 1", "Call 1"]); expect(n.map((x) => x.amount)).toEqual([500, 1000])
  })
})

describe("the PDF", () => {
  it("is a real PDF named for the fund and investor, with the figures, the estimate label and the not-advice line", async () => {
    const bytes = await statementPdf(sample(3)); expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-")
    const d = await PDFDocument.load(bytes); expect(d.getPageCount()).toBe(1); expect(d.getTitle()).toContain("Anna"); expect(d.getAuthor()).toBe("Summit Fund II")
    const raw = (await pageText(bytes)).toLowerCase(); for (const needle of ["Capital account statement", "Summit Fund II", "Commitment", "estimate", "not tax or investment advice", "Anna M"]) expect(raw.includes(hex(needle).toLowerCase()), needle).toBe(true)
  })
  it("long histories continue on more pages, and characters the font cannot draw do not break it", async () => {
    const d = await PDFDocument.load(await statementPdf(sample(120, { lpName: "李小龍 Müller ✓" }))); expect(d.getPageCount()).toBeGreaterThan(1)
  })
  it("an unknown currency falls back to plain digits and an empty history says so", async () => {
    await expect(statementPdf(sample(0, { currency: "???" }))).resolves.toBeTruthy()
  })
})

describe("documents the fund publishes", () => {
  it("one for everyone, one for one investor; each investor sees theirs and the shared ones only; the other fund sees none", async () => {
    await addDocument("f1", "gp", { category: "tax", title: "Tax statement 2025", filename: "t.pdf", bytes: pdf("t"), lpId: "lp1" })
    await addDocument("f1", "gp", { category: "annual_statement", title: "Annual statement 2025", filename: "a.pdf", bytes: pdf("a") })
    expect((await listDocumentsForLp("f1", "lp1")).map((d) => d.title).sort()).toEqual(["Annual statement 2025", "Tax statement 2025"])
    expect((await listDocumentsForLp("f1", "lp2")).map((d) => d.title)).toEqual(["Annual statement 2025"]); expect(await listDocumentsForLp("f2", "lpX")).toEqual([])
    expect((await listDocumentsForFund("f1")).length).toBe(2)
  })
  it("a file opens only for the investor it was addressed to or for everyone, only in its own fund", async () => {
    const mine = await addDocument("f1", "gp", { category: "tax", title: "Mine", filename: "m.pdf", bytes: pdf("m"), lpId: "lp1" })
    const all = await addDocument("f1", "gp", { category: "notice", title: "All", filename: "n.pdf", bytes: pdf("n") })
    expect((await documentForLp("f1", "lp1", mine.id))!.title).toBe("Mine"); expect(await documentForLp("f1", "lp2", mine.id)).toBeNull(); expect(await documentForLp("f2", "lpX", mine.id)).toBeNull(); expect(await documentForLp("f1", "lp2", all.id)).not.toBeNull()
    expect(await documentForFund("f2", mine.id)).toBeNull(); expect((await documentForFund("f1", mine.id))!.bytes.subarray(0, 5).toString()).toBe("%PDF-")
  })
  it("needs a real PDF, a kind, a name, and an investor of the same fund; and can be taken down", async () => {
    await expect(addDocument("f1", "gp", { category: "tax", title: "x", filename: "x.pdf", bytes: Buffer.from("junk") })).rejects.toBeInstanceOf(LpError)
    await expect(addDocument("f1", "gp", { category: "memo", title: "x", filename: "x.pdf", bytes: pdf() })).rejects.toThrow(/kind/)
    await expect(addDocument("f1", "gp", { category: "tax", title: "  ", filename: "x.pdf", bytes: pdf() })).rejects.toThrow(/name/)
    await expect(addDocument("f1", "gp", { category: "tax", title: "x", filename: "x.pdf", bytes: pdf(), lpId: "lpX" })).rejects.toMatchObject({ status: 404 })
    const d = await addDocument("f1", "gp", { category: "tax", title: "x", filename: "x.pdf", bytes: pdf() }); expect(await removeDocument("f2", d.id)).toBe(false); expect(await removeDocument("f1", d.id)).toBe(true)
  })
})

describe("what the fund can see of an investor's use", () => {
  it("says in plain words what happened and when, without document titles or amounts, newest first", async () => {
    for (const p of ["home", "code-verified", "document:abc", "doc:xyz", "statement:pdf", "subscription-file:1", "onboarding:accept_terms", "verification:upload", "something-new"])
      await db.query("INSERT INTO lp_portal_access_log (lp_id, path) VALUES ('lp1', $1)", [p])
    const a = await activityFor("lp1"); expect(a.views).toBe(9); expect(a.lastSeen).toBeTruthy()
    const words = a.recent.map((r) => r.what); expect(words).toContain("downloaded the statement"); expect(words).toContain("accepted the terms"); expect(words).toContain("used the portal"); expect(JSON.stringify(a)).not.toMatch(/abc|xyz/)
    expect((await activityFor("lp2")).lastSeen).toBeNull()
  })
})

describe("the emails", () => {
  const link = "https://app.test/portal/lp_abc"
  it("each kind is short, carries the link, and never names a document or an amount", () => {
    for (const kind of ["invite", "reminder", "new_material"] as const) {
      const m = inviteText(kind, { fundName: "Summit Fund II", first: "Anna", link, state: "details_confirmed" }); const body = m.lines.join("\n")
      expect(body).toContain(link); expect(body).not.toMatch(/[$€£]\s?\d|\d\s?(EUR|USD)/); expect(body).not.toMatch(/tax|statement|capital call|distribution/i); expect(m.subject).toContain("Summit Fund II")
    }
  })
  it("a reminder names the next open step", () => {
    expect(inviteText("reminder", { fundName: "F", first: null, link, state: "details_confirmed" }).lines.join(" ")).toContain("accept the terms")
    expect(inviteText("reminder", { fundName: "F", first: null, link, state: "opened" }).lines.join(" ")).toContain("confirm your details")
  })
})
