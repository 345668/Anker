/**
 * LP quarterly report — aggregate + LLM-draft + persist.
 *
 * Pipeline
 * ────────
 *
 *   buildQuarterContext(fundId, quarterEnd)
 *     ↓
 *   { rollup, companies[], qoq[] }
 *     ↓
 *   generateLetterMarkdown(context)        ← Qwen / DashScope via lib/ai/provider
 *     ↓
 *   { headline, summary, contentMd, generationMs, model }
 *     ↓
 *   upsertReport(fundId, quarterEnd, …)
 *
 * The frozen kpis_snapshot field stores the exact context that fed the
 * generator, so re-opening a 2026-Q2 report 18 months later still shows
 * the same numbers it was generated against — even if the underlying
 * portfolio_kpis_monthly rows were corrected after the fact.
 *
 * Why one giant prompt instead of per-company calls
 * ─────────────────────────────────────────────────
 * For a sub-30-company fund (SVS Fund II is well under that), the entire
 * portfolio fits in a single deep-tier prompt comfortably and the model
 * can write cross-portfolio synthesis ("4 of our 12 companies hit GA in
 * Q2") which we'd otherwise have to stitch ourselves.  When a fund gets
 * to >50 portcos we'll split into per-section prompts.
 */

import { sql } from "@/lib/db"
import { generate } from "@/lib/ai/provider"
import {
  getPortfolioRollup,
  listCompanies,
  listKpis,
  type PortfolioCompanyFull,
  type PortfolioRollup,
  type KpiSnapshot,
} from "@/lib/portfolio/queries"

// ── public types ────────────────────────────────────────────────────────

export interface QuarterContext {
  fundId: string
  quarterEnd: string       // ISO YYYY-MM-DD (last day of quarter)
  quarterLabel: string     // "2026-Q2"
  rollup: PortfolioRollup
  companies: Array<{
    company: PortfolioCompanyFull
    latestKpi: KpiSnapshot | null
    /** Same-month-prior-quarter snapshot for QoQ deltas (null when we don't have one). */
    prevQuarterKpi: KpiSnapshot | null
  }>
  /** Highlights pre-computed in TS so the LLM doesn't have to do arithmetic. */
  highlights: string[]
  watchlist: string[]
}

export interface LpQuarterlyReport {
  id: string
  fund_id: string
  quarter_end: string
  quarter_label: string
  content_md: string | null
  summary: string | null
  kpis_snapshot: Record<string, any>
  status: "draft" | "reviewed" | "sent" | "archived"
  sent_at: string | null
  reviewed_by: string | null
  generated_by: string | null
  generator_model: string | null
  generation_ms: number | null
  created_at: string
  updated_at: string
}

// ── context assembly ────────────────────────────────────────────────────

/** Last day of the calendar quarter that contains `iso`. */
export function quarterEndFrom(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) throw new Error(`bad date: ${iso}`)
  const y = d.getUTCFullYear()
  const q = Math.floor(d.getUTCMonth() / 3)         // 0..3
  // Last day of month 3*q+2 (Mar=2, Jun=5, Sep=8, Dec=11). Day 0 of the
  // next month = last of current.
  const last = new Date(Date.UTC(y, 3 * q + 3, 0))
  return last.toISOString().slice(0, 10)
}

export function quarterLabelFrom(quarterEndIso: string): string {
  const d = new Date(quarterEndIso)
  const q = Math.floor(d.getUTCMonth() / 3) + 1
  return `${d.getUTCFullYear()}-Q${q}`
}

/** Same calendar month, one quarter prior — "2026-06-30" → "2026-03-31". */
function priorQuarterEnd(quarterEndIso: string): string {
  const d = new Date(quarterEndIso)
  return quarterEndFrom(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 3, 15)).toISOString())
}

export async function buildQuarterContext(
  fundId: string,
  quarterEndIso: string,
): Promise<QuarterContext> {
  const quarterEnd = quarterEndFrom(quarterEndIso)
  const quarterLabel = quarterLabelFrom(quarterEnd)
  const priorEnd = priorQuarterEnd(quarterEnd)

  const [rollup, list] = await Promise.all([
    getPortfolioRollup(fundId),
    listCompanies({ fundId, limit: 500 }),
  ])
  const companies = list.rows

  // Pull each company's KPI history once.  For each one we find the latest
  // snapshot at-or-before quarterEnd, and the latest at-or-before priorEnd.
  const enriched = await Promise.all(
    companies.map(async (c) => {
      const hist = await listKpis(c.id, 24)
      const latestKpi = hist.find((k) => k.month_end <= quarterEnd) ?? null
      const prevQuarterKpi = hist.find((k) => k.month_end <= priorEnd) ?? null
      return { company: c, latestKpi, prevQuarterKpi }
    }),
  )

  // Pre-compute a few highlights + watchlist items.  Cheap in TS, expensive
  // for the LLM to do reliably.
  const highlights: string[] = []
  const watchlist: string[] = []
  for (const { company, latestKpi, prevQuarterKpi } of enriched) {
    if (!latestKpi) continue
    // Revenue growth callout
    if (
      latestKpi.monthly_revenue != null
      && prevQuarterKpi?.monthly_revenue
      && prevQuarterKpi.monthly_revenue > 0
    ) {
      const growth = (latestKpi.monthly_revenue / prevQuarterKpi.monthly_revenue - 1)
      if (growth >= 0.5) {
        highlights.push(
          `${company.name}: revenue +${(growth * 100).toFixed(0)}% QoQ to ${shortUsd(latestKpi.monthly_revenue)}/mo`,
        )
      }
    }
    // Runway flag
    if (latestKpi.runway_months != null && latestKpi.runway_months <= 6) {
      watchlist.push(
        `${company.name}: runway ${latestKpi.runway_months} mo (status: ${company.status})`,
      )
    }
    // Headcount growth callout
    if (
      latestKpi.headcount
      && prevQuarterKpi?.headcount
      && latestKpi.headcount - prevQuarterKpi.headcount >= 5
    ) {
      highlights.push(
        `${company.name}: hired ${latestKpi.headcount - prevQuarterKpi.headcount} people QoQ`,
      )
    }
  }

  return {
    fundId, quarterEnd, quarterLabel,
    rollup,
    companies: enriched,
    highlights,
    watchlist,
  }
}

// ── prompt construction + generation ────────────────────────────────────

export interface GeneratedLetter {
  contentMd: string
  summary: string
  generationMs: number
  model: string | null
}

const USD_OPTS: Intl.NumberFormatOptions = { style: "currency", currency: "USD", maximumFractionDigits: 0 }

function shortUsd(n: number | null | undefined): string {
  if (n == null) return "—"
  const abs = Math.abs(n)
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return new Intl.NumberFormat("en-US", USD_OPTS).format(n)
}

function companyLine(c: QuarterContext["companies"][0]): string {
  const k = c.latestKpi
  const prev = c.prevQuarterKpi
  const bits: string[] = []
  bits.push(`- **${c.company.name}** [${c.company.status}, ${c.company.stage ?? "stage n/a"}, ${c.company.sector ?? "sector n/a"}]`)
  if (c.company.one_liner) bits.push(`  ${c.company.one_liner}`)
  if (c.company.ownership_pct != null) {
    bits.push(`  Ownership: ${(c.company.ownership_pct * 100).toFixed(1)}%`)
  }
  if (c.company.last_round_name && c.company.last_round_valuation != null) {
    bits.push(`  Last round: ${c.company.last_round_name} @ ${shortUsd(c.company.last_round_valuation)} (${c.company.last_round_at ?? "n/a"})`)
  }
  if (k) {
    const kpiBits: string[] = []
    if (k.monthly_revenue != null) {
      let s = `revenue ${shortUsd(k.monthly_revenue)}/mo`
      if (prev?.monthly_revenue && prev.monthly_revenue > 0) {
        const g = (k.monthly_revenue / prev.monthly_revenue - 1) * 100
        s += ` (${g >= 0 ? "+" : ""}${g.toFixed(0)}% QoQ)`
      }
      kpiBits.push(s)
    }
    if (k.cash_balance != null) kpiBits.push(`cash ${shortUsd(k.cash_balance)}`)
    if (k.runway_months != null) kpiBits.push(`runway ${k.runway_months}mo`)
    if (k.monthly_burn != null) kpiBits.push(`burn ${shortUsd(k.monthly_burn)}/mo`)
    if (k.headcount != null) kpiBits.push(`HC ${k.headcount}`)
    if (k.customers != null) kpiBits.push(`customers ${k.customers}`)
    if (k.gross_margin_pct != null) kpiBits.push(`GM ${(k.gross_margin_pct * 100).toFixed(0)}%`)
    if (kpiBits.length) bits.push(`  KPIs (${k.month_end}): ${kpiBits.join(" · ")}`)
    if (k.notes) bits.push(`  Notes: ${k.notes.slice(0, 280)}`)
  } else {
    bits.push(`  KPIs: not reported`)
  }
  return bits.join("\n")
}

function renderContextForPrompt(ctx: QuarterContext): string {
  const lines: string[] = []
  lines.push(`Fund: ${ctx.fundId.toUpperCase()}`)
  lines.push(`Quarter: ${ctx.quarterLabel} (ending ${ctx.quarterEnd})`)
  lines.push("")
  lines.push("Rollup:")
  lines.push(`- Companies: ${ctx.rollup.total} total (${ctx.rollup.active} active, ${ctx.rollup.on_watch} on watch, ${ctx.rollup.exited} exited, ${ctx.rollup.written_off} written off)`)
  lines.push(`- Total invested (active + on-watch): ${shortUsd(ctx.rollup.total_invested)}`)
  lines.push(`- Aggregate value at last round: ${shortUsd(ctx.rollup.total_value_at_last_round)}`)
  lines.push("")
  if (ctx.highlights.length) {
    lines.push("Pre-computed highlights (use these — don't fabricate alternatives):")
    ctx.highlights.forEach((h) => lines.push(`- ${h}`))
    lines.push("")
  }
  if (ctx.watchlist.length) {
    lines.push("Pre-computed watchlist:")
    ctx.watchlist.forEach((w) => lines.push(`- ${w}`))
    lines.push("")
  }
  lines.push(`Portfolio (${ctx.companies.length} companies):`)
  ctx.companies.forEach((c) => lines.push(companyLine(c)))
  return lines.join("\n")
}

/** Build the LLM prompt + call the deep-tier model. */
export async function generateLetterMarkdown(
  ctx: QuarterContext,
): Promise<GeneratedLetter> {
  const contextBlock = renderContextForPrompt(ctx)
  const prompt = `You are the managing partner of an investment fund writing the quarterly letter to your Limited Partners. Draft the letter for ${ctx.quarterLabel} based ONLY on the portfolio data provided below.

Tone & style
- Direct, candid, evidence-led. No marketing language, no superlatives ("incredible", "amazing", "thrilled"). LPs want signal.
- Plain prose. Short paragraphs (2-4 sentences). No em dashes (use commas, colons, periods, or arrows).
- Use specific numbers from the context. Never invent metrics, deal names, or company facts not in the context.
- When the context says "KPIs: not reported", say so plainly — don't paper over the gap.
- Quote the QoQ growth percentages exactly as provided in the highlights list when they appear there.

Structure (use Markdown headings exactly as shown)

# ${ctx.quarterLabel} — LP Quarterly Letter

## Executive summary
A single 3-5 sentence paragraph an LP could screenshot. Lead with the most material development of the quarter — a new investment, a portfolio milestone, a write-off, runway risk, an exit. Concrete numbers from the context. No throat-clearing.

## Fund highlights
Three to five bullets covering: aggregate portfolio movement (capital deployed, valuations at last round if material), new investments made (if any are evident from first_check dates falling inside the quarter), major status changes (exited / written_off / on_watch flips), and any cross-portfolio themes.

## Portfolio
For each ACTIVE and ON-WATCH company in the context, write one short paragraph (3-5 sentences). Order by the materiality of what happened in the quarter (biggest news first). Each paragraph must:
- name the company
- name the stage and sector
- cite the latest reported KPI line verbatim where numbers exist
- explain what the QoQ delta means in plain English (growing into scale, flat with cash burning, etc)
- flag any notes the founder provided

Skip exited and written-off companies in this section — they go in their own subsection below.

### Watchlist
List the companies in the "watchlist" pre-computed block above. For each, name the specific risk (runway, customer concentration, churn — whatever the data shows) and what the fund is doing about it. Be specific. Vague "monitoring closely" lines erode LP trust.

### Exits & write-downs
Only include this subsection if there are exited or written_off companies in the context. List them with status, last round info, and a one-line account of what happened.

## Fund operations
2-3 sentences: cash on hand, deployment pace vs. plan if inferrable, follow-on capacity. If the context doesn't have this data, write "Fund-level cash and deployment detail will be reported separately to the LP advisory committee" rather than fabricating a number.

## Looking ahead
2-3 sentences on what to expect next quarter, framed in terms of portfolio milestones the LPs should watch for (specific company names, specific upcoming rounds if mentioned in notes).

## Ask
Optional. Only include if the portfolio data suggests a specific ask — intros for an on-watch company, follow-on capacity, candidate referrals for a portfolio company hiring. Otherwise omit.

---

Length target: 1500-2500 words.

Return ONLY this strict JSON object — no prose, no fences:

{
  "summary": "<one-paragraph executive summary, 3-5 sentences, <=400 chars>",
  "contentMd": "<full markdown body of the letter starting with the H1>"
}

Portfolio data
==============

${contextBlock}`

  const started = Date.now()
  const raw = await generate(prompt, {
    task: "deep_research",          // deep tier — long-form synthesis
    maxTokens: 6000,
    temperature: 0.35,
    json: true,
  })
  const generationMs = Date.now() - started

  // Parse — be forgiving of code fences and a leading prose preamble.
  const parsed = (() => {
    if (!raw) return null
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim()
    try { return JSON.parse(cleaned) } catch {}
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (m) {
      try { return JSON.parse(m[0]) } catch {}
    }
    return null
  })()

  if (!parsed?.contentMd) {
    throw new Error("AI letter generation failed — model returned no usable content")
  }

  return {
    contentMd: String(parsed.contentMd).trim(),
    summary: String(parsed.summary ?? "").trim().slice(0, 600),
    generationMs,
    model: null,  // provider's reported model not threaded through generate() yet
  }
}

// ── persistence ──────────────────────────────────────────────────────────

export async function upsertReport(input: {
  fundId: string
  quarterEnd: string       // canonical last-of-quarter ISO
  contentMd: string
  summary: string
  kpisSnapshot: Record<string, any>
  generatedBy: string | null
  generatorModel?: string | null
  generationMs?: number | null
}): Promise<LpQuarterlyReport> {
  const quarterEnd = quarterEndFrom(input.quarterEnd)
  const quarterLabel = quarterLabelFrom(quarterEnd)
  const meta = JSON.stringify(input.kpisSnapshot ?? {})

  const rows = await sql`
    INSERT INTO lp_quarterly_reports (
      fund_id, quarter_end, quarter_label,
      content_md, summary, kpis_snapshot,
      status, generated_by, generator_model, generation_ms,
      created_at, updated_at
    ) VALUES (
      ${input.fundId}, ${quarterEnd}::date, ${quarterLabel},
      ${input.contentMd}, ${input.summary}, ${meta}::jsonb,
      'draft', ${input.generatedBy ?? null},
      ${input.generatorModel ?? null}, ${input.generationMs ?? null},
      NOW(), NOW()
    )
    ON CONFLICT (fund_id, quarter_end) DO UPDATE SET
      content_md      = EXCLUDED.content_md,
      summary         = EXCLUDED.summary,
      kpis_snapshot   = EXCLUDED.kpis_snapshot,
      -- regenerating a 'sent' report resets it to 'draft' so the manager
      -- can review again. archived reports stay archived.
      status          = CASE WHEN lp_quarterly_reports.status = 'archived'
                             THEN lp_quarterly_reports.status
                             ELSE 'draft' END,
      generated_by    = EXCLUDED.generated_by,
      generator_model = EXCLUDED.generator_model,
      generation_ms   = EXCLUDED.generation_ms,
      updated_at      = NOW()
    RETURNING *
  `
  return normalize(rows[0])
}

export async function listReports(fundId: string, limit = 40): Promise<LpQuarterlyReport[]> {
  const rows = await sql`
    SELECT * FROM lp_quarterly_reports
     WHERE fund_id = ${fundId}
     ORDER BY quarter_end DESC
     LIMIT ${limit}
  `
  return rows.map(normalize)
}

export async function getReportById(id: string): Promise<LpQuarterlyReport | null> {
  const rows = await sql`SELECT * FROM lp_quarterly_reports WHERE id = ${id} LIMIT 1`
  return rows[0] ? normalize(rows[0]) : null
}

export interface UpdateReportPatch {
  contentMd?: string | null
  summary?: string | null
  status?: "draft" | "reviewed" | "sent" | "archived"
  reviewedBy?: string | null
}

export async function updateReport(
  id: string,
  patch: UpdateReportPatch,
): Promise<LpQuarterlyReport | null> {
  const rows = await sql`
    UPDATE lp_quarterly_reports SET
      content_md  = COALESCE(${patch.contentMd ?? null}, content_md),
      summary     = COALESCE(${patch.summary ?? null}, summary),
      status      = COALESCE(${patch.status ?? null}, status),
      reviewed_by = COALESCE(${patch.reviewedBy ?? null}, reviewed_by),
      sent_at     = CASE
                      WHEN ${patch.status ?? null} = 'sent'
                       AND sent_at IS NULL THEN NOW()
                      ELSE sent_at
                    END,
      updated_at  = NOW()
    WHERE id = ${id}
    RETURNING *
  `
  return rows[0] ? normalize(rows[0]) : null
}

export async function deleteReport(id: string): Promise<boolean> {
  const rows = await sql`DELETE FROM lp_quarterly_reports WHERE id = ${id} RETURNING id`
  return rows.length > 0
}

function normalize(r: any): LpQuarterlyReport {
  return {
    id: r.id,
    fund_id: r.fund_id,
    quarter_end: toIsoDate(r.quarter_end) ?? "",
    quarter_label: r.quarter_label ?? "",
    content_md: r.content_md ?? null,
    summary: r.summary ?? null,
    kpis_snapshot: r.kpis_snapshot && typeof r.kpis_snapshot === "object" ? r.kpis_snapshot : {},
    status: (r.status ?? "draft") as LpQuarterlyReport["status"],
    sent_at: toIso(r.sent_at),
    reviewed_by: r.reviewed_by ?? null,
    generated_by: r.generated_by ?? null,
    generator_model: r.generator_model ?? null,
    generation_ms: r.generation_ms != null ? Number(r.generation_ms) : null,
    created_at: toIso(r.created_at) ?? new Date().toISOString(),
    updated_at: toIso(r.updated_at) ?? new Date().toISOString(),
  }
}
function toIso(v: any): string | null {
  if (!v) return null
  if (v instanceof Date) return v.toISOString()
  return String(v)
}
function toIsoDate(v: any): string | null {
  const iso = toIso(v); return iso ? iso.slice(0, 10) : null
}
