import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
const state = vi.hoisted(() => ({ sql: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({ sql: state.sql }))
import { clampTtlDays, configuredTtlDays, hashInviteToken, markInviteAccepted, mintInvite, revokeInvite, setRequestStatus, verifyInvite, inviteUrl, INVITE_TTL_DEFAULT_DAYS, INVITE_TTL_MAX_DAYS } from "./invitations"

let db: PGlite
const migration = (name: string) => readFileSync(`scripts/migrations/${name}`, "utf8")
const INVITED = "invited@example.invalid"

async function seed(id = "req-1", email = INVITED) {
  await db.query("INSERT INTO early_access_requests(id,name,email,email_key,status) VALUES ($1,'Test',$2,$2,'pending')", [id, email])
  return id
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(migration("2026-08-31-early-access-requests.sql"))
  await db.exec(migration("2026-09-14-waitlist-signups.sql"))
  await db.exec(migration("2026-09-18-waitlist-attribution.sql"))
  await db.exec(migration("2026-09-18-waitlist-invitations.sql"))
}, 30000)

beforeEach(async () => {
  state.sql.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) =>
    (await db.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values)).rows)
  await db.exec("DELETE FROM early_access_requests")
})
afterAll(async () => db.close())

it("stores only the hash of a token and never the token itself", async () => {
  const id = await seed()
  const minted = await mintInvite(id)
  expect(minted?.token).toBeTruthy()
  const [row] = (await db.query<{ invite_token_hash: string; status: string }>(
    "SELECT invite_token_hash,status FROM early_access_requests")).rows
  expect(row.invite_token_hash).toBe(hashInviteToken(minted!.token))
  expect(row.invite_token_hash).not.toContain(minted!.token)
  expect(row.status).toBe("invited")
})

it("refuses a token presented with a different email address", async () => {
  const minted = await mintInvite(await seed())
  // The whole point of email binding: a forwarded link is useless.
  expect((await verifyInvite(minted!.token, "someone.else@example.invalid")).ok).toBe(false)
  expect((await verifyInvite(minted!.token, INVITED)).ok).toBe(true)
})

it("is single-use — a second signup with the same token is refused", async () => {
  const id = await seed()
  const minted = await mintInvite(id)
  const first = await verifyInvite(minted!.token, INVITED)
  expect(first.ok).toBe(true)
  expect(await markInviteAccepted(first.requestId!)).toBe(true)
  expect((await verifyInvite(minted!.token, INVITED)).ok).toBe(false)
  // Spending it twice must not happen even if the caller retries.
  expect(await markInviteAccepted(id)).toBe(false)
})

it("does not spend the token when verification succeeds but the account is never created", async () => {
  const minted = await mintInvite(await seed())
  await verifyInvite(minted!.token, INVITED)
  // No markInviteAccepted — the signup failed after this point (weak password,
  // address already registered). The applicant's link must still work.
  expect((await verifyInvite(minted!.token, INVITED)).ok).toBe(true)
})

it("stops working once revoked, and revoking cannot take back an accepted account", async () => {
  const id = await seed()
  const minted = await mintInvite(id)
  expect(await revokeInvite(id)).toBe(true)
  expect((await verifyInvite(minted!.token, INVITED)).ok).toBe(false)

  const second = await seed("req-2", "taken@example.invalid")
  const other = await mintInvite(second)
  await markInviteAccepted((await verifyInvite(other!.token, "taken@example.invalid")).requestId!)
  expect(await revokeInvite(second)).toBe(false)
})

it("rejects an expired invitation", async () => {
  const id = await seed()
  const minted = await mintInvite(id)
  await db.exec("UPDATE early_access_requests SET invite_expires_at = now() - interval '1 day'")
  expect((await verifyInvite(minted!.token, INVITED)).ok).toBe(false)
})

it("invalidates the previous link when an invitation is resent", async () => {
  const id = await seed()
  const first = await mintInvite(id)
  const second = await mintInvite(id)
  expect(second!.token).not.toBe(first!.token)
  expect((await verifyInvite(first!.token, INVITED)).ok).toBe(false)
  expect((await verifyInvite(second!.token, INVITED)).ok).toBe(true)
})

it("never re-invites an applicant who already has an account", async () => {
  const id = await seed()
  const minted = await mintInvite(id)
  await markInviteAccepted((await verifyInvite(minted!.token, INVITED)).requestId!)
  expect(await mintInvite(id)).toBeNull()
  expect(await setRequestStatus(id, "declined")).toBe(false)
})

it("gives the same message for an unknown token and a mismatched email", async () => {
  const minted = await mintInvite(await seed())
  const unknown = await verifyInvite("not-a-real-token", INVITED)
  const mismatch = await verifyInvite(minted!.token, "other@example.invalid")
  // Different messages would let an attacker probe which addresses are invited.
  expect(unknown.reason).toBe(mismatch.reason)
})

it("rejects an empty or whitespace token instead of matching a row", async () => {
  await mintInvite(await seed())
  for (const token of ["", "   ", "null"]) expect((await verifyInvite(token, INVITED)).ok).toBe(false)
})

it("records approval without issuing a token", async () => {
  const id = await seed()
  expect(await setRequestStatus(id, "approved")).toBe(true)
  const [row] = (await db.query<{ status: string; approved_at: string | null; invite_token_hash: string | null }>(
    "SELECT status,approved_at,invite_token_hash FROM early_access_requests")).rows
  expect(row).toMatchObject({ status: "approved", invite_token_hash: null })
  expect(row.approved_at).toBeTruthy()
})

it("takes the lifetime from WAITLIST_INVITE_TTL_DAYS and lets one send override it", async () => {
  const days = (iso: string) => Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000)
  process.env.WAITLIST_INVITE_TTL_DAYS = "3"
  try {
    expect(configuredTtlDays()).toBe(3)
    const configured = await mintInvite(await seed())
    expect(configured!.ttlDays).toBe(3)
    expect(days(configured!.expiresAt.toISOString())).toBe(3)
    // A single send may widen or narrow it without changing the default.
    const override = await mintInvite("req-1", { ttlDays: 30 })
    expect(override!.ttlDays).toBe(30)
    expect(configuredTtlDays()).toBe(3)
  } finally { delete process.env.WAITLIST_INVITE_TTL_DAYS }
})

it("never mints a token that outlives the bound, whatever the input", async () => {
  // An env typo or a hand-edited request must not produce a permanent
  // credential — out-of-range and nonsense values fall back to the default.
  for (const bad of ["0", "-5", "9999", "forever", "", "1e9"]) {
    process.env.WAITLIST_INVITE_TTL_DAYS = bad
    expect(configuredTtlDays()).toBe(INVITE_TTL_DEFAULT_DAYS)
  }
  delete process.env.WAITLIST_INVITE_TTL_DAYS
  for (const bad of [0, -5, 9999, "forever", null, undefined, NaN]) expect(clampTtlDays(bad)).toBeNull()
  expect(clampTtlDays(INVITE_TTL_MAX_DAYS)).toBe(INVITE_TTL_MAX_DAYS)
  expect(clampTtlDays("7.9")).toBe(7)
  const minted = await mintInvite(await seed(), { ttlDays: 9999 })
  expect(minted!.ttlDays).toBe(INVITE_TTL_DEFAULT_DAYS)
})

it("builds a register link that carries the token", () => {
  expect(inviteUrl("abc/123", "https://www.an-ker.de/")).toBe("https://www.an-ker.de/register?invite=abc%2F123")
})
