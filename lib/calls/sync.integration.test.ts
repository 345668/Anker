import { afterAll, beforeAll, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
const mock = vi.hoisted(() => ({ sql: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: mock.sql }))
vi.mock("@/lib/supabase/server", () => ({}))
vi.mock("@/lib/org/active", () => ({}))
import { saveCall, getCall, claimAnalysis, createCallFollowup, deleteCall } from "./records"
import { authenticateDevice, createDevice, tokenHash } from "./devices"
import type { CallScope } from "./access"
let db: PGlite
const a: CallScope = { userId: "u", orgId: "a", persona: "founder", writable: true, workspace: "Company" }
const b: CallScope = { ...a, orgId: "b", persona: "vc", workspace: "Fund" }
const other: CallScope = { ...a, userId: "other" }
const lp: CallScope = { ...a, userId: "lp", persona: "lp" }
const input = () => ({ title: "Diligence", transcript: "You: Could you send the revenue model? Other: Yes, tomorrow.", externalId: randomUUID(), consent: true })
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE organizations(id text PRIMARY KEY, name text);
    CREATE TABLE memberships(user_id text, org_id text, persona text, org_role text);
    CREATE TABLE crm_entries(id text PRIMARY KEY, user_id text, display_name text, display_email text, stage text);
    CREATE TABLE outreach_messages(id text PRIMARY KEY DEFAULT gen_random_uuid()::text, user_id text, crm_entry_id text, kind text,
      step_number int, channel text, body text, status text, subject text, email_to text, tracking_id text,
      created_at timestamptz, updated_at timestamptz, UNIQUE(crm_entry_id,kind));
    INSERT INTO organizations VALUES ('a','Company'),('b','Fund');
    INSERT INTO memberships VALUES ('u','a','founder','workspace_owner'),('u','b','vc','member'),('other','a','founder','member'),('lp','a','lp','member');
    INSERT INTO crm_entries VALUES ('mine','u','Alex','alex@example.com','queued'),('foreign','other','Foreign','other@example.com','queued');`)
  for (const f of ["2026-09-06-investor-calls.sql", "2026-09-10-call-intelligence-sync.sql"]) await db.exec(readFileSync(new URL(`../../scripts/migrations/${f}`, import.meta.url), "utf8"))
  // Migration is safe to rerun without changing or assigning legacy data.
  await db.exec(readFileSync(new URL("../../scripts/migrations/2026-09-10-call-intelligence-sync.sql", import.meta.url), "utf8"))
  mock.sql.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => (await db.query(strings.reduce((q, chunk, i) => q + (i ? `$${i}` : "") + chunk, ""), values)).rows)
})
afterAll(async () => { await db.close() })

it("isolates personal calls within the same workspace and across workspaces; does not advance CRM", async () => {
  const payload = { ...input(), crmEntryId: "mine" }
  const saved = await saveCall(a, payload)
  expect((await getCall(a, saved.call.id)).transcript).toBe(payload.transcript)
  await expect(getCall(b, saved.call.id)).rejects.toMatchObject({ status: 404 })
  await expect(getCall(other, saved.call.id)).rejects.toMatchObject({ status: 404 })
  await expect(saveCall(a, { ...input(), crmEntryId: "foreign" })).rejects.toMatchObject({ status: 404 })
  await expect(saveCall(lp, { ...input(), crmEntryId: "mine" })).rejects.toMatchObject({ status: 403 })
  await expect(saveCall({ ...a, writable: false }, input())).rejects.toMatchObject({ status: 403 })
  expect((await db.query("SELECT stage FROM crm_entries WHERE id='mine'")).rows[0]).toEqual({ stage: "queued" })
})
it("deduplicates concurrent imports and rejects reused IDs with different content", async () => {
  const payload = input()
  const results = await Promise.all([saveCall(a, payload, "desktop"), saveCall(a, payload, "desktop")])
  expect(results[0].call.id).toBe(results[1].call.id)
  expect(results.filter(r => !r.duplicate)).toHaveLength(1)
  await expect(saveCall(a, { ...payload, title: "Changed" })).rejects.toMatchObject({ status: 409 })
  expect((await saveCall(b, payload)).call.id).not.toBe(results[0].call.id)
  await expect(saveCall(a, { ...input(), consent: false })).rejects.toMatchObject({ status: 400 })
  await expect(saveCall(a, { ...input(), transcript: "a".repeat(60001) })).rejects.toMatchObject({ status: 400 })
})
it("purges deleted content without allowing a delayed desktop retry to resurrect it", async () => {
  const payload = input()
  const saved = await saveCall(a, payload, "desktop")
  await expect(deleteCall(b, saved.call.id)).rejects.toMatchObject({ status: 404 })
  await deleteCall(a, saved.call.id)
  await expect(getCall(a, saved.call.id)).rejects.toMatchObject({ status: 404 })
  await expect(saveCall(a, payload, "desktop")).rejects.toMatchObject({ status: 410 })
  const [receipt] = (await db.query("SELECT transcript,summary,title,status FROM investor_calls WHERE id=$1", [saved.call.id])).rows
  expect(receipt).toEqual({ transcript: null, summary: null, title: null, status: "deleted" })
})
it("stores only credential hashes; rejects revoked, expired and demoted devices", async () => {
  const paired = await createDevice(a, "Laptop")
  const [row] = (await db.query("SELECT * FROM call_sync_devices WHERE id=$1", [paired.device.id])).rows as Array<{ token_hash: string }>
  expect(row.token_hash).toBe(tokenHash(paired.token))
  expect(JSON.stringify(row)).not.toContain(paired.token)
  expect(await authenticateDevice(`Bearer ${paired.token}`)).toMatchObject({ userId: "u", orgId: "a", persona: "founder" })
  await db.query("UPDATE memberships SET org_role='viewer' WHERE user_id='u' AND org_id='a'")
  await expect(authenticateDevice(`Bearer ${paired.token}`)).rejects.toMatchObject({ status: 401 })
  await db.query("UPDATE memberships SET org_role='member' WHERE user_id='u' AND org_id='a'")
  await db.query("UPDATE call_sync_devices SET expires_at=now()-interval '1 second' WHERE id=$1", [paired.device.id])
  await expect(authenticateDevice(`Bearer ${paired.token}`)).rejects.toMatchObject({ status: 401 })
  await db.query("UPDATE call_sync_devices SET expires_at=now()+interval '1 day', revoked_at=now() WHERE id=$1", [paired.device.id])
  await expect(authenticateDevice(`Bearer ${paired.token}`)).rejects.toMatchObject({ status: 401 })
})
it("leases one analysis at a time and permits recovery after an interrupted run", async () => {
  const saved = await saveCall(a, input())
  const first = await claimAnalysis(a, saved.call.id)
  await expect(claimAnalysis(a, saved.call.id)).rejects.toMatchObject({ status: 409 })
  await db.query("UPDATE investor_calls SET analysis_started_at=now()-interval '4 minutes' WHERE id=$1", [saved.call.id])
  const next = await claimAnalysis(a, saved.call.id)
  expect(next.runId).not.toBe(first.runId)
})
it("creates one reviewed draft on retries and preserves other sent follow-ups", async () => {
  const call = await saveCall(a, { ...input(), crmEntryId: "mine" })
  const attempts = await Promise.allSettled([createCallFollowup(a, call.call.id, "Reviewed text"), createCallFollowup(a, call.call.id, "Reviewed text")])
  expect(attempts.some(r => r.status === "fulfilled")).toBe(true)
  const again = await createCallFollowup(a, call.call.id, "Edited after retry")
  expect(again.duplicate).toBe(true)
  const messages = (await db.query("SELECT * FROM outreach_messages")).rows
  expect(messages).toHaveLength(1)
  expect(messages[0]).toMatchObject({ body: "Reviewed text", status: "draft" })
  await db.query("UPDATE outreach_messages SET status='sent'")
  const second = await saveCall(a, { ...input(), crmEntryId: "mine" })
  await expect(createCallFollowup(a, second.call.id, "Another call")).rejects.toMatchObject({ status: 409 })
  expect((await db.query("SELECT status,body FROM outreach_messages")).rows[0]).toMatchObject({ status: "sent", body: "Reviewed text" })
  await expect(createCallFollowup(lp, call.call.id, "Test")).rejects.toMatchObject({ status: 403 })
})
