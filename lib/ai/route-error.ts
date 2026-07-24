/**
 * Shared AI-route error surface.
 *
 * Every AI-backed route used to fail the same opaque way: an empty
 * completion became a generic "model returned no usable content" 500, and
 * the operator had no idea whether the cause was a missing key, an admin-
 * disabled task, a provider 429, or a safety block. `7a7eeab` fixed that for
 * the newsroom-draft route by reading the concrete reason off
 * generateDetailed() and appending an actionable hint. This module lifts
 * that pattern out so every AI route can share one code path — so a failure
 * anywhere names the provider, the cause, and where to fix it.
 *
 * Usage (after a generateDetailed() call whose .text came back empty or
 * unparseable):
 *
 *   const res = await generateDetailed(prompt, { task: "deck_critique", ... })
 *   const parsed = parseJson(res.text)
 *   if (!parsed?.content) return aiErrorResponse(res, { task: "deck_critique" })
 */
import { NextResponse } from "next/server"
import type { GenerateResult } from "./provider"

/**
 * Turn a provider failure `reason` into a one-line, actionable hint that
 * names where to fix it. Returns "" when the reason isn't one we recognise
 * (the reason itself is still surfaced by the caller).
 */
export function aiErrorHint(reason: string, task?: string): string {
  if (/no ai provider|no text|no content|missing key|add a key/i.test(reason))
    return " Add a working AI key in Settings → API Keys."
  if (/disabled by admin|task .* disabled/i.test(reason))
    return task
      ? ` Enable the '${task}' task in Settings → AI.`
      : " Enable this AI task in Settings → AI."
  if (/429|quota|rate.?limit|too many requests/i.test(reason))
    return " The AI provider is rate-limited — wait a moment and retry."
  if (/safety|blocked|content.?filter|recitation/i.test(reason))
    return " The provider blocked this content — rephrase and retry."
  return ""
}

/**
 * Best-effort human-readable reason from a (failed) GenerateResult. Prefers
 * the provider-reported `error`; falls back to whether any text came back at
 * all so an unparseable-but-non-empty completion reads differently from a
 * truly empty one.
 */
export function aiFailureReason(res: Pick<GenerateResult, "error" | "text">): string {
  return res.error || (res.text ? "model returned unparseable content" : "model returned no content")
}

/**
 * The human reason plus (when recognised) an actionable hint, as a single
 * string. For routes that degrade gracefully — returning a heuristic
 * fallback with 200 and embedding the AI error in a larger body — rather
 * than failing with aiErrorResponse's 502.
 */
export function aiErrorMessage(res: Pick<GenerateResult, "error" | "text">, task?: string): string {
  const reason = aiFailureReason(res)
  return `${reason}.${aiErrorHint(reason, task)}`
}

/**
 * Build the standard 502 JSON response for an AI call that produced no
 * usable output. The body always carries `provider`, `model`, `status`, and
 * a truncated `raw` sample so the failure is debuggable from the network tab
 * alone; `error` is the human reason plus (when recognised) an actionable
 * hint.
 *
 * @param res   the failed GenerateResult
 * @param opts.task   task name, used to name the exact toggle in the hint
 * @param opts.raw    raw text to sample into the body (defaults to res.text)
 * @param opts.status HTTP status (defaults to 502 Bad Gateway — upstream failed)
 */
export function aiErrorResponse(
  res: GenerateResult,
  opts: { task?: string; raw?: string; status?: number } = {},
): NextResponse {
  const reason = aiFailureReason(res)
  const hint = aiErrorHint(reason, opts.task)
  return NextResponse.json(
    {
      error: `AI request failed: ${reason}.${hint}`,
      provider: res.provider,
      model: res.model,
      status: res.status,
      raw: (opts.raw ?? res.text)?.slice(0, 400) ?? "",
    },
    { status: opts.status ?? 502 },
  )
}
