import { describe, it, expect, vi, beforeEach } from "vitest"
vi.mock("server-only", () => ({}))
const state = vi.hoisted(() => ({ enqueued: [] as any[], isNew: true, processed: [] as number[], throwQueue: false, afterFns: [] as Array<() => unknown> }))
vi.mock("@/lib/telegram/runtime", () => ({
  enqueue: async (u: any) => { if (state.throwQueue) throw new Error("db down"); state.enqueued.push(u); return state.isNew },
  processUpdate: async (id: number) => { state.processed.push(id); return "done" },
  realDeps: () => ({}),
}))
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => { state.afterFns.push(fn) } }))
process.env.TELEGRAM_PRODUCT_BOT_TOKEN = "8615616511:AAFX1VFIA4eoTmIKAr7Y5Evap_FZncGSjak"; process.env.SECRET_KEY = "webhook-test-secret"
import { POST } from "../../app/api/telegram/webhook/route"
import { productBot } from "./api"

const secret = productBot()!.secret
const req = (body: unknown, hdr: Record<string, string> = { "x-telegram-bot-api-secret-token": secret }) => new Request("https://x.test/api/telegram/webhook", { method: "POST", headers: { "content-type": "application/json", ...hdr }, body: typeof body === "string" ? body : JSON.stringify(body) }) as any
beforeEach(() => { state.enqueued.length = 0; state.processed.length = 0; state.afterFns.length = 0; state.isNew = true; state.throwQueue = false })

describe("POST /api/telegram/webhook", () => {
  it("drops a request with no secret, or the wrong one, before reading it", async () => {
    expect((await POST(req({ update_id: 1 }, {}))).status).toBe(401)
    expect((await POST(req({ update_id: 1 }, { "x-telegram-bot-api-secret-token": secret.replace(/.$/, "0") }))).status).toBe(401)
    expect(state.enqueued).toHaveLength(0)
  })
  it("refuses everything when the bot is not configured", async () => {
    const t = process.env.TELEGRAM_PRODUCT_BOT_TOKEN; delete process.env.TELEGRAM_PRODUCT_BOT_TOKEN
    try { expect((await POST(req({ update_id: 1 }))).status).toBe(401) } finally { process.env.TELEGRAM_PRODUCT_BOT_TOKEN = t }
  })
  it("answers 400 for a body that is not an update", async () => {
    expect((await POST(req("not json"))).status).toBe(400); expect((await POST(req({ hello: 1 }))).status).toBe(400)
  })
  it("queues a new update, answers 200 at once, and processes it after the response", async () => {
    const r = await POST(req({ update_id: 7, message: { text: "hi" } }))
    expect(r.status).toBe(200); expect(state.enqueued).toHaveLength(1); expect(state.processed).toEqual([]); expect(state.afterFns).toHaveLength(1)
    await state.afterFns[0](); expect(state.processed).toEqual([7])
  })
  it("a repeat of an update Telegram already delivered is acknowledged and not processed again", async () => {
    state.isNew = false
    expect((await POST(req({ update_id: 7 }))).status).toBe(200); expect(state.afterFns).toHaveLength(0)
  })
  it("if the update cannot be stored it answers 500, so Telegram sends it again", async () => {
    state.throwQueue = true
    expect((await POST(req({ update_id: 8 }))).status).toBe(500)
  })
})
