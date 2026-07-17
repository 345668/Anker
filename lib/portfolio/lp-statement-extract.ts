/**
 * LP statement extraction — turn a pasted capital statement into dated
 * per-LP positions, queued for review.
 *
 * Flow (app/api/portfolio/lp-imports/*):
 *   raw statement text → extractLpStatement() → lp_statement_imports
 *   (pending, positions matched to fund_lps by name) → GP reviews/edits →
 *   approve → writes lp_positions (dated history) + upserts fund_lps
 *   current-state.
 *
 * Feature adapted from Hemrock Portfolio Reporting (Apache-2.0); see NOTICE.
 */
import { sql } from "@/lib/db"
import { generate } from "@/lib/ai/provider"

export interface LpPositionRow {
  lpId: string | null
  lpName: string
  commitment: number | null
  called: number | null
  distributed: number | null
  nav: number | null
}

export interface LpStatementExtraction {
  asOf: string | null            // YYYY-MM-DD
  positions: LpPositionRow[]
  confidence: number
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, ""))
  return Number.isFinite(n) ? n : null
}

function normalizeDate(v: unknown): string | null {
  if (typeof v !== "string") return null
  const d = new Date(v)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  const m = v.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`
  const m2 = v.match(/(\d{4})-(\d{1,2})/)
  if (m2) { const last = new Date(Date.UTC(+m2[1], +m2[2], 0)).getUTCDate(); return `${m2[1]}-${m2[2].padStart(2, "0")}-${String(last).padStart(2, "0")}` }
  return null
}

export async function extractLpStatement(rawText: string): Promise<Omit<LpStatementExtraction, "positions"> & { positions: Omit<LpPositionRow, "lpId">[] }> {
  const text = rawText.trim().slice(0, 16000)
  const prompt = `You are a fund accountant. Read this LP capital statement (pasted from a spreadsheet, PDF, or email) and extract each limited partner's position.

STATEMENT:
"""
${text}
"""

Rules:
- One object per LP / investor row. Skip totals/subtotal rows.
- "asOf": the statement's as-of / reporting date, as YYYY-MM-DD. Null if none.
- Money in absolute units (e.g. 1500000, not "1.5M"). Null if a field is absent — do NOT guess.
- commitment = total committed; called = called/paid-in to date; distributed = distributions to date; nav = current net asset value / capital account balance.
- "confidence": 0..1 for the whole extraction.

Return ONLY strict JSON, no prose, no fences:
{
  "asOf": "YYYY-MM-DD"|null,
  "confidence": number,
  "positions": [
    { "lpName": string, "commitment": number|null, "called": number|null, "distributed": number|null, "nav": number|null }
  ]
}`

  const raw = await generate(prompt, { task: "deep_research", json: true, maxTokens: 2500, temperature: 0.1 })
  const p = parseJson(raw) ?? {}
  const positions: Omit<LpPositionRow, "lpId">[] = Array.isArray(p.positions)
    ? p.positions
        .filter((r: any) => r && typeof r.lpName === "string" && r.lpName.trim())
        .slice(0, 200)
        .map((r: any) => ({
          lpName: String(r.lpName).trim().slice(0, 200),
          commitment: num(r.commitment),
          called: num(r.called),
          distributed: num(r.distributed),
          nav: num(r.nav),
        }))
    : []
  return {
    asOf: normalizeDate(p.asOf),
    confidence: Math.max(0, Math.min(1, num(p.confidence) ?? 0.5)),
    positions,
  }
}

/** Resolve each extracted LP name to an existing fund_lps row (by name). */
export async function matchLps(fundId: string, names: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!names.length) return out
  const rows = await sql`
    select id, lp_name from fund_lps where fund_id = ${fundId}
  ` as Array<{ id: string; lp_name: string }>
  const byLower = new Map(rows.map((r) => [r.lp_name.trim().toLowerCase(), r.id]))
  for (const name of names) {
    const n = name.trim().toLowerCase()
    if (byLower.has(n)) { out.set(name, byLower.get(n)!); continue }
    // contained-match fallback
    const hit = rows.find((r) => {
      const rn = r.lp_name.trim().toLowerCase()
      return rn.includes(n) || n.includes(rn)
    })
    if (hit) out.set(name, hit.id)
  }
  return out
}

function parseJson(raw: string): any | null {
  if (!raw) return null
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim()
  try { return JSON.parse(cleaned) } catch {}
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) } catch {} }
  return null
}
