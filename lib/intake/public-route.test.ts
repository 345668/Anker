import { describe, it, expect, vi, beforeEach } from "vitest"
const h = vi.hoisted(() => ({ get: vi.fn(), create: vi.fn(), process: vi.fn() }))
vi.mock("next/server", async (orig) => ({ ...(await orig<any>()), after: (fn: () => unknown) => { void fn() } }))
vi.mock("@/lib/intake/store", () => ({ getPublicIntake: h.get, createSubmission: h.create, processSubmission: h.process }))
import { GET, POST } from "@/app/api/public/intake/[slug]/route"
import { NextRequest } from "next/server"

const intake = { fundId: "f1", fundName: "Summit", slug: "summit", headline: "Pitch us", intro: "", form: { askRaise: true, askTraction: true, askTeam: true, askLocation: true, questions: [{ id: "q1", label: "Why us?", required: true, long: true }] } }
let ip = 0
const post = (fields: Record<string, string>, slug = "summit") => {
  const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return POST(new NextRequest(`https://x.test/api/public/intake/${slug}`, { method: "POST", body: fd, headers: { "x-forwarded-for": `10.0.0.${++ip}` } }), { params: Promise.resolve({ slug }) })
}
const ok = { company_name: "Acme", contact_name: "Ann", contact_email: "ann@acme.io", terms_accepted: "1", q_q1: "Because" }
beforeEach(() => { h.get.mockReset(); h.create.mockReset(); h.process.mockReset(); h.get.mockResolvedValue(intake); h.create.mockResolvedValue("sub1"); h.process.mockResolvedValue({}) })

describe("public intake", () => {
  it("GET returns the form shape only", async () => {
    const r = await GET(new NextRequest("https://x.test/api/public/intake/summit"), { params: Promise.resolve({ slug: "summit" }) })
    const b = await r.json(); expect(Object.keys(b).sort()).toEqual(["form", "fundName", "headline", "intro"])
  })
  it("a missing or disabled fund is a 404 for GET and POST", async () => {
    h.get.mockResolvedValue(null)
    expect((await GET(new NextRequest("https://x.test/a"), { params: Promise.resolve({ slug: "no" }) })).status).toBe(404)
    expect((await post(ok, "no")).status).toBe(404); expect(h.create).not.toHaveBeenCalled()
  })
  it("refuses missing fields, a bad email, no consent and an unanswered required question", async () => {
    expect((await post({ ...ok, company_name: "" })).status).toBe(400)
    expect((await post({ ...ok, contact_email: "nope" })).status).toBe(400)
    expect((await post({ ...ok, terms_accepted: "" })).status).toBe(400)
    expect((await post({ ...ok, q_q1: "" })).status).toBe(400)
    expect(h.create).not.toHaveBeenCalled()
  })
  it("a filled honeypot looks like success and stores nothing", async () => {
    const r = await post({ ...ok, company_url_confirm: "http://spam" }); expect(r.status).toBe(200); expect(h.create).not.toHaveBeenCalled()
  })
  it("a good application is stored for that fund with the answers, then assessed", async () => {
    const r = await post({ ...ok, stage: "Seed", sectors: "AI", raise_amount: "1000000", problem: "p" })
    expect(r.status).toBe(200); expect((await r.json()).publicRef).toMatch(/^INT-/)
    const arg = h.create.mock.calls[0][0]
    expect(arg).toMatchObject({ fundId: "f1", companyName: "Acme", contactEmail: "ann@acme.io" }); expect(arg.answers).toMatchObject({ stage: "Seed", q1: "Because", problem: "p" })
    expect(h.process).toHaveBeenCalledWith("sub1")
  })
  it("limits the same email to two applications a day", async () => {
    const e = { ...ok, contact_email: "limit@acme.io" }
    expect((await post(e)).status).toBe(200); expect((await post(e)).status).toBe(200); expect((await post(e)).status).toBe(429)
  })
})
