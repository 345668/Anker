/**
 * Investor Update Builder — compose a founder→investor update and recommend
 * recipients. AI via lib/ai/provider.ts; recipients from the CRM.
 */
import "server-only"
import { sql } from "@/lib/db"
import { generate, resolveProvider } from "@/lib/ai/provider"
import { founderContextForUser } from "@/lib/outreach/reply-actions"

export interface UpdateMetric { label: string; value: string }
export interface DraftedUpdate { title: string; body: string; asks: string; metrics: UpdateMetric[]; generatedBy: string }

export async function draftUpdate(
  userId: string,
  input: { period?: string; highlights?: string; metrics?: UpdateMetric[] },
): Promise<DraftedUpdate> {
  const provider = await resolveProvider()
  const generatedBy = provider === "anthropic" ? "anthropic:update" : provider === "ollama" ? "ollama:update" : "heuristic:update"
  const founder = (await founderContextForUser(userId).catch(() => null)) ?? undefined
  const period = input.period || new Date().toLocaleString("en-US", { month: "long", year: "numeric" })
  const metrics = (input.metrics ?? []).filter((m) => m.label && m.value)

  if (provider === "none") return heuristic(founder?.companyName, period, input.highlights, metrics, generatedBy)

  const prompt = `You are writing a concise monthly investor update for ${founder?.companyName ?? "the company"}${
    founder ? ` (${founder.oneLiner})` : ""
  } for the period ${period}.

FOUNDER HIGHLIGHTS (raw notes):
${input.highlights?.trim() || "(none provided — keep it brief and honest)"}

${metrics.length ? `METRICS:\n${metrics.map((m) => `  ${m.label}: ${m.value}`).join("\n")}\n` : ""}
Write a warm, direct update (investors are busy). Return ONLY this JSON (no markdown):
{
  "title": "<short subject line, e.g. '${founder?.companyName ?? "Company"} — ${period} update'>",
  "body": "<the update body, 150-300 words, in short paragraphs: a one-line TL;DR, what shipped/wins, metrics in prose, lowlights honestly, then what's next. No filler, no em dashes.>",
  "asks": "<one or two specific asks: intros, hires, feedback>"
}`
  let raw: string
  try { raw = await generate(prompt, { maxTokens: 900, temperature: 0.5, json: true, task: "reply_classify" }) }
  catch { return heuristic(founder?.companyName, period, input.highlights, metrics, generatedBy) }
  const p = parse(raw)
  if (!p) return heuristic(founder?.companyName, period, input.highlights, metrics, generatedBy)
  return {
    title: String(p.title || `${founder?.companyName ?? "Company"} — ${period} update`).slice(0, 200),
    body: String(p.body || "").slice(0, 8000),
    asks: String(p.asks || "").slice(0, 1000),
    metrics, generatedBy,
  }
}

/** Recommend recipients from the CRM: engaged/interested investors with an email. */
export async function recommendRecipients(userId: string): Promise<{ crmEntryId: string; name: string; email: string | null; stage: string | null }[]> {
  const rows = (await sql`
    SELECT id, display_name, display_email, stage
    FROM crm_entries
    WHERE user_id = ${userId}
      AND stage IN ('meeting','responded','committed','interested','contacted','term-sheet','due-diligence')
    ORDER BY last_contacted_at DESC NULLS LAST
    LIMIT 200
  `) as any[]
  return rows.map((r) => ({ crmEntryId: r.id, name: r.display_name, email: r.display_email ?? null, stage: r.stage ?? null }))
}

function parse(raw: string): any | null {
  const c = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim()
  try { return JSON.parse(c) } catch {}
  const m = c.match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]) } catch {} }
  return null
}

function heuristic(company: string | undefined, period: string, highlights: string | undefined, metrics: UpdateMetric[], generatedBy: string): DraftedUpdate {
  const co = company ?? "We"
  const body = [
    `${period} update from ${co}.`,
    highlights?.trim() || "Steady progress this month across product and fundraising.",
    metrics.length ? metrics.map((m) => `${m.label}: ${m.value}`).join(" · ") : "",
    "What's next: keep shipping and closing the round.",
  ].filter(Boolean).join("\n\n")
  return { title: `${co} — ${period} update`, body, asks: "Warm intros to aligned investors are always welcome.", metrics, generatedBy }
}
