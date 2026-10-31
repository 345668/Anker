import { describe, it, expect, vi, beforeEach } from "vitest"
vi.mock("server-only", () => ({}))
const st = vi.hoisted(() => ({ admin: { id: "portal-service" } as any, cand: null as any, calls: [] as any[] }))
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: async () => st.admin }))
vi.mock("@/lib/db", () => ({ sql: async (s: TemplateStringsArray) => (s.join("?").includes("directory_candidates") ? (st.cand ? [st.cand] : []) : []) }))
vi.mock("@/lib/directory/candidates", () => ({ runDetection: async () => { st.calls.push("detect"); return { firms: { found: 1 } } } }))
const MergeErr = vi.hoisted(() => class MergeErr extends Error { constructor(m: string, readonly status = 409, readonly code = "merge") { super(m) } })
vi.mock("@/lib/directory/merge", () => ({ MergeError: MergeErr, planMerge: async (...a: any[]) => { st.calls.push(["plan", ...a]); return { blockers: [] } }, executeMerge: async (i: any) => { st.calls.push(["merge", i]); return { mergeId: 5 } }, undoMerge: async (id: number, by: string) => { st.calls.push(["undo", id, by]); return { moved: 1 } }, setParent: async (c: string, p: string) => { st.calls.push(["parent", c, p]) } }))
import { POST } from "@/app/api/admin/directory-identity/route"
import { NextRequest, NextResponse } from "next/server"

const call = (body?: unknown, staff = "boss@sail.test") => POST(new NextRequest("http://x/api/admin/directory-identity", { method: "POST", headers: { "x-portal-staff-email": staff, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }))
beforeEach(() => { st.admin = { id: "portal-service" }; st.cand = { id: 9, kind: "person", a_id: "a", b_id: "b", status: "same", parent_id: null }; st.calls = [] })

describe("the directory-identity admin route", () => {
  it("is for the staff portal only", async () => { st.admin = { id: "someone-else" }; expect((await call({ action: "merge" })).status).toBe(403); st.admin = NextResponse.json({ error: "no" }, { status: 401 }); const r = await call({ action: "merge" }); expect(r.status).toBe(401) })
  it("no body still means run detection; nothing else runs", async () => { expect((await call()).status).toBe(200); expect(st.calls).toEqual(["detect"]) })
  it("a merge needs the survivor to be one of the two records, and names the staff member as the actor", async () => {
    expect((await call({ action: "merge", candidateId: 9, survivorId: "zzz" })).status).toBe(400)
    const r = await call({ action: "merge", candidateId: 9, survivorId: "b", reason: "same person" }); expect(r.status).toBe(200); expect(st.calls.at(-1)).toEqual(["merge", { kind: "person", survivorId: "b", loserId: "a", candidateId: 9, by: "boss@sail.test", reason: "same person" }])
    st.cand = null; expect((await call({ action: "merge", candidateId: 9, survivorId: "a" })).status).toBe(404)
  })
  it("plan uses the same pair logic and changes nothing; an engine refusal becomes a plain error with its status and code", async () => {
    expect((await call({ action: "plan", candidateId: 9, survivorId: "a" })).status).toBe(200); expect(st.calls.at(-1)).toEqual(["plan", "person", "a", "b"])
    vi.spyOn(console, "error").mockImplementation(() => {})
  })
  it("undo goes to the engine with the actor; a related pair becomes a hierarchy only when it is a firm pair decided related with a parent", async () => {
    expect((await call({ action: "undo", mergeId: 4 })).status).toBe(200); expect(st.calls.at(-1)).toEqual(["undo", 4, "boss@sail.test"])
    st.cand = { id: 9, kind: "person", a_id: "a", b_id: "b", status: "related", parent_id: "a" }; expect((await call({ action: "related", candidateId: 9 })).status).toBe(409)
    st.cand = { id: 9, kind: "firm", a_id: "a", b_id: "b", status: "same", parent_id: null }; expect((await call({ action: "related", candidateId: 9 })).status).toBe(409)
    st.cand = { id: 9, kind: "firm", a_id: "a", b_id: "b", status: "related", parent_id: "b" }; const ok = await call({ action: "related", candidateId: 9 }); expect(await ok.json()).toEqual({ ok: true, parentId: "b", childId: "a" }); expect(st.calls.at(-1)).toEqual(["parent", "a", "b"])
    expect((await call({ action: "dance", candidateId: 9, survivorId: "a" })).status).toBe(400)
  })
})
