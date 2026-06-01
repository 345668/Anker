#!/usr/bin/env node
/**
 * Backfill `embedding` columns on investment_firms / investors / crm_entries.
 *
 * Usage:
 *   node scripts/backfill-embeddings.mjs                      # all 3 tables
 *   node scripts/backfill-embeddings.mjs firms                # one table
 *   node scripts/backfill-embeddings.mjs investors --batch 100
 *
 * Env:
 *   DATABASE_URL              required
 *   OLLAMA_URL                default http://127.0.0.1:11434
 *   OLLAMA_EMBED_MODEL        default nomic-embed-text
 *
 * Idempotent — only fills NULL embeddings, unless --force is set.
 */
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const { Client } = require("pg")

const url = process.env.DATABASE_URL || "postgresql://anker:anker@localhost:5432/anker"
const OLLAMA_URL = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "")
const MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text"

const args = process.argv.slice(2)
const targets = ["firms", "investors", "crm"].filter((t) => args.length === 0 || args.includes(t))
const batchArg = args.find((a) => a.startsWith("--batch="))
const BATCH = batchArg ? parseInt(batchArg.split("=")[1], 10) : 50
const FORCE = args.includes("--force")

const TABLES = {
  firms:     { table: "investment_firms", textBuilder: firmText },
  investors: { table: "investors",        textBuilder: investorText },
  crm:       { table: "crm_entries",      textBuilder: crmText },
}

async function embed(text) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 20_000)
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, input: String(text || "").slice(0, 8000) }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      // legacy
      const r2 = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, prompt: String(text || "").slice(0, 8000) }),
        signal: ctrl.signal,
      })
      if (!r2.ok) return null
      const j = await r2.json()
      return Array.isArray(j?.embedding) ? j.embedding : null
    }
    const json = await res.json()
    return Array.isArray(json?.embeddings?.[0]) ? json.embeddings[0] : null
  } catch { return null }
  finally { clearTimeout(t) }
}

function firmText(r) {
  return [
    r.name, r.type ?? r.firm_type, r.hq_location ?? r.location, r.description,
    Array.isArray(r.sectors) ? r.sectors.join(", ") : r.sectors,
    Array.isArray(r.stages) ? r.stages.join(", ") : r.stages,
    Array.isArray(r.geographic_focus) ? r.geographic_focus.join(", ") : r.geographic_focus,
    r.thesis_description, r.value_proposition,
  ].filter(Boolean).join(" · ").slice(0, 6000)
}
function investorText(r) {
  return [
    [r.first_name, r.last_name].filter(Boolean).join(" "),
    r.title, r.investor_type, r.location, r.bio,
    Array.isArray(r.sectors) ? r.sectors.join(", ") : r.sectors,
    Array.isArray(r.stages) ? r.stages.join(", ") : r.stages,
  ].filter(Boolean).join(" · ").slice(0, 6000)
}
function crmText(r) {
  return [
    r.display_name, r.display_title, r.display_type,
    r.display_location, r.why_match, r.notes,
  ].filter(Boolean).join(" · ").slice(0, 6000)
}

async function main() {
  const c = new Client({ connectionString: url })
  await c.connect()
  console.log(`[embed] connected; model=${MODEL} targets=${targets.join(", ")}`)
  for (const t of targets) {
    const { table, textBuilder } = TABLES[t]
    const where = FORCE ? "" : "WHERE embedding IS NULL"
    const total = (await c.query(`SELECT COUNT(*) FROM ${table} ${where}`)).rows[0].count
    console.log(`[embed] ${table}: ${total} rows to embed`)
    let processed = 0, ok = 0, skipped = 0
    while (processed < total) {
      const r = await c.query(`SELECT * FROM ${table} ${where} ORDER BY id LIMIT ${BATCH}`)
      if (r.rows.length === 0) break
      for (const row of r.rows) {
        const txt = textBuilder(row)
        if (!txt) { skipped++; processed++; continue }
        const v = await embed(txt)
        if (!v || v.length === 0) { skipped++; processed++; continue }
        const lit = "[" + v.join(",") + "]"
        await c.query(
          `UPDATE ${table} SET embedding = $1::vector,
              embedding_model = $2, embedding_built_at = NOW() WHERE id = $3`,
          [lit, MODEL, row.id],
        )
        ok++
        processed++
        if (ok % 25 === 0) console.log(`  [${table}] ${ok}/${processed}`)
      }
      // Avoid an infinite loop if the WHERE clause keeps matching
      if (FORCE) break
    }
    console.log(`[embed] ${table} DONE: ${ok} embedded, ${skipped} skipped`)
  }
  await c.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
