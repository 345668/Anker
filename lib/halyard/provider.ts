import "server-only"
import { assertCan } from "@/lib/metering/allowance"
import { generateDetailed } from "@/lib/ai/provider"
import type { TaskTag } from "@/lib/ai/model-router"
import { HalyardError, assertOn } from "./sessions"

/**
 * "Anker AI" as a provider for the Halyard desktop app (docs/architecture/62 H7). The desktop keeps building its own prompts (they are the same code the server uses, proved by the
 * differential test) and asks for ONE completion; the model call goes through the workspace's own AI: routed, policy-checked, recorded in `ai_calls` against the workspace and counted
 * by the monthly allowance, so a call on the desktop costs the same way and under the same limits as one in the browser. Nothing is stored here; the answer is returned to the app.
 */
export const DESKTOP_TASKS: Record<string, TaskTag> = {
  say: "halyard_say", answerThis: "halyard_say", assist: "halyard_assist", followup: "halyard_followup", recap: "halyard_recap", ask: "halyard_ask", prep: "halyard_ask",
  brief: "halyard_fold", notes: "halyard_notes", email: "halyard_notes",
}
export const LIMITS = { system: 24_000, text: 80_000, maxTokens: 1600 }
export interface CompleteInput { system?: unknown; text: unknown; maxTokens?: unknown; action?: unknown }
export type Completer = (prompt: string, o: { task: TaskTag; maxTokens: number }) => Promise<{ text: string; model: string | null; error: string | null }>
const real: Completer = async (prompt, o) => { const r = await generateDetailed(prompt, { task: o.task, maxTokens: o.maxTokens }); return { text: r.text, model: r.model, error: r.error } }

export async function completeForDesktop(orgId: string, i: CompleteInput, complete: Completer = real): Promise<{ text: string; model: string | null }> {
  await assertOn(orgId)
  const system = typeof i.system === "string" ? i.system : "", text = typeof i.text === "string" ? i.text : ""
  if (!text.trim()) throw new HalyardError("Nothing to answer.", 400, "empty")
  if (system.length > LIMITS.system || text.length > LIMITS.text) throw new HalyardError("That request is too large.", 413, "too_large")
  const task = DESKTOP_TASKS[String(i.action ?? "ask")] ?? "halyard_ask"
  const maxTokens = Math.min(LIMITS.maxTokens, Math.max(50, Math.round(Number(i.maxTokens) || 700)))
  await assertCan(orgId, "chat").catch((e) => { throw new HalyardError(e.message, 402, "allowance") })
  const r = await complete(system ? `${system}\n\n${text}` : text, { task, maxTokens })
  if (!r.text) throw new HalyardError(r.error ? "The assistant could not answer just now. Try again in a moment." : "The assistant had nothing to add.", 503, "model")
  return { text: r.text, model: r.model }
}
