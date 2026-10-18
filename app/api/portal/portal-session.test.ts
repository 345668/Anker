import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
const st = vi.hoisted(() => ({ requests: [] as any[], tokenOk: true, session: false, verifyThrows: null as null | { message: string; status: number; code: string } }))
vi.mock("@/lib/db", () => ({ sql: async () => [] }))
vi.mock("@/lib/ai/provider", () => ({ generate: async () => "x" }))
vi.mock("@/lib/newsroom/markdown", () => ({ renderArticleHtml: (s: string) => s }))
vi.mock("@/lib/portfolio/lp-portal", () => ({
  verifyPortalToken: async () => (st.tokenOk ? { lpId: "lp1", fundId: "f1", lpName: "LP", fundName: "Fund", tokenId: "00000000-0000-0000-0000-000000000001" } : null),
  logPortalAccess: async () => {}, getPortalLetter: async () => ({ title: "t", quarter: null, contentMd: "x" }), getPortalData: async () => ({ lp: { name: "LP" }, letters: [], documents: [], positions: [], fundName: "F" }),
}))
vi.mock("@/lib/portfolio/lp-onboarding", async () => {
  class LpError extends Error { constructor(m: string, readonly status = 400, readonly code = "invalid") { super(m) } }
  return {
    LpError, SESSION_HOURS: 12, sessionCookieName: () => "lp_s_test", sessionOk: async () => st.session,
    sendCode: async () => ({ sentTo: "a***@x.com", expiresInMinutes: 10 }),
    verifyCode: async () => { if (st.verifyThrows) throw new LpError(st.verifyThrows.message, st.verifyThrows.status, st.verifyThrows.code); return { session: "S".repeat(43), expiresAt: new Date() } },
    confirmDetails: async () => {}, acceptTerms: async () => {}, onboardingView: async () => ({ state: "details_confirmed" }),
  }
})
vi.mock("@/lib/portfolio/lp-subscription", () => ({ returnSigned: async () => {}, lpSubscriptionView: async () => ({ status: "returned" }), fileForLp: async () => ({ filename: "a.pdf", contentType: "application/pdf", bytes: Buffer.from("%PDF-") }) }))
vi.mock("@/lib/portfolio/lp-verification", () => ({ uploadDocument: async () => {}, declare: async () => {}, submit: async () => {}, verificationView: async () => ({ ready: false }) }))
vi.mock("@/lib/portfolio/lp-statement", () => ({ statementFor: async () => ({ asOf: "2026-10-17" }), statementPdf: async () => new Uint8Array(Buffer.from("%PDF-1.4")), documentForLp: async (_f: string, _l: string, id: string) => (id === "11111111-1111-1111-1111-111111111111" ? { filename: "t.pdf", contentType: "application/pdf", bytes: Buffer.from("%PDF-"), title: "T" } : null) }))
vi.mock("@/lib/portfolio/lp-account", () => ({ enableAccount: async () => ({ created: true, email: "a@x.com" }) }))
vi.mock("@/lib/portfolio/lp-requests", () => ({ classifyRequest: (q: string) => (/withdraw/i.test(q) ? "redemption" : null), KIND_LABEL: { redemption: "Withdrawal or redemption" }, submitRequest: async (_lp: unknown, i: { kind: string }) => { st.requests.push(i); return { id: "r1", kind: i.kind, proposalId: null } }, requestsForLp: async () => [] }))
vi.mock("@/lib/actions/store", () => ({ propose: async () => ({ proposal: { id: "p" } }) }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ auth: { admin: {} } }) }))
import { POST as accountPost } from "./[token]/account/route"
import { POST as requestPost } from "./[token]/request/route"
import { GET as stmtGet } from "./[token]/statement/route"
import { GET as docGet } from "./[token]/doc/[id]/route"
import { POST as verPost } from "./[token]/verification/route"
import { POST as subPost } from "./[token]/subscription/route"
import { GET as subGet } from "./[token]/subscription/[id]/route"
import { POST as code } from "./[token]/code/route"
import { POST as onboarding } from "./[token]/onboarding/route"
import { GET as letter } from "./[token]/letters/[id]/route"
import { POST as ask } from "./[token]/ask/route"
import { GET as doc } from "./[token]/documents/[id]/route"

const ctx = (extra: Record<string, string> = {}) => ({ params: Promise.resolve({ token: "lp_abc", id: "x", ...extra }) })
const req = (body?: unknown, cookie?: string) => new NextRequest("https://x.test/p", { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie: `lp_s_test=${cookie}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }) as any
beforeEach(() => { st.requests.length = 0; st.tokenOk = true; st.session = false; st.verifyThrows = null })

describe("the portal needs the emailed code", () => {
  it("nothing but the code step answers without a session: onboarding, letters, ask and documents all say 'enter your code first'", async () => {
    expect((await onboarding(req({ action: "accept_terms" }), ctx())).status).toBe(401)
    expect((await letter(req(), ctx({ id: "l1" }))).status).toBe(401)
    expect((await ask(req({ question: "hi" }), ctx())).status).toBe(401)
    expect((await doc(req(), ctx({ id: "d1" }))).status).toBe(401)
  })
  it("returning signed documents and opening subscription files need the session too; with it, a file downloads as an attachment that browsers must not sniff", async () => {
    const form = () => { const f = new FormData(); f.set("file", new File([Buffer.from("%PDF-1.4")], "s.pdf", { type: "application/pdf" })); f.set("ackName", "Anna Berg"); f.set("agree", "true"); return new NextRequest("https://x.test/p", { method: "POST", body: f }) as any }
    expect((await subPost(form(), ctx())).status).toBe(401)
    expect((await subGet(req(), ctx({ id: "11111111-1111-1111-1111-111111111111" }))).status).toBe(401)
    st.session = true
    expect((await subPost(form(), ctx())).status).toBe(200)
    const r = await subGet(req(undefined, "S"), ctx({ id: "11111111-1111-1111-1111-111111111111" }))
    expect(r.status).toBe(200); expect(r.headers.get("content-disposition")).toContain("attachment"); expect(r.headers.get("x-content-type-options")).toBe("nosniff"); expect(r.headers.get("cache-control")).toContain("no-store")
    expect((await subGet(req(undefined, "S"), ctx({ id: "not-a-uuid" }))).status).toBe(404)
  })
  it("identity documents are accepted only with the session, and an unknown action is refused", async () => {
    const file = () => { const f = new FormData(); f.set("docType", "id_document"); f.set("file", new File([Buffer.from("%PDF-1.4")], "id.pdf")); return new NextRequest("https://x.test/p", { method: "POST", body: f }) as any }
    expect((await verPost(file(), ctx())).status).toBe(401); expect((await verPost(req({ action: "submit" }), ctx())).status).toBe(401)
    st.session = true
    expect((await verPost(file(), ctx())).status).toBe(200); expect((await verPost(req({ action: "declare", category: "unsure" }, "S"), ctx())).status).toBe(200); expect((await verPost(req({ action: "wipe" }, "S"), ctx())).status).toBe(400)
  })
  it("the statement PDF and published documents need the session; with it they download as attachments, and another investor's document id finds nothing", async () => {
    expect((await stmtGet(req(), ctx())).status).toBe(401); expect((await docGet(req(), ctx({ id: "11111111-1111-1111-1111-111111111111" }))).status).toBe(401)
    st.session = true
    const p = await stmtGet(req(undefined, "S"), ctx()); expect(p.status).toBe(200); expect(p.headers.get("content-type")).toBe("application/pdf"); expect(p.headers.get("content-disposition")).toContain("capital-account-statement-2026-10-17.pdf"); expect(p.headers.get("cache-control")).toContain("no-store")
    expect((await docGet(req(undefined, "S"), ctx({ id: "11111111-1111-1111-1111-111111111111" }))).status).toBe(200)
    expect((await docGet(req(undefined, "S"), ctx({ id: "22222222-2222-2222-2222-222222222222" }))).status).toBe(404); expect((await docGet(req(undefined, "S"), ctx({ id: "nope" }))).status).toBe(404)
  })
  it("making an account and asking the fund for something need the session; the assistant hands an action request to the fund instead of answering it", async () => {
    expect((await accountPost(req({ password: "a-long-enough-pw" }), ctx())).status).toBe(401); expect((await requestPost(req({ kind: "other", body: "hello there" }), ctx())).status).toBe(401)
    expect((await ask(req({ question: "I want to withdraw my money" }), ctx())).status).toBe(401)
    st.session = true
    const a = await accountPost(req({ password: "a-long-enough-pw" }, "S"), ctx()); expect(a.status).toBe(200); expect(await a.json()).toMatchObject({ created: true, signIn: "/auth/login?redirect=/lp" })
    expect((await requestPost(req({ kind: "other", body: "Please call me back" }, "S"), ctx())).status).toBe(201); expect(st.requests[0]).toMatchObject({ kind: "other", source: "form" })
    st.requests.length = 0
    const r = await ask(req({ question: "I want to withdraw my money" }, "S"), ctx()); const j = await r.json()
    expect(j.requestSent).toBe(true); expect(j.answer).toContain("I have not changed anything"); expect(st.requests[0]).toMatchObject({ kind: "redemption", source: "assistant" })
    const plain = await ask(req({ question: "What is my commitment?" }, "S"), ctx()); expect((await plain.json()).requestSent).toBeUndefined(); expect(st.requests).toHaveLength(1)
  })
  it("with a session the onboarding step and the letter answer", async () => {
    st.session = true
    expect((await onboarding(req({ action: "accept_terms" }, "S"), ctx())).status).toBe(200)
    expect((await letter(req(), ctx({ id: "l1" }))).status).toBe(200)
    expect((await onboarding(req({ action: "wipe" }, "S"), ctx())).status).toBe(400)
  })
  it("an invalid or revoked link is refused everywhere, including the code step", async () => {
    st.tokenOk = false; st.session = true
    for (const r of [await code(req({ action: "send" }), ctx()), await onboarding(req({ action: "accept_terms" }), ctx()), await letter(req(), ctx({ id: "l" })), await doc(req(), ctx({ id: "d" }))]) expect(r.status).toBe(401)
  })
})

describe("the code step", () => {
  it("send answers with the masked address only", async () => {
    const r = await code(req({ action: "send" }), ctx()); expect(r.status).toBe(200); expect(await r.json()).toEqual({ ok: true, sentTo: "a***@x.com", expiresInMinutes: 10 })
  })
  it("a right code sets an HttpOnly, SameSite=Lax session cookie for twelve hours; a wrong one sets nothing", async () => {
    const ok = await code(req({ action: "verify", code: "123456" }), ctx()); const c = ok.headers.get("set-cookie")!
    expect(c).toContain("lp_s_test="); expect(c).toMatch(/HttpOnly/i); expect(c).toMatch(/SameSite=lax/i); expect(c).toContain("Max-Age=43200")
    st.verifyThrows = { message: "That code is not right.", status: 400, code: "wrong" }
    const bad = await code(req({ action: "verify", code: "000000" }), ctx()); expect(bad.status).toBe(400); expect(bad.headers.get("set-cookie")).toBeNull()
    st.verifyThrows = { message: "Too many wrong tries.", status: 429, code: "locked" }; expect((await code(req({ action: "verify", code: "1" }), ctx())).status).toBe(429)
  })
  it("an unknown action is refused", async () => { expect((await code(req({ action: "peek" }), ctx())).status).toBe(400) })
})
