/**
 * KPI update extraction — turn a founder's investor-update email into a
 * structured month of portfolio KPIs, queued for human review.
 *
 * Flow (see app/api/portfolio/kpi-updates/*):
 *   raw update text → extractKpisFromUpdate() → portfolio_kpi_extractions
 *   (status 'pending') → GP reviews/edits → approve → upsertKpiSnapshot()
 *   writes portfolio_kpis_monthly (source 'email_update').
 *
 * The model is asked to (a) name the company, (b) pick the reporting month,
 * (c) pull the metrics Anker tracks, and (d) rate its own confidence. We
 * then fuzzy-match the company name against portfolio_companies so the
 * reviewer lands on the right row.
 *
 * Feature ported (adapted) from Hemrock Portfolio Reporting (Apache-2.0);
 * see NOTICE. The extraction prompt + review-queue model are re-implemented
 * on Anker's AI provider + Neon `sql` layer.
 */
import { sql } from "@/lib/db"
import { generate } from "@/lib/ai/provider"

export interface ExtractedKpis {
  companyName: string | null
  monthEnd: string | null          // YYYY-MM-DD (last day of the reporting month)
  cashBalance: number | null
  monthlyBurn: number | null
  runwayMonths: number | null
  monthlyRevenue: number | null
  revenueGrowthMom: number | null  // percent, e.g. 12 for +12%
  grossMarginPct: number | null
  headcount: number | null
  customers: number | null
  arr: number | null
  highlights: string | null
  confidence: number               // 0..1
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, ""))
  return Number.isFinite(n) ? n : null
}

/** Last day of the month for a YYYY-MM or YYYY-MM-DD string, else null. */
function normalizeMonthEnd(v: unknown): string | null {
  if (typeof v !== "string") return null
  const m = v.match(/(\d{4})-(\d{1,2})/)
  if (!m) return null
  const y = Number(m[1]); const mo = Number(m[2])
  if (mo < 1 || mo > 12) return null
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  return `${y}-${String(mo).padStart(2, "0")}-${String(last).padStart(2, "0")}`
}

export async function extractKpisFromUpdate(rawText: string): Promise<ExtractedKpis> {
  const text = rawText.trim().slice(0, 12000)
  const prompt = `You are a venture fund analyst. Extract the monthly KPIs from this portfolio-company investor update.

UPDATE:
"""
${text}
"""

Rules:
- Identify the company the update is about (the startup, not the fund).
- Pick the single reporting month the numbers describe. Return it as YYYY-MM.
- Pull only numbers that are clearly stated. Use null for anything not present — do NOT guess or infer.
- Money in absolute units (e.g. 125000 not "125k"). Percentages as plain numbers (12 for 12%).
- "highlights": 1-2 sentence qualitative summary of the update (wins, asks, risks). Null if none.
- "confidence": your 0..1 confidence that the extraction is correct and complete.

Return ONLY this strict JSON, no prose, no fences:
{
  "companyName": string|null,
  "monthEnd": "YYYY-MM"|null,
  "cashBalance": number|null,
  "monthlyBurn": number|null,
  "runwayMonths": number|null,
  "monthlyRevenue": number|null,
  "revenueGrowthMom": number|null,
  "grossMarginPct": number|null,
  "headcount": number|null,
  "customers": number|null,
  "arr": number|null,
  "highlights": string|null,
  "confidence": number
}`

  const raw = await generate(prompt, { task: "deep_research", json: true, maxTokens: 900, temperature: 0.1 })
  const p = parseJson(raw) ?? {}
  return {
    companyName: typeof p.companyName === "string" ? p.companyName.trim().slice(0, 200) || null : null,
    monthEnd: normalizeMonthEnd(p.monthEnd),
    cashBalance: num(p.cashBalance),
    monthlyBurn: num(p.monthlyBurn),
    runwayMonths: num(p.runwayMonths),
    monthlyRevenue: num(p.monthlyRevenue),
    revenueGrowthMom: num(p.revenueGrowthMom),
    grossMarginPct: num(p.grossMarginPct),
    headcount: p.headcount != null ? Math.round(Number(num(p.headcount))) || null : null,
    customers: p.customers != null ? Math.round(Number(num(p.customers))) || null : null,
    arr: num(p.arr),
    highlights: typeof p.highlights === "string" ? p.highlights.trim().slice(0, 2000) || null : null,
    confidence: Math.max(0, Math.min(1, num(p.confidence) ?? 0.5)),
  }
}

/**
 * Fuzzy-match an extracted company name to a portfolio_companies row within
 * a fund. Exact (case-insensitive) first, then prefix, then contained.
 */
export async function matchCompany(fundId: string, name: string | null): Promise<{ id: string; name: string } | null> {
  if (!name) return null
  const n = name.trim().toLowerCase()
  if (!n) return null
  const rows = await sql`
    select id, name from portfolio_companies
    where fund_id = ${fundId}
      and (lower(name) = ${n}
        or lower(name) like ${n + "%"}
        or lower(name) like ${"%" + n + "%"}
        or ${n} like '%' || lower(name) || '%')
    order by
      case when lower(name) = ${n} then 0
           when lower(name) like ${n + "%"} then 1
           else 2 end,
      length(name) asc
    limit 1
  ` as Array<{ id: string; name: string }>
  return rows[0] ?? null
}

function parseJson(raw: string): any | null {
  if (!raw) return null
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim()
  try { return JSON.parse(cleaned) } catch {}
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) } catch {} }
  return null
}
