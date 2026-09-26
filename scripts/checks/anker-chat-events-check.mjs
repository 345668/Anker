/**
 * Validate scripts/migrations/2026-09-26-anker-chat-events.sql against a
 * throwaway in-memory PGlite database. Never connects to Neon.
 *
 *   node scripts/checks/anker-chat-events-check.mjs
 *
 * The fixtures are chosen for the cases that would be expensive to discover in
 * production: a chat with a NULL scope (the legacy rows phase 1 left unassigned),
 * a chat whose messages blob is not an array, and a second run of the whole file.
 */
import { PGlite } from "@electric-sql/pglite"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MIGRATION = process.argv[2] ?? path.join(HERE, "..", "migrations", "2026-09-26-anker-chat-events.sql")

const db = new PGlite()
let failures = 0
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`)
}
const rejects = async (q) => { try { await db.query(q); return "accepted" } catch { return "rejected" } }
const one = async (q) => (await db.query(q)).rows[0]
const all = async (q) => (await db.query(q)).rows

await db.exec(`
CREATE TABLE anker_chats(
  id text PRIMARY KEY, user_id text, scope_key text, title text, model text,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb, revision integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

INSERT INTO anker_chats(id,user_id,scope_key,title,model,messages) VALUES
  ('c1','u1','org:a','Raise','m','[{"role":"user","content":"who are my LPs"},{"role":"assistant","content":"Three."}]'),
  ('c2','u1','org:b','Other','m','[{"role":"user","content":"beta"}]'),
  -- A legacy row phase 1 deliberately left unassigned (doc 00 §3).
  ('c3','u1',NULL,'Legacy','m','[{"role":"user","content":"old"}]'),
  -- Defensive: messages is not an array.
  ('c4','u1','org:a','Broken','m','{}'::jsonb),
  ('c5','u1','org:a','Empty','m','[]');
`)

const sqlText = await readFile(MIGRATION, "utf8")
try { await db.exec(sqlText); console.log(`applied ${path.basename(MIGRATION)}\n`) }
catch (e) { console.error("MIGRATION FAILED:", e.message); process.exit(1) }

console.log("backfill")
check("every chat gets a chat.created at seq 0",
  Number((await one(`SELECT count(*) n FROM anker_chat_events WHERE kind='chat.created' AND seq=0`)).n), 5)
check("turns become message events in order",
  (await all(`SELECT kind, payload->>'content' AS c FROM anker_chat_events WHERE chat_id='c1' AND seq>0 ORDER BY seq`))
    .map(r => `${r.kind}:${r.c}`),
  ["message.user:who are my LPs", "message.assistant:Three."])
check("a non-array messages blob yields no turn events",
  Number((await one(`SELECT count(*) n FROM anker_chat_events WHERE chat_id='c4' AND seq>0`)).n), 0)
check("an empty conversation yields only chat.created",
  Number((await one(`SELECT count(*) n FROM anker_chat_events WHERE chat_id='c5'`)).n), 1)

console.log("\nscope")
check("an event inherits its chat's scope", (await one(`SELECT scope_key FROM anker_chat_events WHERE chat_id='c2' LIMIT 1`)).scope_key, "org:b")
check("a legacy NULL scope stays NULL, not invented",
  (await one(`SELECT scope_key FROM anker_chat_events WHERE chat_id='c3' LIMIT 1`)).scope_key, null)
check("an event claiming a foreign scope is rejected",
  await rejects(`INSERT INTO anker_chat_events(chat_id,scope_key,seq,kind) VALUES('c1','org:b',99,'message.user')`), "rejected")
check("an event for a chat that does not exist is rejected",
  await rejects(`INSERT INTO anker_chat_events(chat_id,seq,kind) VALUES('nope',1,'message.user')`), "rejected")
check("scope is inherited even when not supplied", await (async () => {
  await db.query(`INSERT INTO anker_chat_events(chat_id,seq,kind) VALUES('c1',50,'message.user')`)
  return (await one(`SELECT scope_key FROM anker_chat_events WHERE chat_id='c1' AND seq=50`)).scope_key
})(), "org:a")

console.log("\nappend-only")
check("UPDATE rejected", await rejects(`UPDATE anker_chat_events SET payload='{}'::jsonb WHERE chat_id='c1'`), "rejected")
check("DELETE rejected", await rejects(`DELETE FROM anker_chat_events WHERE chat_id='c1'`), "rejected")
check("a correction is a new event, and is allowed", await (async () => {
  await db.query(`INSERT INTO anker_chat_events(chat_id,seq,kind,payload) VALUES('c1',51,'message.assistant','{"content":"correction"}')`)
  return Number((await one(`SELECT count(*) n FROM anker_chat_events WHERE chat_id='c1' AND seq=51`)).n)
})(), 1)

console.log("\nintegrity")
check("a duplicate seq in one chat collides",
  await rejects(`INSERT INTO anker_chat_events(chat_id,seq,kind) VALUES('c1',50,'message.user')`), "rejected")
check("the same seq in a different chat is fine", await (async () => {
  await db.query(`INSERT INTO anker_chat_events(chat_id,seq,kind) VALUES('c2',50,'message.user')`)
  return "accepted"
})(), "accepted")
check("an unknown event kind is rejected",
  await rejects(`INSERT INTO anker_chat_events(chat_id,seq,kind) VALUES('c1',60,'message.telepathy')`), "rejected")
check("a parked intent is findable by the awaiting index", await (async () => {
  await db.query(`INSERT INTO anker_chat_events(chat_id,seq,kind,payload,awaiting)
                  VALUES('c1',61,'tool.requested','{"name":"crm_update_stage"}',true)`)
  return Number((await one(`SELECT count(*) n FROM anker_chat_events WHERE awaiting`)).n)
})(), 1)

console.log("\ndeleting a conversation vs editing its history")
check("a direct DELETE of events, chat still present, is refused",
  await rejects(`DELETE FROM anker_chat_events WHERE chat_id='c2'`), "rejected")
check("deleting the chat cascades its events away", await (async () => {
  await db.query(`DELETE FROM anker_chats WHERE id='c5'`)
  return Number((await one(`SELECT count(*) n FROM anker_chat_events WHERE chat_id='c5'`)).n)
})(), 0)
check("a chat with turns can also be deleted", await (async () => {
  await db.query(`DELETE FROM anker_chats WHERE id='c3'`)
  return Number((await one(`SELECT count(*) n FROM anker_chat_events WHERE chat_id='c3'`)).n)
})(), 0)

console.log("\nre-run")
const before = Number((await one(`SELECT count(*) n FROM anker_chat_events`)).n)
await db.exec(sqlText)
check("backfill adds nothing on a second run",
  Number((await one(`SELECT count(*) n FROM anker_chat_events`)).n), before)

console.log(failures ? `\n${failures} FAILURE(S)` : "\nall checks passed")
process.exit(failures ? 1 : 0)
