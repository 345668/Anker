/**
 * Patch — extension_tokens table.
 *
 * Bearer-token store for the Anker LinkedIn Chrome extension. A token is
 * minted via POST /api/extension/tokens, the plaintext returned once so
 * the user can paste it into the extension, and only the SHA-256 hash
 * is persisted here. Every extension API call looks up its bearer's hash
 * to resolve the owning user and update last_used_at.
 *
 * Idempotent. Runs from the user's Mac:
 *   NEON_DATABASE_URL='…' node scripts/oneshot/run-extension-tokens-table.mjs
 */
const { neon } = await import("@neondatabase/serverless")
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

async function ddl(stmt) {
  if (typeof sql.query === "function") return sql.query(stmt)
  return sql([stmt])
}

console.log("[1/3] Ensuring extension_tokens table exists…")
try {
  await sql`
    CREATE TABLE IF NOT EXISTS extension_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid()
    )`
  console.log("       OK  table exists (or created)")
} catch (e) {
  console.error(`       ERR ${e.message}`)
  process.exit(1)
}

console.log("[2/3] Ensuring every column exists…")
const columns = [
  ["user_id",      "UUID"],
  ["token_hash",   "TEXT"],
  ["token_prefix", "TEXT"],
  ["label",        "TEXT"],
  ["created_at",   "TIMESTAMPTZ NOT NULL DEFAULT NOW()"],
  ["last_used_at", "TIMESTAMPTZ"],
  ["revoked_at",   "TIMESTAMPTZ"],
]
for (const [name, decl] of columns) {
  try {
    await ddl(`ALTER TABLE extension_tokens ADD COLUMN IF NOT EXISTS ${name} ${decl}`)
    console.log(`       OK  ${name.padEnd(13)} ${decl}`)
  } catch (e) {
    console.error(`       ERR ${name}: ${e.message}`)
    process.exit(1)
  }
}

console.log("[3/3] Ensuring indexes…")
try {
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS extension_tokens_hash_uk ON extension_tokens(token_hash) WHERE token_hash IS NOT NULL`
  console.log("       OK  UNIQUE(token_hash)")
  await sql`CREATE INDEX IF NOT EXISTS extension_tokens_user_idx ON extension_tokens(user_id) WHERE revoked_at IS NULL`
  console.log("       OK  INDEX extension_tokens(user_id) WHERE active")
} catch (e) {
  console.error(`       ERR ${e.message}`)
  process.exit(1)
}

const cnt = await sql`SELECT COUNT(*) AS n FROM extension_tokens`
console.log(`\nextension_tokens: ${cnt[0].n} row(s).`)
console.log("Done. Extension bearer-token auth is now live.")
