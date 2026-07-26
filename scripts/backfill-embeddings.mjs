#!/usr/bin/env node
/**
 * Backfill `embedding` columns on investment_firms / investors / crm_entries.
 *
 * Multi-provider — MUST use the same provider+model as match-time embedding
 * (lib/ai/embeddings.ts), which this file mirrors exactly. Different models
 * produce incompatible vector spaces.
 *
 * Usage:
 *   EMBED_PROVIDER=gemini GEMINI_API_KEY=... node scripts/backfill-embeddings.mjs
 *   EMBED_PROVIDER=openai OPENAI_API_KEY=... node scripts/backfill-embeddings.mjs investors
 *   EMBED_PROVIDER=qwen   DASHSCOPE_API_KEY=... node scripts/backfill-embeddings.mjs firms --batch=100
 *   EMBED_PROVIDER=voyage VOYAGE_API_KEY=... node scripts/backfill-embeddings.mjs   # "claude" stack
 *   EMBED_PROVIDER=ollama node scripts/backfill-embeddings.mjs                       # local
 *   ... --limit=300        # only embed the first N (test batch)
 *   ... --concurrency=6    # parallel requests
 *   ... --force            # re-embed everything (default: only NULLs)
 *
 * Env (same names as lib/ai/embeddings.ts):
 *   DATABASE_URL | NEON_DATABASE_URL          required
 *   EMBED_PROVIDER   gemini|openai|qwen|voyage|claude|ollama|auto   (default auto)
 *   EMBED_DIM        default 768 (MUST match the pgvector column + model output)
 *   GEMINI_API_KEY | GOOGLE_API_KEY ; GEMINI_EMBED_MODEL   (default text-embedding-004)
 *   OPENAI_API_KEY ; OPENAI_EMBED_MODEL                     (default text-embedding-3-small)
 *   DASHSCOPE_API_KEY | QWEN_API_KEY ; QWEN_EMBED_MODEL     (default text-embedding-v3)
 *     DASHSCOPE_BASE_URL   (default https://dashscope-intl.aliyuncs.com/compatible-mode/v1)
 *   VOYAGE_API_KEY ; VOYAGE_EMBED_MODEL                     (default voyage-3-large)
 *   OLLAMA_URL ; OLLAMA_EMBED_MODEL                         (default nomic-embed-text)
 */
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const { Client } = require("pg")

const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL
if (!url) { console.error("DATABASE_URL or NEON_DATABASE_URL required"); process.exit(1) }

const EMBED_DIM = Number(process.env.EMBED_DIM ?? 768)
const OLLAMA_URL = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "")
const OLLAMA_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text"
const GEMINI_MODEL = process.env.GEMINI_EMBED_MODEL || "text-embedding-004"
const OPENAI_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small"
const QWEN_MODEL = process.env.QWEN_EMBED_MODEL || "text-embedding-v3"
const QWEN_BASE = (process.env.DASHSCOPE_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1").replace(/\/+$/, "")
const VOYAGE_MODEL = process.env.VOYAGE_EMBED_MODEL || "voyage-3-large"

const KEYS = {
  gemini: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null,
  openai: process.env.OPENAI_API_KEY || null,
  qwen: process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || null,
  voyage: process.env.VOYAGE_API_KEY || null,
  localOn: process.env.LOCAL_AI_ENABLED === "true" || process.env.AI_PROVIDER === "ollama" || (process.env.EMBED_PROVIDER || "").toLowerCase() === "ollama",
}

function selectProvider() {
  const raw = (process.env.EMBED_PROVIDER || "auto").toLowerCase()
  const norm = raw === "claude" || raw === "anthropic" ? "voyage" : raw
  if (norm !== "auto") return ["gemini", "openai", "qwen", "voyage", "ollama"].includes(norm) ? norm : null
  if (KEYS.gemini) return "gemini"
  if (KEYS.openai) return "openai"
  if (KEYS.qwen) return "qwen"
  if (KEYS.voyage) return "voyage"
  if (KEYS.localOn) return "ollama"
  return null
}

const args = process.argv.slice(2)
const targets = ["firms", "investors", "crm"].filter((t) => args.length === 0 || args.includes(t))
const numArg = (name, def) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? parseInt(a.split("=")[1], 10) : def }
const BATCH = numArg("batch", 50)
const CONCURRENCY = Math.max(1, Math.min(16, numArg("concurrency", 4)))
const LIMIT = numArg("limit", 0) // 0 = all
const FORCE = args.includes("--force")

const PROVIDER = selectProvider()
if (!PROVIDER) { console.error("No embedding provider configured. Set EMBED_PROVIDER + the matching *_API_KEY."); process.exit(1) }
const MODEL_TAG = `${PROVIDER}:${{ gemini: GEMINI_MODEL, openai: OPENAI_MODEL, qwen: QWEN_MODEL, voyage: VOYAGE_MODEL, ollama: OLLAMA_MODEL }[PROVIDER]}`

// ─── Provider embed fns (mirror lib/ai/embeddings.ts) ────────────────────────
async function withTimeout(ms, fn) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms)
  try { return await fn(ctrl.signal) } catch { return null } finally { clearTimeout(t) }
}
const clip = (t) => String(t || "").slice(0, 8000)

async function embedGemini(text) {
  return withTimeout(20000, async (signal) => {
    const body = { model: `models/${GEMINI_MODEL}`, content: { parts: [{ text: clip(text) }] } }
    if (GEMINI_MODEL.includes("gemini-embedding")) body.outputDimensionality = EMBED_DIM
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:embedContent?key=${encodeURIComponent(KEYS.gemini)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal })
    if (!res.ok) return null
    const j = await res.json(); return j?.embedding?.values ?? null
  })
}
async function embedOpenAICompatible(base, model, key, text) {
  return withTimeout(20000, async (signal) => {
    const res = await fetch(`${base}/embeddings`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, input: clip(text), dimensions: EMBED_DIM }), signal })
    if (!res.ok) return null
    const j = await res.json(); return j?.data?.[0]?.embedding ?? null
  })
}
async function embedVoyage(text) {
  return withTimeout(20000, async (signal) => {
    const body = { model: VOYAGE_MODEL, input: [clip(text)] }
    if ([256, 512, 1024, 2048].includes(EMBED_DIM)) body.output_dimension = EMBED_DIM
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEYS.voyage}` },
      body: JSON.stringify(body), signal })
    if (!res.ok) return null
    const j = await res.json(); return j?.data?.[0]?.embedding ?? null
  })
}
async function embedOllama(text) {
  return withTimeout(20000, async (signal) => {
    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: OLLAMA_MODEL, input: clip(text) }), signal })
    if (res.ok) { const j = await res.json(); if (Array.isArray(j?.embeddings?.[0])) return j.embeddings[0] }
    const r2 = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt: clip(text) }), signal })
    if (!r2.ok) return null
    const j = await r2.json(); return j?.embedding ?? null
  })
}
async function embed(text) {
  let v = null
  switch (PROVIDER) {
    case "gemini": v = await embedGemini(text); break
    case "openai": v = await embedOpenAICompatible("https://api.openai.com/v1", OPENAI_MODEL, KEYS.openai, text); break
    case "qwen":   v = await embedOpenAICompatible(QWEN_BASE, QWEN_MODEL, KEYS.qwen, text); break
    case "voyage": v = await embedVoyage(text); break
    case "ollama": v = await embedOllama(text); break
  }
  if (!Array.isArray(v)) return null
  if (v.length !== EMBED_DIM) {
    console.warn(`  [dim] got ${v.length}, need ${EMBED_DIM} — skipping. Adjust EMBED_DIM + the vector column, or pick a ${EMBED_DIM}-d model.`)
    return null
  }
  return v
}

// ─── Row → text ──────────────────────────────────────────────────────────────
function firmText(r) {
  return [r.name, r.type ?? r.firm_type, r.hq_location ?? r.location, r.description,
    Array.isArray(r.sectors) ? r.sectors.join(", ") : r.sectors,
    Array.isArray(r.stages) ? r.stages.join(", ") : r.stages,
    Array.isArray(r.geographic_focus) ? r.geographic_focus.join(", ") : r.geographic_focus,
    r.thesis_description, r.value_proposition].filter(Boolean).join(" · ").slice(0, 6000)
}
function investorText(r) {
  return [[r.first_name, r.last_name].filter(Boolean).join(" "), r.title, r.investor_type, r.location, r.bio,
    Array.isArray(r.sectors) ? r.sectors.join(", ") : r.sectors,
    Array.isArray(r.stages) ? r.stages.join(", ") : r.stages].filter(Boolean).join(" · ").slice(0, 6000)
}
function crmText(r) {
  return [r.display_name, r.display_title, r.display_type, r.display_location, r.why_match, r.notes].filter(Boolean).join(" · ").slice(0, 6000)
}
const TABLES = {
  firms: { table: "investment_firms", textBuilder: firmText },
  investors: { table: "investors", textBuilder: investorText },
  crm: { table: "crm_entries", textBuilder: crmText },
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const c = new Client({ connectionString: url })
  await c.connect()
  console.log(`[embed] provider=${MODEL_TAG} dim=${EMBED_DIM} concurrency=${CONCURRENCY} targets=${targets.join(", ")}${LIMIT ? ` limit=${LIMIT}` : ""}`)

  for (const t of targets) {
    const { table, textBuilder } = TABLES[t]
    const where = FORCE ? "" : "WHERE embedding IS NULL"
    const cap = LIMIT || Number((await c.query(`SELECT COUNT(*) FROM ${table} ${where}`)).rows[0].count)
    console.log(`[embed] ${table}: up to ${cap} rows`)
    let ok = 0, skipped = 0, seen = 0

    while (seen < cap) {
      const rows = (await c.query(`SELECT * FROM ${table} ${where} ORDER BY id LIMIT ${Math.min(BATCH, cap - seen)}`)).rows
      if (rows.length === 0) break
      // Embed the batch with bounded concurrency.
      let idx = 0
      async function worker() {
        while (idx < rows.length) {
          const row = rows[idx++]
          const txt = textBuilder(row)
          if (!txt) { skipped++; continue }
          const v = await embed(txt)
          if (!v) { skipped++; continue }
          await c.query(
            `UPDATE ${table} SET embedding = $1::vector, embedding_model = $2, embedding_built_at = NOW() WHERE id = $3`,
            ["[" + v.join(",") + "]", MODEL_TAG, row.id])
          ok++
          if (ok % 50 === 0) console.log(`  [${table}] embedded ${ok}`)
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker))
      seen += rows.length
      if (FORCE && !LIMIT) { /* FORCE re-scans; stop after one full pass */ if (rows.length < BATCH) break }
    }
    console.log(`[embed] ${table} DONE: ${ok} embedded, ${skipped} skipped`)
  }
  await c.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
