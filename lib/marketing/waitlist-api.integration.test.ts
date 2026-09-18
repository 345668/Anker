import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

/**
 * The surface the staff portal (SAIL) relays to. Its gate matters more than its
 * body: the service bearer is full admin upstream, so an ungated route here
 * would hand the early-access queue — and the ability to mint signup
 * credentials — to anything that can reach the relay.
 */
const state = vi.hoisted(() => ({ sql: vi.fn(), admin: true, sent: [] as any[] }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({ sql: state.sql }))
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () => state.admin ? { id: "portal-service", email: null } : NextResponse.json({ error: "Not signed in" }, { status: 401 }),
}))
vi.mock("@/lib/email/resend", () => ({
  sendEmail: async (input: any) => { state.sent.push(input); return { resendId: "re_test_1" } },
}))
import { GET, POST } from "@/app/api/admin/waitlist/route"

let db: PGlite
const migration = (name: string) => readFileSync(`scripts/migrations/${name}`, "utf8")
const post = (body: unknown) => POST(new NextRequest("http://localhost/api/admin/waitlist", {
  method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
}))
const get = (search = "") => GET(new NextRequest(`http://localhost/api/admin/waitlist${search}`))

beforeAll(async () => {
  db = new PGlite()
  for (const name of ["2026-08-31-early-access-requests.sql", "2026-09-14-waitlist-signups.sql",
    "2026-09-18-waitlist-attribution.sql", "2026-09-18-waitlist-invitations.sql"]) await db.exec(migration(name))
}, 30000)

beforeEach(async () => {
  state.admin = true; state.sent = []
  state.sql.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) =>
    (await db.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values)).rows)
  await db.exec("DELETE FROM early_access_requests")
  await db.exec("INSERT INTO early_access_requests(id,name,email,email_key,status) VALUES ('r1','Test','a@example.invalid','a@example.invalid','pending')")
})
afterAll(async () => db.close())

it("refuses to read or act without an admin principal, before touching the database", async () => {
  state.admin = false; state.sql.mockClear()
  expect((await get()).status).toBe(401)
  expect((await post({ action: "invite", id: "r1" })).status).toBe(401)
  expect(state.sql).not.toHaveBeenCalled()
  expect(state.sent).toHaveLength(0)
})

it("reports the queue with counts and the configured link lifetime", async () => {
  const body = await (await get()).json()
  expect(body.rows).toHaveLength(1)
  expect(body.counts).toMatchObject({ pending: 1 })
  // The portal renders its TTL control from this, rather than hard-coding it.
  expect(body.ttl).toMatchObject({ default: 14, min: 1, max: 90 })
})

it("rejects an unknown action instead of falling through to a default", async () => {
  for (const action of ["delete", "", null, "APPROVE"]) {
    expect((await post({ action, id: "r1" })).status).toBe(400)
  }
  expect((await post({ action: "invite" })).status).toBe(400)
  expect(state.sent).toHaveLength(0)
})

it("invites through the same lifecycle the console uses, honouring a per-send lifetime", async () => {
  expect((await post({ action: "approve", id: "r1" })).status).toBe(200)
  expect((await post({ action: "invite", id: "r1", ttlDays: 2 })).status).toBe(200)
  expect(state.sent).toHaveLength(1)
  const [row] = (await db.query<{ status: string; invite_token_hash: string; invite_resend_id: string; days: number }>(
    "SELECT status,invite_token_hash,invite_resend_id,round(extract(epoch from invite_expires_at-now())/86400) AS days FROM early_access_requests")).rows
  expect(row.status).toBe("invited")
  expect(row.invite_token_hash).toBeTruthy()
  expect(row.invite_resend_id).toBe("re_test_1")
  expect(Number(row.days)).toBe(2)
  // The raw token must never leave through this API — only through the email.
  const emailed = JSON.stringify(state.sent[0])
  expect(emailed).toContain("/register?invite=")
  const listed = JSON.stringify(await (await get()).json())
  expect(listed).not.toContain("invite_token")
})

it("answers a state conflict with 409, not a generic failure", async () => {
  await db.exec("UPDATE early_access_requests SET accepted_at=now(), status='accepted'")
  const res = await post({ action: "invite", id: "r1" })
  expect(res.status).toBe(409)
  expect((await res.json()).ok).toBe(false)
  expect(state.sent).toHaveLength(0)
})
