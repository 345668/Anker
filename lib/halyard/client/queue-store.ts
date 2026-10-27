import type { QueuedUtterance } from "./upload-queue"
/**
 * Where unsent utterances wait so a closed or crashed tab does not lose them (docs/architecture/62 section 6). Audio is kept only until the server acknowledges it, only for
 * this session, and is deleted when the session ends. The queue works without a store (private windows, blocked storage): it then holds them in memory only.
 */
export interface QueueStore {
  put(sessionId: string, u: QueuedUtterance): Promise<void>
  remove(sessionId: string, seq: number): Promise<void>
  all(sessionId: string): Promise<QueuedUtterance[]>
  clear(sessionId: string): Promise<void>
}
export function memoryStore(): QueueStore & { size(): number } {
  const m = new Map<string, QueuedUtterance>(), key = (s: string, q: number) => `${s}:${q}`
  return {
    async put(s, u) { m.set(key(s, u.seq), u) }, async remove(s, q) { m.delete(key(s, q)) },
    async all(s) { return [...m.entries()].filter(([k]) => k.startsWith(s + ":")).map(([, v]) => v).sort((a, b) => a.seq - b.seq) },
    async clear(s) { for (const k of [...m.keys()]) if (k.startsWith(s + ":")) m.delete(k) }, size: () => m.size,
  }
}
/** IndexedDB; every call resolves quietly if storage is unavailable. */
export function indexedDbStore(): QueueStore {
  const open = () => new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open("halyard-unsent", 1); r.onupgradeneeded = () => r.result.createObjectStore("u"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const run = async <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> => {
    try {
      const db = await open()
      return await new Promise<T | undefined>((res) => { const tx = db.transaction("u", mode), req = f(tx.objectStore("u")); tx.oncomplete = () => { db.close(); res(req ? (req.result as T) : undefined) }; tx.onerror = tx.onabort = () => { db.close(); res(undefined) } })
    } catch { return undefined }
  }
  const k = (s: string, q: number) => `${s}:${String(q).padStart(9, "0")}`
  return {
    async put(s, u) { await run("readwrite", (o) => { o.put({ ...u, wav: u.wav }, k(s, u.seq)) }) },
    async remove(s, q) { await run("readwrite", (o) => { o.delete(k(s, q)) }) },
    async all(s) { return ((await run<any[]>("readwrite", (o) => o.getAll(IDBKeyRange.bound(`${s}:`, `${s}:￿`)))) ?? []) as QueuedUtterance[] },
    async clear(s) { await run("readwrite", (o) => { o.delete(IDBKeyRange.bound(`${s}:`, `${s}:￿`)) }) },
  }
}
