/**
 * Contract analyzer — clause extraction + redline-vs-playbook.
 *
 * The model reads the contract against the playbook (lib/contracts/playbook) and returns,
 * per clause: whether it's present, its position (standard / deviation / missing), a
 * plain-English finding, and a suggested redline. The **risk score is computed by this
 * code** from the playbook weights + the flagged severities — not by the model — so the
 * playbook defines risk and the review is reproducible in how it aggregates.
 *
 * Grounded, not authoritative: this is a first-pass review to focus a lawyer, not legal
 * advice or a substitute for counsel.
 */
import { generate } from "@/lib/ai/provider"
import { PLAYBOOK, PLAYBOOK_BY_ID, playbookPromptBlock, type PlaybookClause } from "./playbook"

export type ClausePosition = "standard" | "deviation" | "missing" | "not_applicable"
export type Severity = "low" | "medium" | "high"

export interface ClauseFinding {
  id: string
  label: string
  present: boolean
  position: ClausePosition
  severity: Severity | null
  /** Plain-English summary of what the contract says (or that it's silent). */
  finding: string
  /** Suggested redline / ask, when it deviates or is missing. */
  suggestedRedline: string | null
  /** Deterministic risk contribution (playbook weight × severity), 0 when standard/NA. */
  riskPoints: number
}

export interface ContractAnalysis {
  ok: boolean
  error?: string
  contractType?: string
  /** 0–100, computed by this engine from the playbook weights + severities. */
  riskScore: number
  riskLevel: "low" | "medium" | "high"
  deviations: number
  missing: number
  findings: ClauseFinding[]
  /** LLM-drafted executive summary (narrative only — the score is engine-computed). */
  summary: string
}

const SEVERITY_FACTOR: Record<Severity, number> = { low: 0.34, medium: 0.67, high: 1 }
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + " …[truncated]" : s)

function riskPointsFor(clause: PlaybookClause, position: ClausePosition, severity: Severity | null): number {
  if (position === "standard" || position === "not_applicable") return 0
  // Missing a clause counts as a medium deviation unless the model rated it.
  const sev: Severity = severity ?? (position === "missing" ? "medium" : "medium")
  return Math.round(clause.weight * SEVERITY_FACTOR[sev] * 100) / 100
}

/** Analyze a contract's text against the playbook. Deterministic scoring, LLM analysis. */
export async function analyzeContract(input: { text: string; contractType?: string }): Promise<ContractAnalysis> {
  const text = String(input.text ?? "").trim()
  if (!text) return empty("Provide the contract text to analyze.")
  if (text.length < 120) return empty("That's too short to analyze — paste the full contract text.")

  const prompt =
    `You are a contract reviewer. Review the CONTRACT below against the PLAYBOOK and return ONLY JSON.\n\n` +
    `PLAYBOOK (clause id, standard position, red flags, weight):\n${playbookPromptBlock()}\n\n` +
    `Return JSON: {"contractType":"<best guess: NDA|MSA|SAFE|Subscription|Side Letter|Term Sheet|Other>",` +
    `"summary":"<=3 sentences on the overall posture and top risks",` +
    `"clauses":[{"id":"<playbook id>","present":true|false,` +
    `"position":"standard|deviation|missing|not_applicable",` +
    `"severity":"low|medium|high"|null,"finding":"<what the contract says, <=30 words>",` +
    `"suggestedRedline":"<the ask/redline, <=30 words, or null if standard>"}]}\n` +
    `Include EVERY playbook id exactly once. Use "missing" if the contract is silent on it, "not_applicable" if it can't apply to this contract type. severity null only when position is standard or not_applicable.\n\n` +
    `CONTRACT:\n${clip(text, 12000)}`

  let raw = ""
  try {
    raw = await generate(prompt, { task: "deep_research" as any, json: true, maxTokens: 1800, temperature: 0.2 })
  } catch (e: any) {
    return empty(`AI review failed: ${e?.message ?? "provider error"}`)
  }
  if (!raw || !raw.trim()) return empty("The AI provider is not available (no model configured).")

  let parsed: any
  try { parsed = JSON.parse(raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()) }
  catch { return empty("Could not parse the AI review output.") }

  const scored = scoreClauses(Array.isArray(parsed?.clauses) ? parsed.clauses : [])
  return {
    ok: true,
    contractType: input.contractType || (parsed?.contractType ? String(parsed.contractType) : undefined),
    ...scored,
    summary: clip(String(parsed?.summary ?? ""), 600),
  }
}

/**
 * Deterministic scoring core (exported for testing): map the model's per-clause output
 * onto the full playbook and compute the risk score from the playbook weights. The
 * engine owns the clause set and the score — the model only supplies analysis text.
 */
export function scoreClauses(rawClauses: any[]): { riskScore: number; riskLevel: "low" | "medium" | "high"; deviations: number; missing: number; findings: ClauseFinding[] } {
  const byId = new Map<string, any>()
  for (const c of rawClauses) if (c?.id) byId.set(String(c.id), c)

  const findings: ClauseFinding[] = PLAYBOOK.map((clause) => {
    const c = byId.get(clause.id)
    const position: ClausePosition = normalizePosition(c?.position, c?.present)
    const severity = normalizeSeverity(c?.severity, position)
    const riskPoints = riskPointsFor(clause, position, severity)
    return {
      id: clause.id, label: clause.label,
      present: position !== "missing",
      position, severity,
      finding: clip(String(c?.finding ?? (position === "missing" ? "The contract is silent on this." : "—")), 240),
      suggestedRedline: c?.suggestedRedline ? clip(String(c.suggestedRedline), 240) : null,
      riskPoints,
    }
  })

  const maxPossible = PLAYBOOK.reduce((s, c) => s + c.weight, 0) // every clause a high-severity deviation
  const points = findings.reduce((s, f) => s + f.riskPoints, 0)
  const riskScore = Math.min(100, Math.round((points / maxPossible) * 100))
  const riskLevel: "low" | "medium" | "high" = riskScore >= 50 ? "high" : riskScore >= 25 ? "medium" : "low"

  return {
    riskScore, riskLevel,
    deviations: findings.filter((f) => f.position === "deviation").length,
    missing: findings.filter((f) => f.position === "missing").length,
    findings,
  }
}

function normalizePosition(p: unknown, present: unknown): ClausePosition {
  const s = String(p ?? "").toLowerCase()
  if (s === "standard" || s === "deviation" || s === "missing" || s === "not_applicable") return s
  if (present === false) return "missing"
  return "standard"
}
function normalizeSeverity(sv: unknown, position: ClausePosition): Severity | null {
  if (position === "standard" || position === "not_applicable") return null
  const s = String(sv ?? "").toLowerCase()
  return s === "low" || s === "medium" || s === "high" ? s : "medium"
}

function empty(error: string): ContractAnalysis {
  return { ok: false, error, riskScore: 0, riskLevel: "low", deviations: 0, missing: 0, findings: [], summary: "" }
}
