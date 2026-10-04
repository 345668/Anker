/**
 * Fund inbound intake: persistence and the processing pipeline (docs/architecture/39).
 * received -> assessing -> assessed, with the deal created in the fund's pipeline carrying the engine result.
 */
import "server-only"
import { sql } from "@/lib/db"
import { configSchema, defaultConfig, type EngineResult, type IntakeConfig, type Submission } from "./model"
import { assess } from "./engine"
import { MAX_AUTO_READ_BYTES } from "@/lib/uploads/limits"
import { createDeal, hasDealTables, upsertEvaluation } from "@/lib/portfolio/deal-pipeline"
import { DEAL_CRITERIA, type ScoreMap } from "@/lib/portfolio/deal-constants"

export interface StoredConfig { config: IntakeConfig; version: number; exists: boolean }

const asObj = (v: unknown): any => (typeof v === "string" ? (() => { try { return JSON.parse(v) } catch { return {} } })() : v ?? {})

export async function getConfig(fundId: string): Promise<StoredConfig> {
  const rows = (await sql`SELECT * FROM fund_intake_configs WHERE fund_id = ${fundId} LIMIT 1`) as any[]
  const r = rows[0]
  if (!r) return { config: defaultConfig(), version: 0, exists: false }
  const parsed = configSchema.safeParse({
    enabled: r.enabled, headline: r.headline ?? "", intro: r.intro ?? "", thesis: r.thesis ?? "", instructions: r.instructions ?? "",
    gates: asObj(r.gates), rubric: Array.isArray(asObj(r.rubric)) && asObj(r.rubric).length ? asObj(r.rubric) : undefined,
    thresholds: asObj(r.thresholds), form: asObj(r.form),
  })
  return { config: parsed.success ? parsed.data : defaultConfig(), version: Number(r.version), exists: true }
}

export async function saveConfig(fundId: string, input: unknown, userId: string | null): Promise<StoredConfig> {
  const config = configSchema.parse(input)
  await sql`
    INSERT INTO fund_intake_configs (fund_id, enabled, headline, intro, thesis, instructions, gates, rubric, thresholds, form, version, updated_by)
    VALUES (${fundId}, ${config.enabled}, ${config.headline}, ${config.intro}, ${config.thesis}, ${config.instructions},
      ${JSON.stringify(config.gates)}::jsonb, ${JSON.stringify(config.rubric)}::jsonb, ${JSON.stringify(config.thresholds)}::jsonb, ${JSON.stringify(config.form)}::jsonb, 1, ${userId})
    ON CONFLICT (fund_id) DO UPDATE SET enabled = EXCLUDED.enabled, headline = EXCLUDED.headline, intro = EXCLUDED.intro,
      thesis = EXCLUDED.thesis, instructions = EXCLUDED.instructions, gates = EXCLUDED.gates, rubric = EXCLUDED.rubric,
      thresholds = EXCLUDED.thresholds, form = EXCLUDED.form, version = fund_intake_configs.version + 1,
      updated_by = EXCLUDED.updated_by, updated_at = now()`
  return getConfig(fundId)
}

/** What the public form may see: the fund's name, the headline, the form shape. Never the thesis, gates or rubric. */
export async function getPublicIntake(slug: string) {
  const funds = (await sql`SELECT id, name, slug FROM funds WHERE slug = ${slug} LIMIT 1`) as any[]
  if (!funds[0]) return null
  const { config } = await getConfig(String(funds[0].id))
  if (!config.enabled) return null
  return { fundId: String(funds[0].id), fundName: String(funds[0].name), slug: String(funds[0].slug), headline: config.headline, intro: config.intro, form: config.form }
}

export interface NewSubmission {
  fundId: string; publicRef: string; companyName: string; website?: string | null; oneLiner?: string | null
  contactName: string; contactEmail: string; answers: Record<string, unknown>; deckUrl?: string | null; ipHash?: string | null
}

export async function createSubmission(s: NewSubmission): Promise<string> {
  const rows = (await sql`
    INSERT INTO intake_submissions (fund_id, public_ref, company_name, website, one_liner, contact_name, contact_email, answers, deck_url, ip_hash)
    VALUES (${s.fundId}, ${s.publicRef}, ${s.companyName}, ${s.website ?? null}, ${s.oneLiner ?? null}, ${s.contactName}, ${s.contactEmail.toLowerCase()},
      ${JSON.stringify(s.answers)}::jsonb, ${s.deckUrl ?? null}, ${s.ipHash ?? null})
    RETURNING id`) as any[]
  return String(rows[0].id)
}

const num = (v: unknown): number | null => { const n = Number(String(v ?? "").replace(/[^0-9.]/g, "")); return String(v ?? "").trim() && Number.isFinite(n) ? n : null }
const list = (v: unknown): string[] => String(v ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 20)

export function toSubmission(row: any, deckSummary: string | null): Submission {
  const a = asObj(row.answers) as Record<string, any>
  const text: Record<string, string> = {}
  for (const [k, v] of Object.entries(a)) if (typeof v === "string" && !["stage", "sectors", "location", "raise_amount", "cheque_ask", "terms_accepted"].includes(k)) text[k] = v
  return {
    companyName: row.company_name, website: row.website, oneLiner: row.one_liner, stage: a.stage || null, sectors: list(a.sectors),
    location: a.location || null, raiseAmount: num(a.raise_amount), chequeAsk: num(a.cheque_ask), answers: text, deckSummary,
  }
}

/** Best-effort deck read. A failure here is not a failure of the submission. */
async function readDeck(deckUrl: string | null, name: string, email: string): Promise<string | null> {
  if (!deckUrl) return null
  try {
    const { readBlobBytes } = await import("@/lib/campaign/util")
    const { extractStartupProfile } = await import("@/lib/matching/v2/document-extractor")
    const bytes = await readBlobBytes(deckUrl)
    if (!bytes) return null
    if (bytes.length > MAX_AUTO_READ_BYTES) { console.warn(`[intake] deck of ${bytes.length} bytes is too large to read automatically; assessing from the form answers`); return null }
    const e = await extractStartupProfile({ name: deckUrl.split("/").pop() || "deck.pdf", contentType: "application/pdf", base64: bytes.toString("base64") }, [], { startupName: name, founderEmail: email })
    return e.pitchDeckSummary || null
  } catch (err) {
    console.warn("[intake] deck read failed:", (err as Error).message)
    return null
  }
}

export interface ProcessOutcome { id: string; outcome: "assessed" | "skipped" | "failed"; category?: string; score?: number | null; dealId?: string; detail?: string }

/** Idempotent: only a `received` row is claimed, so an overlapping sweep or a re-run never double-processes. */
export async function processSubmission(id: string): Promise<ProcessOutcome> {
  const claimed = (await sql`UPDATE intake_submissions SET status = 'assessing', attempts = attempts + 1, updated_at = now() WHERE id = ${id} AND status = 'received' RETURNING *`) as any[]
  const row = claimed[0]
  if (!row) return { id, outcome: "skipped", detail: "not in 'received' state" }
  try {
    const { config, version } = await getConfig(String(row.fund_id))
    const summary = await readDeck(row.deck_url, row.company_name, row.contact_email)
    const sub = toSubmission(row, summary)
    const result = await assess(config, version, sub)
    const dealId = await landDeal(row, sub, result)
    await sql`UPDATE intake_submissions SET status = 'assessed', category = ${result.category}, score = ${result.score}, result = ${JSON.stringify(result)}::jsonb,
      config_version = ${version}, deal_id = ${dealId}, last_error = NULL, updated_at = now() WHERE id = ${id}`
    return { id, outcome: "assessed", category: result.category, score: result.score, dealId }
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 400)
    // Back to received for a retry (the sweep caps attempts); the applicant's submission is never lost.
    await sql`UPDATE intake_submissions SET status = ${row.attempts >= 3 ? "failed" : "received"}, last_error = ${msg}, updated_at = now() WHERE id = ${id}`
    return { id, outcome: "failed", detail: msg }
  }
}

async function landDeal(row: any, sub: Submission, result: EngineResult): Promise<string> {
  if (!(await hasDealTables())) throw new Error("Deal tables are not available")
  // A re-run updates the deal it created, it does not create another.
  const existing = (await sql`SELECT deal_id FROM intake_submissions WHERE id = ${row.id}`) as any[]
  let dealId: string | null = existing[0]?.deal_id ?? null
  if (!dealId) {
    const deal = await createDeal({
      fundId: String(row.fund_id), companyName: row.company_name, website: row.website, oneLiner: row.one_liner,
      sector: sub.sectors?.[0] ?? null, geography: sub.location ?? null, roundName: sub.stage ?? null, raiseAmount: sub.raiseAmount ?? null,
      proposedCheck: sub.chequeAsk ?? null, source: "inbound: fund intake form", deckUrl: row.deck_url, contactName: row.contact_name,
      contactEmail: row.contact_email, submittedVia: "public_form", createdBy: row.contact_email,
      notes: sub.answers.ask || sub.answers.problem || null,
    })
    dealId = deal.id
  }
  const meta = { engine: result, intake: { submissionId: row.id, publicRef: row.public_ref, answers: asObj(row.answers), at: new Date().toISOString() } }
  await sql`UPDATE deal_opportunities SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(meta)}::jsonb, updated_at = now() WHERE id = ${dealId}`
  // The engine's dimension scores that match the standard scorecard also fill it, so partners start from a draft.
  const keys = new Set(DEAL_CRITERIA.map((c) => c.key))
  const scores: ScoreMap = {}
  for (const d of result.dimensions) if (keys.has(d.key)) scores[d.key] = { score: d.score, note: d.note }
  if (Object.keys(scores).length) await upsertEvaluation(dealId, scores, result.summary || null, "intake engine")
  return dealId
}

/** Re-run the engine on an already-assessed submission (after the fund changed its thesis, say). */
export async function rerunSubmission(id: string, fundId: string): Promise<ProcessOutcome> {
  const r = (await sql`UPDATE intake_submissions SET status = 'received', attempts = 0, updated_at = now() WHERE id = ${id} AND fund_id = ${fundId} AND status IN ('assessed','failed') RETURNING id`) as any[]
  if (!r.length) return { id, outcome: "skipped", detail: "not found or still being assessed" }
  return processSubmission(id)
}

/** Sweep: anything left received, and anything stuck assessing for ten minutes (a crashed run). */
export async function sweepSubmissions(limit = 10): Promise<ProcessOutcome[]> {
  await sql`UPDATE intake_submissions SET status = 'received', updated_at = now() WHERE status = 'assessing' AND updated_at < now() - interval '10 minutes'`
  const rows = (await sql`SELECT id FROM intake_submissions WHERE status = 'received' AND attempts < 3 ORDER BY created_at ASC LIMIT ${limit}`) as any[]
  const out: ProcessOutcome[] = []
  for (const r of rows) out.push(await processSubmission(String(r.id)))
  return out
}

export async function listSubmissions(fundId: string, limit = 100) {
  return (await sql`SELECT id, public_ref, company_name, contact_name, contact_email, status, category, score, deal_id, created_at, last_error
    FROM intake_submissions WHERE fund_id = ${fundId} ORDER BY created_at DESC LIMIT ${limit}`) as any[]
}
