/** The outbox pages: stable order, no overlap or gaps, an offset past the end is empty. The page exists because 200 long cards froze the browser tab. */
import { PGlite } from "@electric-sql/pglite"
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
const h = vi.hoisted(() => ({ sql: vi.fn() as any }))
vi.mock("@/lib/db", () => ({ sql: h.sql }))
import { listOutbox } from "./email-outbox"

let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE crm_entries (id text PRIMARY KEY, display_name text, display_email text, display_type text);
    CREATE TABLE outreach_messages (id text PRIMARY KEY, crm_entry_id text, user_id text, kind text DEFAULT 'email_intro', step_number int DEFAULT 0, channel text DEFAULT 'email', status text DEFAULT 'draft', body text DEFAULT 'b', subject text DEFAULT 's',
      needs_followup boolean DEFAULT false, followup_due_at timestamptz, sent_at timestamptz, updated_at timestamptz DEFAULT now(), opens int DEFAULT 0, clicks int DEFAULT 0);`)
  for (let i = 0; i < 60; i++) {
    await db.query("INSERT INTO crm_entries VALUES ($1,$2,$3,'fund')", [`e${String(i).padStart(2, "0")}`, `P${i}`, `p${i}@x.test`])
    // two steps for some entries, so the order must break ties on step and id
    await db.query("INSERT INTO outreach_messages (id, crm_entry_id, step_number) VALUES ($1,$2,0)", [`m${String(i).padStart(2, "0")}a`, `e${String(i).padStart(2, "0")}`])
    if (i % 3 === 0) await db.query("INSERT INTO outreach_messages (id, crm_entry_id, step_number, kind) VALUES ($1,$2,3,'follow_up')", [`m${String(i).padStart(2, "0")}b`, `e${String(i).padStart(2, "0")}`])
  }
  h.sql.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => (await db.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values)).rows)
}, 30000)
afterAll(async () => db.close())

describe("listOutbox paging", () => {
  it("pages cover every draft exactly once, in a stable order", async () => {
    const seen: string[] = []
    for (let off = 0; off < 100; off += 25) seen.push(...(await listOutbox({ bucket: "drafts", limit: 25, offset: off })).map((r: any) => r.id))
    expect(seen).toHaveLength(80); expect(new Set(seen).size).toBe(80)
    const whole = (await listOutbox({ bucket: "drafts", limit: 500 })).map((r: any) => r.id)
    expect(seen).toEqual(whole)
  })
  it("an offset past the end is an empty page, and a negative or fractional offset is treated safely", async () => {
    expect(await listOutbox({ bucket: "drafts", limit: 25, offset: 500 })).toEqual([])
    expect((await listOutbox({ bucket: "drafts", limit: 5, offset: -10 })).length).toBe(5)
    expect((await listOutbox({ bucket: "drafts", limit: 5, offset: 2.9 }))[0].id).toBe((await listOutbox({ bucket: "drafts", limit: 5, offset: 2 }))[0].id)
  })
  it("every other bucket accepts an offset too", async () => {
    for (const bucket of ["sent", "needs_followup", "failed", "all"] as const) expect(await listOutbox({ bucket, limit: 10, offset: 0 })).toBeDefined()
    expect((await listOutbox({ bucket: "all", limit: 10, offset: 70 })).length).toBe(10)
  })
})
