/**
 * Ordered utterance uploads with retry (docs/architecture/62 section 6, resilience). An utterance waits in memory until the server acknowledges it; a failed upload is retried with
 * a growing delay; a permanent refusal (4xx other than 408/429) drops it and says why; at most `maxQueuedMs` of audio is held (the oldest goes first, and the room is told).
 * The server de-duplicates on seq, so a retry after a lost acknowledgement is safe. IndexedDB persistence and reconnect resume are H4.
 */
import type { QueueStore } from "./queue-store"
export interface QueuedUtterance { seq: number; startedMs: number; endedMs: number; wav: Uint8Array; channel: "you" | "them" | "room" }
export type UploadOutcome = { ok: true; body: any } | { ok: false; status: number; message: string }
export interface QueueOptions {
  /** Persists what is unsent, under this session, so a reload or crash can resume. */
  store?: QueueStore; sessionId?: string
  send: (u: QueuedUtterance) => Promise<UploadOutcome>
  onAck?: (u: QueuedUtterance, body: any) => void
  onDrop?: (u: QueuedUtterance, why: "refused" | "overflow", message: string) => void
  onStatus?: (s: { pending: number; retrying: boolean }) => void
  maxQueuedMs?: number; baseDelayMs?: number; maxDelayMs?: number; sleep?: (ms: number) => Promise<void>
}
export function createUploadQueue(o: QueueOptions) {
  const maxQueued = o.maxQueuedMs ?? 600_000, base = o.baseDelayMs ?? 500, cap = o.maxDelayMs ?? 8000
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const items: QueuedUtterance[] = [], keep = (f: (st: QueueStore, id: string) => Promise<unknown>) => { if (o.store && o.sessionId) void f(o.store, o.sessionId).catch(() => {}) }
  let running = false, retrying = false, stopped = false
  const queuedMs = () => items.reduce((n, u) => n + (u.endedMs - u.startedMs), 0)
  const status = () => o.onStatus?.({ pending: items.length, retrying })
  async function pump() {
    if (running) return; running = true
    try {
      while (items.length && !stopped) {
        const u = items[0]; let attempt = 0
        for (;;) {
          const r = await o.send(u).catch((e): UploadOutcome => ({ ok: false, status: 0, message: String(e?.message ?? e) }))
          if (r.ok) { items.shift(); keep((st, id) => st.remove(id, u.seq)); retrying = false; o.onAck?.(u, r.body); break }
          const transient = r.status === 0 || r.status === 408 || r.status === 429 || r.status >= 500
          if (!transient) { items.shift(); keep((st, id) => st.remove(id, u.seq)); retrying = false; o.onDrop?.(u, "refused", r.message); break }
          retrying = true; status(); attempt++
          await sleep(Math.min(cap, base * 2 ** (attempt - 1)))
          if (stopped) return
        }
        status()
      }
    } finally { running = false; status() }
  }
  return {
    push(u: QueuedUtterance) {
      items.push(u); keep((st, id) => st.put(id, u))
      while (items.length > 1 && queuedMs() > maxQueued) { const d = items.splice(running ? 1 : 0, 1)[0]; keep((st, id) => st.remove(id, d.seq)); o.onDrop?.(d, "overflow", "The connection was down too long; the oldest audio was dropped.") }
      status(); void pump()
    },
    /** Resolves when everything pushed so far has been acknowledged or dropped. */
    async flush() { while (items.length && !stopped) { await new Promise<void>((r) => setTimeout(r, 5)); void pump() } },
    /** Puts back what an earlier page left unsent (a reload or a crash), in order. Returns them. */
    async restore(): Promise<QueuedUtterance[]> { if (!o.store || !o.sessionId) return []; const left = (await o.store.all(o.sessionId)).filter((u) => !items.some((i) => i.seq === u.seq)); for (const u of left) { items.push(u) } status(); void pump(); return left },
    stop() { stopped = true },
    get pending() { return items.length },
  }
}
