/**
 * Call / Meeting Intelligence — analyze an investor call transcript.
 * Extracts summary, sentiment, interest, objections (+ suggested responses),
 * next steps, key questions, a recommended CRM stage, and a draft follow-up.
 * Routes through lib/ai/provider.ts (Anthropic / Ollama / heuristic fallback).
 */
import "server-only"
import { generate, resolveProvider } from "@/lib/ai/provider"

export interface CallContext {
  investorName?: string
  investorFirm?: string
  founder?: { companyName: string; oneLiner: string; calendarUrl?: string }
}

export interface CallObjection { objection: string; response: string }

export interface CallAnalysis {
  summary: string
  sentiment: "positive" | "neutral" | "negative" | "mixed"
  interestLevel: "high" | "medium" | "low"
  objections: CallObjection[]
  nextSteps: string[]
  keyQuestions: string[]
  draftFollowup: string
  recommendedStage: string
  notes?: string
  generatedBy: string
}

const STAGE_FOR_INTEREST: Record<string, string> = { high: "meeting", medium: "responded", low: "responded" }

export async function analyzeCall(transcript: string, ctx: CallContext = {}): Promise<CallAnalysis> {
  const provider = await resolveProvider()
  const generatedBy =
    provider === "anthropic" ? "anthropic:call" : provider === "ollama" ? "ollama:call" : "heuristic:call"
  const text = (transcript || "").trim()
  if (!text) return empty(generatedBy)
  if (provider === "none") return heuristic(text, ctx, generatedBy)

  let raw: string
  try {
    raw = await generate(buildPrompt(text, ctx), { maxTokens: 1000, temperature: 0.4, json: true, task: "reply_classify" })
  } catch {
    return heuristic(text, ctx, generatedBy)
  }
  const p = parseJson(raw)
  if (!p) return heuristic(text, ctx, generatedBy)

  const interest = norm(p.interest_level, ["high", "medium", "low"], "medium") as CallAnalysis["interestLevel"]
  return {
    summary: str(p.summary),
    sentiment: norm(p.sentiment, ["positive", "neutral", "negative", "mixed"], "neutral") as CallAnalysis["sentiment"],
    interestLevel: interest,
    objections: arr(p.objections).map((o: any) => ({ objection: str(o?.objection ?? o), response: str(o?.response) })).filter((o) => o.objection),
    nextSteps: arr(p.next_steps).map(str).filter(Boolean).slice(0, 8),
    keyQuestions: arr(p.key_questions).map(str).filter(Boolean).slice(0, 8),
    draftFollowup: str(p.draft_followup),
    recommendedStage: str(p.recommended_stage) || STAGE_FOR_INTEREST[interest] || "responded",
    notes: p.notes ? str(p.notes) : undefined,
    generatedBy,
  }
}

// ── prompt + parsing ─────────────────────────────────────────────────────────
function buildPrompt(transcript: string, ctx: CallContext): string {
  const f = ctx.founder
  const cal = f?.calendarUrl ?? "[calendar link]"
  return `You are an investor-relations analyst. Analyze this transcript of a fundraising call${
    ctx.investorName ? ` with ${ctx.investorName}${ctx.investorFirm ? ` (${ctx.investorFirm})` : ""}` : ""
  }.

${f ? `FOUNDER CONTEXT\n  Company: ${f.companyName}\n  One-liner: ${f.oneLiner}\n  Calendar: ${cal}\n` : ""}
TRANSCRIPT:
"""
${transcript.slice(0, 12000)}
"""

Return ONLY this JSON (no markdown):
{
  "summary": "<3-4 sentence summary of what happened and where it stands>",
  "sentiment": "positive" | "neutral" | "negative" | "mixed",
  "interest_level": "high" | "medium" | "low",
  "objections": [{"objection": "<what they pushed back on>", "response": "<a crisp suggested response>"}],
  "next_steps": ["<concrete next step>", "..."],
  "key_questions": ["<important question the investor asked>", "..."],
  "recommended_stage": "meeting" | "responded" | "passed",
  "draft_followup": "<a short, specific follow-up email/message under 900 chars. Reference one concrete point from the call and include ONE next step (a calendar link, a doc, an answer). No filler, no em dashes.>",
  "notes": "<one line on the signals you used>"
}`
}

function parseJson(raw: string): any | null {
  if (!raw) return null
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim()
  try { return JSON.parse(cleaned) } catch {}
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) } catch {} }
  return null
}

const str = (v: any) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v)).slice(0, 4000)
const arr = (v: any) => (Array.isArray(v) ? v : [])
const norm = (v: any, allowed: string[], fb: string) => {
  const s = String(v ?? "").toLowerCase().trim()
  return allowed.includes(s) ? s : fb
}

function empty(generatedBy: string): CallAnalysis {
  return { summary: "", sentiment: "neutral", interestLevel: "medium", objections: [], nextSteps: [], keyQuestions: [], draftFollowup: "", recommendedStage: "responded", generatedBy }
}

// ── heuristic fallback (no AI) ───────────────────────────────────────────────
function heuristic(transcript: string, ctx: CallContext, generatedBy: string): CallAnalysis {
  const t = transcript.toLowerCase()
  let sentiment: CallAnalysis["sentiment"] = "neutral"
  let interest: CallAnalysis["interestLevel"] = "medium"
  if (/\b(excited|love it|impressive|let'?s move|term sheet|send.*docs|next meeting|partner meeting)\b/.test(t)) { sentiment = "positive"; interest = "high" }
  else if (/\b(not a fit|pass|too early|not for us|circle back next year|not the right)\b/.test(t)) { sentiment = "negative"; interest = "low" }
  const nextSteps = [] as string[]
  if (/\bdeck|data ?room|financials|model\b/.test(t)) nextSteps.push("Share the requested materials (deck / data room / model).")
  if (/\bpartner|team|next (call|meeting)\b/.test(t)) nextSteps.push("Propose a follow-up with the wider team.")
  const cal = ctx.founder?.calendarUrl ?? "[calendar link]"
  return {
    summary: "Heuristic summary (AI unavailable): captured the transcript; review manually for detail.",
    sentiment, interestLevel: interest, objections: [],
    nextSteps: nextSteps.length ? nextSteps : ["Send a short recap and propose the next step."],
    keyQuestions: [],
    draftFollowup: `Thanks for the time today. Following up with the next step we discussed. ${cal}`,
    recommendedStage: STAGE_FOR_INTEREST[interest] || "responded",
    notes: "keyword heuristic",
    generatedBy,
  }
}
