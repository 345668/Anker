import "server-only"
import { sql } from "@/lib/db"
import { EntitlementRefusal, getEffective, usageThisMonth } from "@/lib/entitlements"
import { UNITS, unitPrice } from "./index"

/**
 * One check in front of every metered capability (docs/architecture/58 section 5): is there room left in this month's AI allowance for what is about to run?
 * The estimate is the quantity times the unit's list price, so one big job cannot overshoot the allowance by a lot. A null limit is unlimited.
 */
export type Capability = "chat" | "speech_in" | "speech_out" | "documents" | "embeddings" | "image" | "video"
const CAPABILITY_UNIT: Record<Exclude<Capability, "chat">, (typeof UNITS)[number]> = { speech_in: "asr_second", speech_out: "tts_char", documents: "vision_doc", embeddings: "embed_token", image: "image", video: "video_second" }
/** A chat turn has no unit; this is a deliberately small flat estimate (about two thirds of a cent). */
export const CHAT_ESTIMATE_USD = 0.006

const WHAT: Record<Capability, string> = {
  chat: "AI answers", speech_in: "listening to voice notes", speech_out: "spoken replies", documents: "reading documents", embeddings: "search indexing", image: "image generation", video: "video generation",
}

export async function estimateUsd(cap: Capability, qty = 1): Promise<number> {
  if (cap === "chat") return CHAT_ESTIMATE_USD * Math.max(1, qty)
  return (await unitPrice(CAPABILITY_UNIT[cap]) ?? 0) * Math.max(0, qty)
}

export interface Allowance { limit: number | null; used: number; remaining: number | null; pct: number | null }
export async function allowanceOf(orgId: string): Promise<Allowance> {
  const e = await getEffective(orgId)
  const raw = e.limits.ai_spend_usd_month
  const limit = raw === null || raw === undefined || raw < 0 ? null : Number(raw)
  const used = (await usageThisMonth(orgId)).aiSpendUsd
  return { limit, used, remaining: limit === null ? null : Math.max(0, limit - used), pct: limit === null || limit === 0 ? null : used / limit }
}

/** Says why not, in plain words, or null when there is room. Never throws. */
export async function whyNot(orgId: string, cap: Capability, qty = 1): Promise<string | null> {
  try {
    const a = await allowanceOf(orgId)
    if (a.limit === null) return null
    const est = await estimateUsd(cap, qty)
    if (a.used + est <= a.limit) return null
    return a.used >= a.limit
      ? `Your workspace has used this month's AI allowance, so ${WHAT[cap]} is paused until it resets next month. An owner can ask support to raise it.`
      : `This would use more than what is left of this month's AI allowance, so ${WHAT[cap]} is paused for now. A shorter request may still fit.`
  } catch { return null }      // a failed check must not stop the work; the monthly limit still applies elsewhere
}

/** Throws a 402 refusal when there is no room. */
export async function assertCan(orgId: string, cap: Capability, qty = 1): Promise<void> {
  const why = await whyNot(orgId, cap, qty)
  if (why) throw new EntitlementRefusal("limit", why)
}

/** The months' usage by area, for the workspace's usage page. Only totals and names of areas: no content. */
export async function usageByArea(orgId: string): Promise<Array<{ area: string; usd: number; detail: string }>> {
  const chat = (await sql`SELECT COALESCE(task, 'other') AS task, count(*)::int AS n, COALESCE(sum(cost_usd), 0)::float AS usd FROM ai_calls WHERE workspace_id = ${orgId} AND created_at >= date_trunc('month', now()) GROUP BY 1 ORDER BY usd DESC`) as any[]
  const events = (await sql`SELECT unit, count(*)::int AS n, sum(qty)::float AS qty, COALESCE(sum(cost_usd), 0)::float AS usd FROM usage_events WHERE org_id = ${orgId} AND created_at >= date_trunc('month', now()) GROUP BY 1 ORDER BY usd DESC`) as any[]
  const LABEL: Record<string, string> = { asr_second: "Listening to voice notes", tts_char: "Spoken replies", embed_token: "Search indexing", vision_doc: "Reading documents", vision_page: "Reading document pages", image: "Generated images", video_second: "Generated video" }
  const QTY: Record<string, string> = { asr_second: "seconds", tts_char: "characters", embed_token: "tokens", vision_doc: "documents", vision_page: "pages", image: "images", video_second: "seconds" }
  return [
    ...chat.map((r) => ({ area: `AI: ${String(r.task).replace(/_/g, " ")}`, usd: Number(r.usd), detail: `${r.n} calls` })),
    ...events.map((r) => ({ area: LABEL[r.unit] ?? r.unit, usd: Number(r.usd), detail: `${Math.round(Number(r.qty)).toLocaleString("en")} ${QTY[r.unit] ?? "units"}` })),
  ].sort((a, b) => b.usd - a.usd)
}
