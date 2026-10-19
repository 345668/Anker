import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
const m = vi.hoisted(() => ({ admin: vi.fn(), active: vi.fn(), decide: vi.fn(), eval: vi.fn(), list: vi.fn(), import: vi.fn(), clear: vi.fn(), latest: vi.fn(), audit: vi.fn(), query: vi.fn() }))
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: m.admin }))
vi.mock("@/lib/org/active", () => ({ resolveActiveMembership: m.active }))
vi.mock("@/lib/audit/audit-log", () => ({ logAudit: m.audit }))
vi.mock("@/lib/db", () => ({ sql: Object.assign(m.query, { unsafe: m.query }) }))
vi.mock("@/lib/matching/lp/factors-admin", () => ({
  decideFactor: m.decide, evaluateWorkspace: m.eval, factorList: m.list,
  FactorError: class FactorError extends Error { constructor(message: string, readonly status = 409) { super(message) } },
}))
vi.mock("@/lib/matching/lp/labels", () => ({ importLabels: m.import, clearLabels: m.clear }))
vi.mock("@/lib/matching/lp/matches", () => ({ latestSession: m.latest }))
import { NextRequest } from "next/server"
import { GET, POST } from "./route"
import { FactorError } from "@/lib/matching/lp/factors-admin"

const post = (body: unknown) => new NextRequest("http://localhost/api/admin/lp-scoring", { method: "POST", body: JSON.stringify(body) })
const owner = { id: "u1", email: "owner@example.com" }
beforeEach(() => { for (const f of Object.values(m)) f.mockReset(); m.admin.mockResolvedValue(owner); m.active.mockResolvedValue({ active: { orgId: "org-1", persona: "vc" } }); m.list.mockResolvedValue([{ key: "recent_activity" }]); m.query.mockResolvedValue([]) })

describe("/api/admin/lp-scoring", () => {
  it("is for the owner only", async () => {
    const { NextResponse } = await import("next/server")
    m.admin.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }))
    expect((await GET(new NextRequest("http://localhost/api/admin/lp-scoring"))).status).toBe(403)
    expect((await POST(post({ action: "decide" }))).status).toBe(403)
  })
  it("lists the factors, and evaluates the owner's own workspace only when asked", async () => {
    m.latest.mockResolvedValue({ id: "s1", fund_name: "Fund A", created_at: "2026-10-19" }); m.eval.mockResolvedValue({ firms: null })
    const plain = await (await GET(new NextRequest("http://localhost/api/admin/lp-scoring"))).json()
    expect(plain.factors).toEqual([{ key: "recent_activity" }]); expect(plain.evaluation).toBeUndefined(); expect(m.eval).not.toHaveBeenCalled()
    const withReport = await (await GET(new NextRequest("http://localhost/api/admin/lp-scoring?report=1&fundProfileId=f1"))).json()
    expect(m.eval).toHaveBeenCalledWith("org-1", "f1")
    expect(withReport.evaluation).toEqual({ firms: null })
  })
  it("shows the factors but no workspace to the staff portal and to an owner outside a fund workspace", async () => {
    m.admin.mockResolvedValue({ id: "portal-service", email: null })
    const a = await (await GET(new NextRequest("http://localhost/api/admin/lp-scoring?report=1"))).json()
    expect(a.workspace).toBeNull(); expect(m.eval).not.toHaveBeenCalled()
    m.admin.mockResolvedValue(owner); m.active.mockResolvedValue({ active: { orgId: "org-2", persona: "founder" } })
    expect((await (await GET(new NextRequest("http://localhost/api/admin/lp-scoring"))).json()).workspace).toBeNull()
  })
  it("will not label LPs or decide on a factor for the staff portal, which has no workspace of its own", async () => {
    m.admin.mockResolvedValue({ id: "portal-service", email: null })
    expect((await POST(post({ action: "decide", key: "recent_activity", status: "promoted" }))).status).toBe(403)
    expect(m.decide).not.toHaveBeenCalled()
  })
  it("saves a labelled list against the newest run, and records that it did", async () => {
    m.latest.mockResolvedValue({ id: "s1", fund_profile_id: "f1" }); m.import.mockResolvedValue({ saved: 2, unresolved: ["Ghost"], ambiguous: [], skipped: [] })
    const r = await (await POST(post({ action: "labels", text: "A, fit\nGhost, fit" }))).json()
    expect(r).toMatchObject({ ok: true, saved: 2, unresolved: ["Ghost"] })
    expect(m.import).toHaveBeenCalledWith({ orgId: "org-1", userId: "u1" }, "s1", "f1", "A, fit\nGhost, fit")
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "lp_scoring.labels_saved", metadata: { saved: 2, unresolved: 1 } }))
    m.latest.mockResolvedValue(null)
    expect((await POST(post({ action: "labels", text: "A, fit" }))).status).toBe(409)
  })
  it("passes a decision through, audits it, and returns the reason a promotion was refused", async () => {
    m.decide.mockResolvedValue({ status: "promoted", weight: 8, overridden: false })
    const ok = await POST(post({ action: "decide", key: "relationship_proximity", status: "promoted", note: "n" }))
    expect(ok.status).toBe(200)
    expect(m.decide).toHaveBeenCalledWith("org-1", null, { key: "relationship_proximity", status: "promoted", weight: undefined, note: "n", override: false }, "owner@example.com")
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "lp_scoring.promoted", targetId: "relationship_proximity" }))
    m.decide.mockRejectedValue(new FactorError("The evaluation does not recommend promoting it: No measurable gain.", 409))
    const no = await POST(post({ action: "decide", key: "recent_activity", status: "promoted" }))
    expect(no.status).toBe(409); expect((await no.json()).error).toMatch(/does not recommend promoting it/)
    expect((await POST(post({ action: "nope" }))).status).toBe(400)
  })
})
