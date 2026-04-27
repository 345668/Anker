/**
 * End-to-end test for the settings persistence + encryption round-trip.
 *
 * Inserts an API key (with the same encryption pipeline the app uses),
 * reads it back, decrypts it, and prints the result.
 */

import { PGlite } from "@electric-sql/pglite"
import crypto from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, "..", ".local-db")

// Replicate lib/db/secrets.ts behavior
const SECRET = process.env.SECRET_KEY ||
  "anker-local-dev-secret-key-change-me-in-production-please-1234567890"
const KEY = crypto.scryptSync(SECRET, "anker-settings-salt-v1", 32)
const PREFIX = "enc:v1:"

function encrypt(plaintext) {
  if (!plaintext) return null
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv("aes-256-gcm", KEY, iv)
  const ct = Buffer.concat([c.update(plaintext, "utf8"), c.final()])
  const tag = c.getAuthTag()
  return PREFIX + iv.toString("hex") + ":" + tag.toString("hex") + ":" + ct.toString("hex")
}
function decrypt(stored) {
  if (!stored?.startsWith(PREFIX)) return stored
  const parts = stored.split(":")
  if (parts.length < 5) return null
  const [, , ivHex, tagHex, dataHex] = parts
  const d = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivHex, "hex"))
  d.setAuthTag(Buffer.from(tagHex, "hex"))
  return Buffer.concat([d.update(Buffer.from(dataHex, "hex")), d.final()]).toString("utf8")
}

const db = new PGlite(DATA_DIR)
await db.waitReady

const userId = "local-user-00000000-0000-0000-0000-000000000001"
const fakeKey = "sk-ant-api03-FAKE-KEY-FOR-TESTING-1234567890abcdef"

console.log(`=== Test: settings round-trip for user ${userId} ===\n`)

// 1) Insert / upsert
const enc = encrypt(fakeKey)
console.log(`1. Plaintext key  : ${fakeKey}`)
console.log(`   Encrypted form : ${enc.slice(0, 80)}…`)

await db.query(
  `INSERT INTO user_settings (user_id, anthropic_api_key)
   VALUES ($1, $2)
   ON CONFLICT (user_id) DO UPDATE SET anthropic_api_key = EXCLUDED.anthropic_api_key, updated_at = NOW()`,
  [userId, enc],
)
console.log("\n2. Inserted into user_settings.")

// 2) Verify ciphertext is at rest
const raw = await db.query("SELECT anthropic_api_key FROM user_settings WHERE user_id = $1", [userId])
const stored = raw.rows[0].anthropic_api_key
console.log(`\n3. At-rest value  : ${stored.slice(0, 80)}…`)
console.log(`   Starts w/ enc: : ${stored.startsWith(PREFIX) ? "YES (encrypted ✓)" : "NO (plaintext ✗)"}`)

// 3) Decrypt and verify equality
const back = decrypt(stored)
console.log(`\n4. Decrypted back : ${back}`)
console.log(`   Matches original: ${back === fakeKey ? "YES ✓" : "NO ✗"}`)

// 4) Update and verify previous value is overwritten
const newKey = "sk-ant-api03-ROTATED-KEY-9876543210fedcba"
await db.query(
  `UPDATE user_settings SET anthropic_api_key = $1 WHERE user_id = $2`,
  [encrypt(newKey), userId],
)
const r2 = await db.query("SELECT anthropic_api_key FROM user_settings WHERE user_id = $1", [userId])
console.log(`\n5. After rotation : ${decrypt(r2.rows[0].anthropic_api_key)}`)

// 5) Show all stored fields for this user (sanitized)
const all = await db.query("SELECT * FROM user_settings WHERE user_id = $1", [userId])
const row = all.rows[0]
console.log("\n6. Full row (sanitized):")
for (const [k, v] of Object.entries(row)) {
  if (typeof v === "string" && v.startsWith(PREFIX)) {
    console.log(`   ${k.padEnd(30)} : <encrypted, ${v.length} chars>`)
  } else {
    console.log(`   ${k.padEnd(30)} : ${v}`)
  }
}

await db.close()
console.log("\nDONE")
