/**
 * Idempotent admin upsert.
 *
 * Usage:
 *   node scripts/upsert-admin.mjs <email> <password>
 *
 * If the user exists: resets password (bcrypt) + promotes role to 'admin'.
 * If the user doesn't exist: creates them as admin.
 */
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const { Client } = require("pg")
const bcrypt = require("bcryptjs")

const [, , email, password] = process.argv
if (!email || !password) {
  console.error("Usage: node scripts/upsert-admin.mjs <email> <password>")
  process.exit(1)
}

const url = process.env.DATABASE_URL || "postgresql://anker:anker@localhost:5432/anker"
const client = new Client({ connectionString: url })
await client.connect()

const hash = await bcrypt.hash(password, 10)
const e = email.trim().toLowerCase()

const existing = await client.query(
  "SELECT id, email, role FROM local_users WHERE email = $1 LIMIT 1",
  [e],
)

if (existing.rows.length) {
  await client.query(
    `UPDATE local_users
     SET password_hash = $1, role = 'admin', updated_at = NOW()
     WHERE email = $2`,
    [hash, e],
  )
  console.log(`✓ Updated existing user: ${e}`)
  console.log(`  → role: admin, password reset`)
  console.log(`  → id: ${existing.rows[0].id}`)
} else {
  const id = `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  await client.query(
    `INSERT INTO local_users (id, email, password_hash, name, role)
     VALUES ($1, $2, $3, $4, 'admin')`,
    [id, e, hash, e.split("@")[0]],
  )
  await client.query(
    `INSERT INTO profiles (id, email, full_name) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [id, e, e.split("@")[0]],
  )
  console.log(`✓ Created admin user: ${e}`)
  console.log(`  → id: ${id}`)
}

const verify = await client.query(
  "SELECT id, email, role, last_login_at, created_at FROM local_users WHERE email = $1",
  [e],
)
console.log("\nFinal record:")
console.log(verify.rows[0])

await client.end()
