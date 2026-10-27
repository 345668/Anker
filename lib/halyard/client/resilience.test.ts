import { describe, expect, it } from "vitest"
import { checkBrowser, type BrowserFacts } from "./browser-check"
import { memoryStore } from "./queue-store"
import { createUploadQueue, type QueuedUtterance } from "./upload-queue"

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
const FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0"
const SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
const base: BrowserFacts = { ua: CHROME, secure: true, getUserMedia: true, displayMedia: true, worklet: true, documentPip: true, wakeLock: true }

describe("the browser check", () => {
  it("says what works in each browser, in plain words", () => {
    expect(checkBrowser(base)).toMatchObject({ canListen: true, tabAudio: true, pip: "document", problem: null })
    const ff = checkBrowser({ ...base, ua: FIREFOX, documentPip: false }); expect(ff).toMatchObject({ tabAudio: false, pip: "popup" }); expect(ff.notes.join(" ")).toMatch(/Firefox cannot capture a tab's audio/)
    const sf = checkBrowser({ ...base, ua: SAFARI, documentPip: false, wakeLock: false }); expect(sf.tabAudio).toBe(false); expect(sf.notes.join(" ")).toMatch(/Safari cannot capture meeting audio/); expect(sf.notes.join(" ")).toMatch(/screen sleep/)
    expect(checkBrowser({ ...base, ua: ANDROID })).toMatchObject({ tabAudio: false, canListen: true })
  })
  it("refuses with a reason when nothing can listen", () => {
    expect(checkBrowser({ ...base, secure: false }).problem).toMatch(/https/); expect(checkBrowser({ ...base, getUserMedia: false }).problem).toMatch(/microphone/); expect(checkBrowser({ ...base, worklet: false }).problem).toMatch(/live audio/)
    expect(checkBrowser({ ...base, secure: false }).notes).toEqual([])
  })
  it("always warns that speakers feed the microphone", () => { expect(checkBrowser(base).notes.join(" ")).toMatch(/headphones/) })
})

describe("the unsent store", () => {
  const u = (seq: number): QueuedUtterance => ({ seq, startedMs: seq * 1000, endedMs: seq * 1000 + 900, wav: new Uint8Array([seq]), channel: "them" })
  it("keeps what is unsent under the session, removes it when acknowledged or refused, and a new page restores the rest in order", async () => {
    const store = memoryStore(); let online = false; const acks: number[] = []
    const mk = () => createUploadQueue({ store, sessionId: "s1", sleep: () => new Promise(() => {}), send: async (x) => (online ? (x.seq === 2 ? { ok: false, status: 402, message: "no" } : { ok: true, body: {} }) : { ok: false, status: 0, message: "offline" }), onAck: (x) => acks.push(x.seq) })
    const q1 = mk(); q1.push(u(1)); q1.push(u(2)); q1.push(u(3)); await new Promise((r) => setTimeout(r, 10))
    expect(await store.all("s1")).toHaveLength(3); expect(await store.all("other")).toHaveLength(0)
    q1.stop()                                                               // the tab closes while offline
    online = true; const q2 = mk(); const restored = await q2.restore(); expect(restored.map((x) => x.seq)).toEqual([1, 2, 3])
    await q2.flush(); expect(acks).toEqual([1, 3]); expect(await store.all("s1")).toEqual([])   // 2 was refused and is gone too
  })
  it("clear removes a session's audio and no other's", async () => {
    const st = memoryStore(); await st.put("a", u(1)); await st.put("b", u(1)); await st.clear("a"); expect(await st.all("a")).toEqual([]); expect(await st.all("b")).toHaveLength(1)
  })
  it("works with no store at all", async () => { const acks: number[] = []; const q = createUploadQueue({ send: async () => ({ ok: true, body: {} }), onAck: (x) => acks.push(x.seq) }); q.push(u(1)); await q.flush(); expect(acks).toEqual([1]); expect(await q.restore()).toEqual([]) })
})
