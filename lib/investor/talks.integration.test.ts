import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const state = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => state.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values), { unsafe: (q: string, values: unknown[]) => state.query(q, values) }) }))

import { readThread, sendMessage, setPrefs, unreadCounts, sendNudges, blockedByFund, MESSAGE_MAX, MESSAGES_PER_HOUR } from "./talks"

let db: PGlite
const sent: Array<{ to: string; subject: string; text: string }> = []
const send = async (m: { to: string; subject: string; text: string }) => { sent.push(m) }
const inv = { userId: "inv-1", senderId: "inv-1" }, fund = { fundId: "fund-1", senderId: "owner-1" }

async function rel(stage: string, extra = "") {
  const [r] = (await db.query<any>(`INSERT INTO fund_relationships (fund_id, entity_id, user_id, stage ${extra ? ", created_at" : ""}) VALUES ('fund-1', (SELECT id FROM investor_entities LIMIT 1), 'inv-1', '${stage}' ${extra ? `, ${extra}` : ""}) RETURNING id`)).rows
  return String(r.id)
}

beforeAll(async () => {
  db = new PGlite()
  state.query.mockImplementation(async (q, values) => (await db.query(q, values)).rows)
  await db.exec(`
    CREATE TABLE organizations(id text PRIMARY KEY, kind text, name text, fund_id text);
    CREATE TABLE memberships(id text PRIMARY KEY, user_id text, org_id text, org_role text, persona text);
    CREATE TABLE funds(id text PRIMARY KEY, name text, description text, vintage_year int, target_size numeric, currency text, status text, vehicle_kind text, listed_for_lps boolean DEFAULT false, listed_for_lps_at timestamptz, listed_for_lps_by text);
    CREATE TABLE profiles(id text PRIMARY KEY, email text, full_name text);
    CREATE TABLE platform_flags(key text PRIMARY KEY, enabled boolean, rollout_pct int, description text, updated_by text, updated_at timestamptz);
    CREATE TABLE fund_lps (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, fund_id text);
    CREATE TABLE notifications(id serial PRIMARY KEY, user_id text, org_id text, kind text, severity text DEFAULT 'info', title text, body text, href text, dedupe_key text, read_at timestamptz, created_at timestamptz DEFAULT now());
    CREATE UNIQUE INDEX notifications_dedupe ON notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
  `)
  await db.exec(readFileSync("scripts/migrations/2026-10-20-investor-side.sql", "utf8").replace("INSERT INTO platform_flags", "-- INSERT INTO platform_flags"))
  await db.exec(readFileSync("scripts/migrations/2026-10-20b-investor-talks.sql", "utf8"))
  await db.exec(readFileSync("scripts/migrations/2026-10-20c-investor-bridge.sql", "utf8"))
  await db.exec("CREATE TABLE data_room_documents(id text PRIMARY KEY, fund_id text, fund_lp_id text, title text, category text, file_url text, file_name text, byte_size bigint, archived_at timestamptz, created_at timestamptz DEFAULT now())")
  await db.exec(readFileSync("scripts/migrations/2026-10-20e-investor-materials.sql", "utf8"))
})
afterAll(async () => db.close())
beforeEach(async () => {
  sent.length = 0
  await db.exec(`DELETE FROM relationship_messages; DELETE FROM fund_relationships; DELETE FROM investor_entities; DELETE FROM investor_profiles; DELETE FROM notifications; DELETE FROM profiles; DELETE FROM memberships; DELETE FROM organizations; DELETE FROM funds;
    INSERT INTO funds(id, name) VALUES ('fund-1','Alpha'), ('fund-2','Beta');
    INSERT INTO organizations VALUES ('org-1','fund','Alpha Partners','fund-1'), ('org-2','fund','Beta Partners','fund-2');
    INSERT INTO memberships VALUES ('m1','owner-1','org-1','workspace_owner','vc'), ('m2','admin-1','org-1','admin','vc'), ('m3','member-1','org-1','member','vc'), ('m4','owner-2','org-2','workspace_owner','vc');
    INSERT INTO profiles VALUES ('inv-1','ann@example.com','Ann'), ('inv-2','bob@example.com','Bob');
    INSERT INTO investor_profiles (user_id, display_name, terms_version, terms_accepted_at) VALUES ('inv-1','Ann','2026-10',now()), ('inv-2','Bob','2026-10',now());
    INSERT INTO investor_entities (user_id, legal_name, kind) VALUES ('inv-1','Ann','individual');`)
})

describe("who can write, and when", () => {
  it("nobody writes before the fund has accepted", async () => {
    const id = await rel("interested")
    await expect(sendMessage("investor", inv, id, "Hello", send)).rejects.toMatchObject({ code: "closed", status: 409 })
    await expect(sendMessage("fund", fund, id, "Hello", send)).rejects.toMatchObject({ code: "closed" })
  })
  it("both sides write once in talks; a closed stage is readable but not writable", async () => {
    const id = await rel("in_talks")
    await sendMessage("fund", fund, id, "Thanks for your interest.", send)
    await sendMessage("investor", inv, id, "Happy to talk.", send)
    const t = await readThread("investor", { userId: "inv-1" }, id)
    expect(t).toMatchObject({ stage: "in_talks", writable: true })
    expect(t.messages.map((m) => [m.from, m.body])).toEqual([["fund", "Thanks for your interest."], ["investor", "Happy to talk."]])
    await db.exec("UPDATE fund_relationships SET stage = 'declined'")
    expect(await readThread("investor", { userId: "inv-1" }, id)).toMatchObject({ writable: false })
    await expect(sendMessage("investor", inv, id, "More", send)).rejects.toMatchObject({ code: "closed" })
  })
  it("checks the text: not empty, within the limit, and a rate limit per sender", async () => {
    const id = await rel("in_talks")
    await expect(sendMessage("fund", fund, id, "   ", send)).rejects.toThrow(/Write a message/)
    await expect(sendMessage("fund", fund, id, "x".repeat(MESSAGE_MAX + 1), send)).rejects.toThrow(/Keep a message/)
    for (let i = 0; i < MESSAGES_PER_HOUR; i++) await sendMessage("fund", fund, id, `m${i}`, send)
    await expect(sendMessage("fund", fund, id, "one more", send)).rejects.toMatchObject({ code: "rate", status: 429 })
    await expect(sendMessage("investor", inv, id, "I can still write", send)).resolves.toMatchObject({ from: "investor" })
  })
  it("a side reads only its own relationships' threads", async () => {
    const id = await rel("in_talks")
    await sendMessage("fund", fund, id, "private to this pair", send)
    await expect(readThread("investor", { userId: "inv-2" }, id)).rejects.toMatchObject({ status: 404 })
    await expect(readThread("fund", { fundId: "fund-2" }, id)).rejects.toMatchObject({ status: 404 })
    await expect(sendMessage("fund", { fundId: "fund-2", senderId: "owner-2" }, id, "intrude", send)).rejects.toMatchObject({ status: 404 })
    await expect(sendMessage("investor", { userId: "inv-2", senderId: "inv-2" }, id, "intrude", send)).rejects.toMatchObject({ status: 404 })
  })
})

describe("read marks and notifications", () => {
  it("opening a thread marks the other side's messages read, and counts show what is unread", async () => {
    const id = await rel("in_talks")
    await sendMessage("fund", fund, id, "one", send); await sendMessage("fund", fund, id, "two", send)
    expect(await unreadCounts("investor", { userId: "inv-1" })).toEqual({ [id]: 2 })
    expect(await unreadCounts("fund", { fundId: "fund-1" })).toEqual({})
    await readThread("investor", { userId: "inv-1" }, id)
    expect(await unreadCounts("investor", { userId: "inv-1" })).toEqual({})
  })
  it("tells the investor by email with no content, once an hour, and not when muted", async () => {
    const id = await rel("in_talks")
    await sendMessage("fund", fund, id, "The amount is 5,000,000 and the fund is Secret Fund.", send)
    await sendMessage("fund", fund, id, "second", send)
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe("ann@example.com"); expect(sent[0].text).toContain("/investor/requests")
    expect(sent[0].subject + sent[0].text).not.toMatch(/5,000,000|Secret|amount/)
    await db.exec("UPDATE fund_relationships SET investor_notified_at = now() - interval '2 hours'")
    await sendMessage("fund", fund, id, "third", send); expect(sent).toHaveLength(2)
    await setPrefs("investor", { userId: "inv-1" }, id, "mute")
    await db.exec("UPDATE fund_relationships SET investor_notified_at = now() - interval '2 hours'")
    await sendMessage("fund", fund, id, "fourth", send); expect(sent).toHaveLength(2)
  })
  it("tells the fund's owners and admins in the app, with no content, and not its members", async () => {
    const id = await rel("in_talks")
    await sendMessage("investor", inv, id, "I would like 5,000,000 in.", send)
    const n = (await db.query<any>("SELECT user_id, body, title FROM notifications WHERE kind = 'investor_message' ORDER BY user_id")).rows
    expect(n.map((x) => x.user_id)).toEqual(["admin-1", "owner-1"])
    expect(JSON.stringify(n)).not.toMatch(/5,000,000/)
    expect(sent).toHaveLength(0)
  })
})

describe("mute and block", () => {
  it("a fund's block declines the request, closes the thread and stops that person asking again", async () => {
    const id = await rel("in_talks")
    await sendMessage("fund", fund, id, "hi", send)
    expect(await setPrefs("fund", { fundId: "fund-1" }, id, "block")).toMatchObject({ stage: "declined" })
    expect(await blockedByFund("inv-1", "fund-1")).toBe(true); expect(await blockedByFund("inv-2", "fund-1")).toBe(false); expect(await blockedByFund("inv-1", "fund-2")).toBe(false)
    await expect(sendMessage("investor", inv, id, "please", send)).rejects.toMatchObject({ code: "closed" })
    expect((await readThread("investor", { userId: "inv-1" }, id)).messages).toHaveLength(1)           // history stays readable
  })
  it("an investor's block withdraws, and the fund can still ask nobody", async () => {
    const id = await rel("in_talks")
    expect(await setPrefs("investor", { userId: "inv-1" }, id, "block")).toMatchObject({ stage: "withdrawn" })
    expect(await blockedByFund("inv-1", "fund-1")).toBe(false)                                          // only a fund's block stops new requests
    await expect(sendMessage("fund", fund, id, "hello?", send)).rejects.toMatchObject({ code: "closed" })
  })
})

describe("nudges", () => {
  it("reminds the fund once about a request waiting a week, never declines, and the two-week offer is shown by date only", async () => {
    const old = await rel("interested", "now() - interval '8 days'")
    await db.exec("INSERT INTO investor_entities (user_id, legal_name, kind) VALUES ('inv-2','Bob','individual')")
    await db.query("INSERT INTO fund_relationships (fund_id, entity_id, user_id, stage) VALUES ('fund-1', (SELECT id FROM investor_entities WHERE user_id = 'inv-2'), 'inv-2', 'interested')")
    expect(await sendNudges(send)).toEqual({ reminded: 1, asked: 0 })
    expect((await db.query<any>("SELECT user_id FROM notifications WHERE kind = 'investor_request' ORDER BY user_id")).rows.map((x) => x.user_id)).toEqual(["admin-1", "owner-1"])
    expect(await sendNudges(send)).toEqual({ reminded: 0, asked: 0 })                                    // once
    expect((await db.query<any>("SELECT stage FROM fund_relationships WHERE id = $1", [old])).rows[0].stage).toBe("interested")
  })
  it("asks both sides once about a conversation quiet for a month, and not again within a month", async () => {
    const id = await rel("in_talks")
    await db.query("UPDATE fund_relationships SET decided_at = now() - interval '31 days', created_at = now() - interval '40 days' WHERE id = $1", [id])
    expect(await sendNudges(send)).toEqual({ reminded: 0, asked: 1 })
    expect(sent).toHaveLength(1); expect(sent[0].to).toBe("ann@example.com"); expect(sent[0].text).not.toMatch(/Alpha/)
    expect((await db.query<any>("SELECT count(*)::int n FROM notifications WHERE kind = 'investor_request'")).rows[0].n).toBe(2)
    expect(await sendNudges(send)).toEqual({ reminded: 0, asked: 0 })
    expect((await db.query<any>("SELECT stage FROM fund_relationships WHERE id = $1", [id])).rows[0].stage).toBe("in_talks")
    await sendMessage("fund", fund, id, "still interested?", send)                                       // a recent message keeps it from going quiet again
    await db.query("UPDATE fund_relationships SET quiet_asked_at = now() - interval '31 days' WHERE id = $1", [id])
    expect(await sendNudges(send)).toEqual({ reminded: 0, asked: 0 })
  })
})
