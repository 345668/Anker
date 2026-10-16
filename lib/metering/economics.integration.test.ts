import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
const st = vi.hoisted(() => ({ q: null as any }))
vi.mock("@/lib/db", () => { const f: any = (s: TemplateStringsArray, ...v: unknown[]) => st.q(s.reduce((q, t, i) => q + (i ? `$${i}` : "") + t, ""), v); return { sql: f } })
vi.mock("./allowance", () => ({ allowanceOf: async (org: string) => (org === "o1" ? { limit: 1, used: 1.2, remaining: 0, pct: 1.2 } : { limit: null, used: 0, remaining: null, pct: null }) }))
import { economics, saveBill, BillError } from "./economics"

let db: PGlite
beforeAll(async () => {
  db = new PGlite(); st.q = async (q: string, v: unknown[] = []) => (await db.query(q, v)).rows
  await db.exec(`CREATE TABLE organizations (id text PRIMARY KEY, name text); INSERT INTO organizations VALUES ('o1','Acme Fund'), ('o2','Beta');
    CREATE TABLE ai_calls (id serial PRIMARY KEY, created_at timestamptz DEFAULT now(), task text, workspace_id text, run_id text, cost_usd numeric, cost_center text);
    INSERT INTO ai_calls (task, workspace_id, run_id, cost_usd, cost_center) VALUES
      ('assistant_chat','o1','r1',0.5,'workspace:o1'), ('assistant_chat','o1','r1',0.25,'workspace:o1'), ('assistant_chat','o1','r2',0.1,'workspace:o1'), ('assistant_chat','o2','r3',0.05,'workspace:o2'),
      ('ai_rationale',NULL,NULL,0.2,'platform:ai_rationale');`)
  for (const f of ["2026-10-16o-metering-m2", "2026-10-16q-metering-m3"]) await db.exec(readFileSync(`scripts/migrations/${f}.sql`, "utf8"))
  await db.exec("INSERT INTO usage_events (org_id, cost_center, unit, qty, cost_usd, cost_state, source) VALUES ('o1','workspace:o1','asr_second',100,0.003,'exact','t'), (NULL,'platform:embeddings','embed_token',1000,0.00007,'estimated','embeddings')")
}, 30000)
afterAll(async () => db.close())

describe("economics", () => {
  it("totals split into customer and platform cost, workspaces are ranked with their limits, and cost per run has a median and a worst case", async () => {
    const e = await economics()
    expect(e.totals.aiUsd).toBeCloseTo(0.1 + 0.25 + 0.5 + 0.05 + 0.2, 6); expect(e.totals.unitsUsd).toBeCloseTo(0.00307, 6)
    expect(e.totals.platformUsd).toBeCloseTo(0.2 + 0.00007, 6); expect(e.totals.workspaceUsd).toBeCloseTo(0.9 + 0.003, 6)
    expect(e.workspaces[0]).toMatchObject({ orgId: "o1", name: "Acme Fund", limit: 1, pct: 1.2 }); expect(e.workspaces[1]).toMatchObject({ orgId: "o2", limit: null })
    const chat = e.tasks.find((t) => t.task === "assistant_chat")!
    expect(chat).toMatchObject({ runs: 3, calls: 4 }); expect(chat.p50).toBeCloseTo(0.1, 6); expect(chat.p95!).toBeGreaterThan(0.6)      // runs cost 0.75, 0.1 and 0.05
    expect(e.tasks.find((t) => t.task === "ai_rationale")).toBeUndefined()      // no run id, so no "job" to cost
    expect(e.units.map((u) => u.unit)).toEqual(["asr_second", "embed_token"])
  })
  it("the provider bill is saved per month and provider, validated, and replaced when entered again", async () => {
    await saveBill({ month: "2026-10", provider: " DashScope ", amountUsd: 12.5, note: "invoice 1" }, "founder")
    await saveBill({ month: "2026-10", provider: "dashscope", amountUsd: 13 }, "founder")
    const bills = (await economics()).bills; expect(bills).toEqual([{ month: "2026-10", provider: "dashscope", amountUsd: 13, note: null }])
    for (const bad of [{ month: "10/2026", provider: "x1", amountUsd: 1 }, { month: "2026-10", provider: "", amountUsd: 1 }, { month: "2026-10", provider: "dashscope", amountUsd: -1 }, { month: "2026-13", provider: "dashscope", amountUsd: 1 }])
      await expect(saveBill(bad, "f")).rejects.toBeInstanceOf(BillError)
  })
})
