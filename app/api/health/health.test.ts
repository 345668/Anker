import { describe, it, expect, vi, beforeEach } from "vitest"
const st = vi.hoisted(() => ({ ping: true, behind: [] as string[] | Error }))
vi.mock("@/lib/db", () => ({ sql: async () => { if (!st.ping) throw new Error("db down"); return [{ "?column?": 1 }] } }))
vi.mock("@/lib/migrations/schema-state", () => ({ schemaBehind: async () => { if (st.behind instanceof Error) throw st.behind; return st.behind } }))
import { GET } from "./route"

beforeEach(() => { st.ping = true; st.behind = [] })
describe("GET /api/health", () => {
  it("ok when the database answers and nothing is missing", async () => {
    const r = await GET(); expect(r.status).toBe(200); expect(await r.json()).toEqual({ ok: true, db: true, schemaBehind: 0 })
  })
  it("reports how many migrations are missing, never which ones", async () => {
    st.behind = ["2026-10-17-secret-feature.sql", "x.sql"]
    const j = await (await GET()).json(); expect(j).toEqual({ ok: false, db: true, schemaBehind: 2 }); expect(JSON.stringify(j)).not.toContain("secret-feature")
  })
  it("503 when the database does not answer", async () => {
    st.ping = false; const r = await GET(); expect(r.status).toBe(503); expect(await r.json()).toEqual({ ok: false, db: false })
  })
  it("an unreadable ledger is unknown, not a failure of the app", async () => {
    st.behind = new Error("no ledger"); const j = await (await GET()).json(); expect(j).toEqual({ ok: false, db: true, schemaBehind: null })
  })
})
