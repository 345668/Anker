import "server-only"
import { sql } from "@/lib/db"
import { latestNotes } from "./notes"
import { listTurns } from "./sessions"

/**
 * The follow-along view (docs/architecture/62 sections 3 and 11): a read-only live feed of a session for its owner on a second device and for colleagues the owner has chosen. The
 * platform's functions cannot hold a socket, so this is a short-lived server-sent-event stream that reads the database every second or so and ends after about a minute; the browser
 * reconnects by itself with the last turn it saw (`Last-Event-ID`), so nothing is missed and nothing repeats. What is sent: the turns, the notes (never the owner's email draft) and
 * the state. Never the owner's suggestions.
 */
export interface FollowEvent { event: "turn" | "notes" | "state" | "revoked"; id?: string; data: unknown }
export interface FollowOpts { afterSeq: number; pollMs?: number; maxMs?: number; sleep?: (ms: number) => Promise<void>; now?: () => number; signal?: AbortSignal; allowed?: () => Promise<boolean> }
export async function* follow(sessionId: string, o: FollowOpts): AsyncGenerator<FollowEvent> {
  const poll = o.pollMs ?? 1200, maxMs = o.maxMs ?? 50_000, now = o.now ?? Date.now, sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const until = now() + maxMs
  let cursor = o.afterSeq, notesV = -1, state: string | null = null, first = true
  while (!o.signal?.aborted) {
    if (o.allowed && !(await o.allowed())) { yield { event: "revoked", data: {} }; return }
    const [s] = (await sql`SELECT state FROM halyard_sessions WHERE id = ${sessionId}`) as any[]
    if (!s) { yield { event: "state", data: { state: "deleted" } }; return }
    const turns = await listTurns(sessionId, { afterSeq: cursor, limit: 200 })
    for (const t of turns) { cursor = t.seq; yield { event: "turn", id: String(t.seq), data: { seq: t.seq, channel: t.channel, text: t.text } } }
    const n = await latestNotes(sessionId)
    if (n && n.version !== notesV) { notesV = n.version; yield { event: "notes", data: { ...n, body: { ...n.body, email: "" } } } }
    if (s.state !== state) { state = s.state; yield { event: "state", data: { state } } }
    if (s.state === "ended" || s.state === "abandoned") { if (turns.length < 200) return }
    else if (now() >= until) return
    if (!first || !turns.length) await sleep(poll)
    first = false
  }
}
