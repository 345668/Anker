#!/usr/bin/env node
/**
 * Reconfigure the pgvector embedding column dimension.
 *
 * Switching embedding providers usually changes the vector size (Gemini 768,
 * OpenAI/Qwen 768-via-param, Mistral 1024, Voyage 256/512/1024/2048). The
 * `embedding` columns are typed `vector(N)`, so N must match the model. This
 * resizes them in one command. It WIPES existing embeddings (they were produced
 * by the old model and are meaningless in the new space) — re-run the backfill
 * afterwards.
 *
 * Usage:
 *   node scripts/oneshot/set-embedding-dim.mjs --dim=1024                # firms+investors
 *   node scripts/oneshot/set-embedding-dim.mjs --dim=1024 firms investors crm
 *   EMBED_DIM=1024 node scripts/oneshot/set-embedding-dim.mjs            # dim from env
 *
 * Then:
 *   EMBED_PROVIDER=mistral MISTRAL_API_KEY=... node scripts/backfill-embeddings.mjs
 *   (and set EMBED_DIM=1024 in the app env so match-time embedding matches)
 *
 * Env: DATABASE_URL | NEON_DATABASE_URL
 */
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const { Client } = require("pg")

const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL
if (!url) { console.error("DATABASE_URL or NEON_DATABASE_URL required"); process.exit(1) }

const args = process.argv.slice(2)
const dimArg = args.find((a) => a.startsWith("--dim="))
const DIM = dimArg ? parseInt(dimArg.split("=")[1], 10) : Number(process.env.EMBED_DIM || 0)
if (!Number.isInteger(DIM) || DIM < 1 || DIM > 16000) {
  console.error("Provide a valid dimension: --dim=1024 (or EMBED_DIM=1024).")
  process.exit(1)
}

const TABLES = {
  firms: "investment_firms",
  investors: "investors",
  crm: "crm_entries",
}
const picked = args.filter((a) => !a.startsWith("--"))
const targets = (picked.length ? picked : ["firms", "investors"]).map((t) => TABLES[t] || t)

async function main() {
  const c = new Client({ connectionString: url })
  await c.connect()
  await c.query("CREATE EXTENSION IF NOT EXISTS vector")
  console.log(`[set-dim] target dimension: ${DIM} · tables: ${targets.join(", ")}`)
  console.log(`[set-dim] NOTE: this clears existing embeddings — run backfill afterwards.\n`)

  for (const table of targets) {
    const idx = `${table}_embedding_hnsw`
    try {
      // 1. Drop the HNSW index (it pins the old dimension + opclass).
      await c.query(`DROP INDEX IF EXISTS ${idx}`)
      // 2. Drop + re-add the column at the new dimension (also wipes stale
      //    vectors, which must be re-embedded with the new model anyway).
      await c.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS embedding`)
      await c.query(`ALTER TABLE ${table} ADD COLUMN embedding vector(${DIM})`)
      // 3. Make sure the provenance columns exist + reset them.
      await c.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS embedding_model TEXT`)
      await c.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS embedding_built_at TIMESTAMPTZ`)
      await c.query(`UPDATE ${table} SET embedding_model = NULL, embedding_built_at = NULL WHERE embedding_model IS NOT NULL`)
      // 4. Recreate the cosine HNSW index at the new dimension.
      await c.query(`CREATE INDEX ${idx} ON ${table} USING hnsw (embedding vector_cosine_ops)`)
      console.log(`  ✓ ${table}: embedding → vector(${DIM}), index rebuilt`)
    } catch (e) {
      console.error(`  ✗ ${table}: ${e.message}`)
      process.exitCode = 1
    }
  }

  console.log(`\n[set-dim] done. Next:`)
  console.log(`  1. Set EMBED_DIM=${DIM} in the app env (Vercel) so match-time embedding matches.`)
  console.log(`  2. Backfill:  node scripts/backfill-embeddings.mjs   (uses Settings provider or EMBED_PROVIDER)`)
  await c.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
