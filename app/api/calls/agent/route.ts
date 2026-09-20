import { resolveAiPrincipal } from "@/lib/assistant/principal"
import { withAiContext } from "@/lib/assistant/context"
/**
 * POST /api/calls/agent — ask Anker's agent about the call in progress.
 *
 *   Authorization: Bearer anker_call_<token>
 *   { callId?: string, window: string, question?: string }
 *   → { answer, steps: [{ tool, summary }], usedTools, turnsRemaining }
 *
 * Phase 1 of docs/call-agent-bridge-design-2026-09-19.md: OBSERVE ONLY. The
 * agent can look things up and answer; it cannot write anything, here or
 * anywhere it can reach. The tool belt is narrowed to
 * lib/calls/agent-observe.ts, which is intersected with the caller's persona
 * scope rather than replacing it, so this path can never reach further than
 * the user themselves could.
 *
 * Nothing is persisted. The window of transcript is used to answer and then
 * dropped: the stored transcript remains the one the user explicitly chooses
 * to upload, which is what the desktop app promises.
 */
import { NextRequest, NextResponse } from "next/server"
import { CallError } from "@/lib/calls/access"
import { authenticateDevice } from "@/lib/calls/devices"
import { runAssistant } from "@/lib/assistant/agent"
import { rateLimit } from "@/lib/rate-limit"
import { sql } from "@/lib/db"
import {
  OBSERVE_MAX_STEPS, OBSERVE_MAX_TURNS_PER_CALL, OBSERVE_TIMEOUT_MS,
  OBSERVE_TOOLS, OBSERVE_WINDOW_CHARS,
} from "@/lib/calls/agent-observe"

export const runtime = "nodejs"
export const maxDuration = 60

/** Per-call turn counters. In-process on purpose — see the note at the use site. */
const turns = new Map<string, { n: number; at: number }>()
const TURN_WINDOW_MS = 4 * 60 * 60 * 1000

function countTurn(key: string): number {
  const now = Date.now()
  for (const [k, v] of turns) if (now - v.at > TURN_WINDOW_MS) turns.delete(k)
  const entry = turns.get(key)
  if (!entry || now - entry.at > TURN_WINDOW_MS) { turns.set(key, { n: 1, at: now }); return 1 }
  entry.n += 1
  return entry.n
}

export async function POST(req: NextRequest) {
  try {
    const scope = await authenticateDevice(req.headers.get("authorization"))

    // Every speaker turn is a potential inference, so a long call is an
    // unbounded bill unless something stops it. Two limits: a short-interval
    // rate limit against bursts, and a per-call ceiling.
    if (!rateLimit(`call-agent:${scope.userId}`, { limit: 12, windowMs: 60_000 }).ok) {
      throw new CallError("Slow down — too many questions in the last minute.", 429)
    }

    const body = await req.json().catch(() => null)
    const windowText = String(body?.window ?? "").trim()
    const question = String(body?.question ?? "").trim()
    if (!windowText && !question) throw new CallError("Send a transcript window or a question.")
    if (windowText.length > OBSERVE_WINDOW_CHARS) {
      throw new CallError(`Transcript window is too large (max ${OBSERVE_WINDOW_CHARS} characters).`, 413)
    }

    const callId = String(body?.callId ?? "").trim()
    if (callId) {
      // Scope check, not a lookup: a device must not be able to attach its
      // questions to another workspace's call.
      const [call] = await sql`SELECT id FROM investor_calls
        WHERE id = ${callId} AND org_id = ${scope.orgId} AND deleted_at IS NULL LIMIT 1`
      if (!call) throw new CallError("That call is not in this workspace.", 404)
    }

    // The ceiling is per instance rather than in the database: a live call is
    // short and sticky, so this stops a runaway loop, which is what it is for.
    // It is a cost guard, not a security boundary — the rate limit above and
    // the observe-only belt are what actually contain this endpoint.
    const used = countTurn(`${scope.userId}:${callId || "adhoc"}`)
    if (used > OBSERVE_MAX_TURNS_PER_CALL) {
      throw new CallError("This call has reached its assistant limit. Ask again after the call.", 429)
    }

    const task = [
      "You are assisting during a live investor call. Answer in at most three short sentences,",
      "in a form the user can read at a glance while someone else is speaking. If you do not know,",
      "say so rather than guessing — a confident wrong answer mid-call is worse than silence.",
      "",
      question ? `QUESTION: ${question}` : "QUESTION: What is most useful to know right now?",
      windowText ? `\nRECENT TRANSCRIPT (may contain speech-recognition errors):\n${windowText}` : "",
    ].join("\n")

    // A late answer is a useless answer: the conversation has moved on. Cut the
    // turn rather than let the client wait on it.
    const principal = await resolveAiPrincipal(scope.userId,{orgId:scope.orgId,readonly:true,tools:[...OBSERVE_TOOLS]})
    const result = await Promise.race([
      withAiContext(principal, () => runAssistant(task, {
        maxSteps: OBSERVE_MAX_STEPS,
        userId: scope.userId,
        persona: scope.persona,
        toolAllowlist: OBSERVE_TOOLS,
      }), AbortSignal.any([req.signal,AbortSignal.timeout(OBSERVE_TIMEOUT_MS)])),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new CallError("The assistant took too long to answer. Ask again.", 504)), OBSERVE_TIMEOUT_MS)),
    ])

    return NextResponse.json({
      answer: result.answer,
      // Which tools ran, without the payloads: the desktop shows provenance,
      // not a database dump.
      steps: (result.steps ?? []).filter(s => s.tool).map(s => ({ tool: s.tool })),
      turnsRemaining: Math.max(0, OBSERVE_MAX_TURNS_PER_CALL - used),
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const known = error instanceof CallError
    if (!known) console.error("[calls/agent] failed", error)
    return NextResponse.json(
      { error: known ? error.message : "The assistant is unavailable. Your call is unaffected." },
      { status: known ? error.status : 503, headers: { "Cache-Control": "no-store" } },
    )
  }
}
