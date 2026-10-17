import { createHash } from "node:crypto"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { sql } from "@/lib/db"
import { buildStatement } from "./capital-account"
import { getLpById } from "./funds"
import { getFundNav } from "./investments"
import { LpError } from "./lp-onboarding"
import { checkPdf } from "./lp-subscription"

/**
 * The investor's capital account (docs/architecture/60 section 8): what they committed, what was called and paid, what was distributed, an ESTIMATE of what their share is
 * worth, the notices they were issued, and the same as a PDF. Built from the same statement the fund sees; nothing the fund keeps for itself (notes, other investors) is passed on.
 */
export interface StatementTxnView { date: string; type: "contribution" | "distribution"; title: string; reference: number; amount: number; paymentRef: string | null }
export interface LpStatementView {
  fundName: string; lpName: string; currency: string; asOf: string; generatedAt: string
  summary: { commitment: number | null; contributed: number; distributed: number; uncalled: number | null; estimatedNav: number | null; dpi: number | null; tvpi: number | null; rvpi: number | null }
  transactions: StatementTxnView[]
}
export interface NoticeView { type: "Capital call" | "Distribution"; title: string; at: string | null; status: string; amount: number }

export async function statementFor(fundId: string, lpId: string): Promise<LpStatementView | null> {
  const lp = await getLpById(lpId)
  if (!lp || lp.fund_id !== fundId) return null
  // The estimate: the fund's latest recorded valuation of its positions times this investor's ownership share. Absent when the fund has not valued anything.
  let nav: number | null = null
  if (lp.ownership_pct != null) {
    const fn = await getFundNav(fundId).catch(() => null)
    if (fn && fn.markedPositionCount > 0) nav = fn.positionsFairValue * Number(lp.ownership_pct)
  }
  const st = await buildStatement({ fundId, lpId, currentNav: nav })
  if (!st) return null
  return {
    fundName: st.fund.name, lpName: st.lp.lp_name, currency: st.fund.currency || "USD", asOf: st.asOfDate.slice(0, 10), generatedAt: st.generatedAt,
    summary: { commitment: st.summary.commitment, contributed: st.summary.totalContributed, distributed: st.summary.totalDistributed, uncalled: st.summary.uncalledCommitment, estimatedNav: st.summary.currentNav, dpi: st.summary.dpi, tvpi: st.summary.tvpi, rvpi: st.summary.rvpi },
    transactions: st.transactions.map((t) => ({ date: t.date.slice(0, 10), type: t.type, title: t.title, reference: t.referenceNumber, amount: t.amount, paymentRef: t.paymentRef })),
  }
}

/** Calls and distributions issued to this investor (drafts are not shown to them). */
export async function noticesFor(lpId: string): Promise<NoticeView[]> {
  const rows = ((await sql`SELECT type, title, at, status, amount FROM (
      SELECT 'Capital call' AS type, cc.title, COALESCE(cc.sent_at, cc.created_at) AS at, cli.status, cli.amount
        FROM capital_call_line_items cli JOIN capital_calls cc ON cc.id = cli.call_id WHERE cli.fund_lp_id = ${lpId} AND cc.status <> 'draft' AND cc.status <> 'cancelled'
      UNION ALL
      SELECT 'Distribution', d.title, d.created_at, dli.status, dli.amount
        FROM distribution_line_items dli JOIN distributions d ON d.id = dli.distribution_id WHERE dli.fund_lp_id = ${lpId} AND d.status <> 'draft' AND d.status <> 'cancelled') x
    ORDER BY at DESC NULLS LAST LIMIT 100`.catch(() => []))) as any[]
  return rows.map((r) => ({ type: r.type, title: r.title ?? r.type, at: r.at ? new Date(r.at).toISOString().slice(0, 10) : null, status: r.status ?? "pending", amount: Number(r.amount ?? 0) }))
}

// ───────────── the PDF ─────────────
const money = (n: number | null, cur: string) => { if (n == null) return "n/a"; try { return new Intl.NumberFormat("en", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n) } catch { return `${cur} ${Math.round(n).toLocaleString("en")}` } }
const ratio = (n: number | null) => (n == null ? "n/a" : `${n.toFixed(2)}x`)

export async function statementPdf(v: LpStatementView): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`Capital account statement - ${v.lpName}`); doc.setAuthor(v.fundName); doc.setCreator("Anker"); doc.setCreationDate(new Date(v.generatedAt))
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const ok = new Set(font.getCharacterSet())
  const clean = (s: string) => Array.from(String(s)).map((c) => (ok.has(c.codePointAt(0)!) ? c : "?")).join("")
  const W = 595, H = 842, M = 48
  let page = doc.addPage([W, H]), y = H - M
  const text = (s: string, x: number, size = 10, f = font, color = rgb(0.1, 0.1, 0.1)) => page.drawText(clean(s), { x, y, size, font: f, color })
  const line = () => page.drawLine({ start: { x: M, y: y - 4 }, end: { x: W - M, y: y - 4 }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) })
  const room = (n: number) => { if (y - n < M + 40) { footer(); page = doc.addPage([W, H]); y = H - M } }
  const footer = () => { const t = `${v.fundName}. Estimated values are estimates, not valuations of record. This statement is information, not tax or investment advice.`; page.drawText(clean(t).slice(0, 150), { x: M, y: M - 12, size: 7, font, color: rgb(0.4, 0.4, 0.4) }) }

  text(v.fundName, M, 11, bold); y -= 22
  text("Capital account statement", M, 20, bold); y -= 26
  text(`Investor: ${v.lpName}`, M); y -= 14
  text(`As of ${v.asOf}. Prepared ${v.generatedAt.slice(0, 10)}.`, M, 9, font, rgb(0.35, 0.35, 0.35)); y -= 24

  const s = v.summary
  const rows: Array<[string, string]> = [["Commitment", money(s.commitment, v.currency)], ["Called and paid", money(s.contributed, v.currency)], ["Not yet called", money(s.uncalled, v.currency)], ["Distributed", money(s.distributed, v.currency)],
    ["Estimated value of your share (estimate)", money(s.estimatedNav, v.currency)], ["Distributions to paid-in (DPI)", ratio(s.dpi)], ["Total value to paid-in (TVPI, estimate)", ratio(s.tvpi)], ["Residual value to paid-in (RVPI, estimate)", ratio(s.rvpi)]]
  for (const [k, val] of rows) { text(k, M); text(val, W - M - 140, 10, bold); y -= 15 }
  y -= 8; text("Transactions", M, 13, bold); y -= 8; line(); y -= 14
  text("Date", M, 8, bold); text("Type", M + 70, 8, bold); text("Description", M + 140, 8, bold); text("Amount", W - M - 90, 8, bold); y -= 12
  if (v.transactions.length === 0) { text("No payments or distributions have been recorded yet.", M, 9, font, rgb(0.35, 0.35, 0.35)); y -= 14 }
  for (const t of v.transactions) {
    room(16)
    text(t.date, M, 9); text(t.type === "contribution" ? "Contribution" : "Distribution", M + 70, 9); text(`${t.title} (#${t.reference})`.slice(0, 48), M + 140, 9)
    text(`${t.type === "distribution" ? "+" : "-"}${money(t.amount, v.currency)}`, W - M - 90, 9); y -= 13
  }
  footer()
  return doc.save()
}

// ───────────── documents the fund publishes ─────────────
export const DOC_CATEGORIES = ["tax", "annual_statement", "notice", "other"] as const
export const CATEGORY_LABEL: Record<string, string> = { tax: "Tax document", annual_statement: "Annual statement", notice: "Notice", other: "Document" }

export interface LpDocView { id: string; title: string; category: string; filename: string; sizeBytes: number; sha256: string; at: string; forAll: boolean; lpId: string | null }

export async function addDocument(fundId: string, by: string, input: { lpId?: string | null; category: unknown; title: unknown; filename: string; bytes: Buffer }): Promise<LpDocView> {
  checkPdf(input.filename, input.bytes)
  const category = String(input.category ?? "")
  if (!(DOC_CATEGORIES as readonly string[]).includes(category)) throw new LpError("Choose what kind of document it is.")
  const title = String(input.title ?? "").replace(/\s+/g, " ").trim().slice(0, 140)
  if (!title) throw new LpError("Give the document a name the investor will recognise.")
  if (input.lpId) { const [l] = (await sql`SELECT 1 AS ok FROM fund_lps WHERE id = ${input.lpId} AND fund_id = ${fundId}`) as any[]; if (!l) throw new LpError("That investor does not belong to this fund.", 404) }
  const [r] = (await sql`INSERT INTO lp_documents (fund_id, lp_id, category, title, filename, size_bytes, sha256, content, uploaded_by)
    VALUES (${fundId}, ${input.lpId ?? null}, ${category}, ${title}, ${input.filename.replace(/[\r\n"\\/]/g, " ").trim().slice(0, 120) || "document.pdf"}, ${input.bytes.length}, ${createHash("sha256").update(input.bytes).digest("hex")}, ${input.bytes}, ${by})
    RETURNING id, lp_id, category, title, filename, size_bytes, sha256, created_at`) as any[]
  return toView(r)
}
const toView = (r: any): LpDocView => ({ id: String(r.id), title: r.title, category: r.category, filename: r.filename, sizeBytes: Number(r.size_bytes), sha256: r.sha256, at: new Date(r.created_at).toISOString().slice(0, 10), forAll: !r.lp_id, lpId: r.lp_id ?? null })

export async function listDocumentsForFund(fundId: string): Promise<LpDocView[]> {
  return ((await sql`SELECT id, lp_id, category, title, filename, size_bytes, sha256, created_at FROM lp_documents WHERE fund_id = ${fundId} ORDER BY created_at DESC LIMIT 200`) as any[]).map(toView)
}
export async function removeDocument(fundId: string, id: string): Promise<boolean> {
  return ((await sql`DELETE FROM lp_documents WHERE id = ${id}::uuid AND fund_id = ${fundId} RETURNING id`) as any[]).length > 0
}
/** What this investor can open: documents addressed to them and documents addressed to every investor of the fund. */
export async function listDocumentsForLp(fundId: string, lpId: string): Promise<LpDocView[]> {
  return ((await sql`SELECT id, lp_id, category, title, filename, size_bytes, sha256, created_at FROM lp_documents WHERE fund_id = ${fundId} AND (lp_id = ${lpId} OR lp_id IS NULL) ORDER BY created_at DESC LIMIT 100`) as any[]).map(toView)
}
export async function documentForLp(fundId: string, lpId: string, id: string): Promise<{ filename: string; contentType: string; bytes: Buffer; title: string } | null> {
  const [r] = (await sql`SELECT filename, content_type, content, title FROM lp_documents WHERE id = ${id}::uuid AND fund_id = ${fundId} AND (lp_id = ${lpId} OR lp_id IS NULL)`) as any[]
  return r ? { filename: r.filename, contentType: r.content_type, bytes: Buffer.from(r.content), title: r.title } : null
}
export async function documentForFund(fundId: string, id: string): Promise<{ filename: string; contentType: string; bytes: Buffer } | null> {
  const [r] = (await sql`SELECT filename, content_type, content FROM lp_documents WHERE id = ${id}::uuid AND fund_id = ${fundId}`) as any[]
  return r ? { filename: r.filename, contentType: r.content_type, bytes: Buffer.from(r.content) } : null
}

// ───────────── what the fund can see of an investor's use of the portal ─────────────
export interface ActivityView { lastSeen: string | null; views: number; recent: Array<{ at: string; what: string }> }
const WHAT: Array<[RegExp, string]> = [[/^home$/, "opened the portal"], [/^code-verified$/, "entered the emailed code"], [/^letter:/, "read a letter"], [/^document:/, "opened a report"], [/^doc:/, "opened a document"], [/^subscription-file:/, "opened a subscription document"], [/^subscription:/, "returned the signed subscription"],
  [/^onboarding:confirm_details/, "confirmed their details"], [/^onboarding:accept_terms/, "accepted the terms"], [/^verification:/, "worked on identity verification"], [/^statement:pdf/, "downloaded the statement"], [/^ask$/, "asked the assistant a question"]]
export async function activityFor(lpId: string): Promise<ActivityView> {
  const rows = (await sql`SELECT path, at FROM lp_portal_access_log WHERE lp_id = ${lpId} ORDER BY at DESC LIMIT 40`) as any[]
  const label = (p: string) => WHAT.find(([re]) => re.test(p))?.[1] ?? "used the portal"
  return { lastSeen: rows[0] ? new Date(rows[0].at).toISOString() : null, views: rows.length, recent: rows.slice(0, 15).map((r) => ({ at: new Date(r.at).toISOString(), what: label(String(r.path)) })) }
}
