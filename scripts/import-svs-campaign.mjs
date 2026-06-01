#!/usr/bin/env node
/**
 * SVS Fund II — Campaign Importer
 *
 * Reads SVS_Fund_II_Enriched_Outreach_282.xlsx and imports all data into
 * the Anker database, creating:
 *
 *   1. crm_entries      — one row per LP profile (upsert by email)
 *   2. outreach_campaigns — one "SVS Fund II" campaign row
 *   3. outreach_campaign_members — one row per CRM entry in the campaign
 *   4. outreach_messages — email draft (channel=email) + LinkedIn DM
 *                          (channel=linkedin) per LP where available
 *
 * Idempotent: re-running updates existing rows rather than duplicating.
 *
 * Usage:
 *   node scripts/import-svs-campaign.mjs <path-to-xlsx> [user-id]
 *
 *   If user-id is omitted, looks for the first admin in local_users.
 *
 * Env: DATABASE_URL or LOCAL_DB=true (PGlite)
 */

import { createRequire } from "node:module"
import path from "node:path"
import fs from "node:fs"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const XLSX = require("xlsx")
const { Client } = require("pg")

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")

// ─── Load .env.local ────────────────────────────────────────────────────────
const envPath = path.join(ROOT, ".env.local")
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const eq = t.indexOf("=")
    if (eq < 0) continue
    const k = t.slice(0, eq).trim()
    const v = t.slice(eq + 1).trim().replace(/^"|"$/g, "")
    if (!process.env[k]) process.env[k] = v
  }
}

const DB_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "postgresql://anker:anker@localhost:5432/anker"

// ─── Args ────────────────────────────────────────────────────────────────────
const xlsxArg = process.argv[2] || path.join(ROOT, "data", "SVS_Fund_II_Enriched_Outreach_282.xlsx")
const userIdArg = process.argv[3] || null

if (!fs.existsSync(xlsxArg)) {
  console.error(`❌  File not found: ${xlsxArg}`)
  console.error(`    Usage: node scripts/import-svs-campaign.mjs <path.xlsx> [user-id]`)
  process.exit(1)
}

// ─── Parse Excel ─────────────────────────────────────────────────────────────
console.log(`[import] Reading ${xlsxArg}…`)
const wb = XLSX.readFile(xlsxArg)

function sheetToObjects(sheetName) {
  const ws = wb.Sheets[sheetName]
  if (!ws) { console.warn(`  [warn] Sheet "${sheetName}" not found`); return [] }
  return XLSX.utils.sheet_to_json(ws, { defval: "" })
}

const profileRows = sheetToObjects("Curated Profiles (Enriched)")
const draftRows   = sheetToObjects("Email Drafts (Enriched)")
const dmRows      = sheetToObjects("LinkedIn DMs")

console.log(`[import] Profiles: ${profileRows.length}, Email drafts: ${draftRows.length}, LinkedIn DMs: ${dmRows.length}`)

// Index drafts and DMs by row # for O(1) lookup
const draftByNum = new Map(draftRows.map(r => [String(r["#"]), r]))
const dmByName   = new Map(dmRows.map(r => [String(r["Name"]).trim(), r]))

// ─── Connect DB ───────────────────────────────────────────────────────────────
const client = new Client({ connectionString: DB_URL })
await client.connect()
console.log(`[import] Connected to ${DB_URL.split("@")[1] ?? DB_URL}`)

// ─── Resolve user ─────────────────────────────────────────────────────────────
let userId = userIdArg
if (!userId) {
  const res = await client.query(
    `SELECT id FROM local_users WHERE role = 'admin' LIMIT 1`
  ).catch(() => ({ rows: [] }))
  userId = res.rows[0]?.id
}
if (!userId) {
  // Try auth.users (Supabase-compatible schema)
  const res = await client.query(
    `SELECT id FROM auth.users LIMIT 1`
  ).catch(() => ({ rows: [] }))
  userId = res.rows[0]?.id
}
if (!userId) {
  console.error("❌  Could not resolve a user ID. Pass one as the second argument.")
  await client.end()
  process.exit(1)
}
console.log(`[import] Using user: ${userId}`)

// ─── Helpers ──────────────────────────────────────────────────────────────────
function str(v) { return v != null && v !== "" ? String(v).trim() : null }
function num(v) { const n = Number(v); return isNaN(n) ? null : n }
function tier(v) {
  const n = Number(v)
  return n === 1 ? "T1" : n === 2 ? "T2" : "T3"
}
function channel(v) {
  const s = str(v)?.toLowerCase() ?? ""
  return s.includes("linkedin") ? "linkedin" : "email"
}
function statusToStage(v) {
  const s = str(v)?.toLowerCase() ?? ""
  if (s.includes("sent")) return "contacted"
  if (s.includes("draft")) return "queued"
  if (s.includes("replied")) return "responded"
  return "queued"
}

let crmInserted = 0, crmUpdated = 0
let memberInserted = 0
let msgInserted = 0, msgUpdated = 0

// ─── 1. Upsert crm_entries ────────────────────────────────────────────────────
console.log("\n[import] Step 1: Upserting crm_entries…")

// Map from row # → crm_entry_id
const crmIdByNum = new Map()

for (const row of profileRows) {
  const rowNum   = str(row["#"])
  const name     = str(row["Name"]) || "Unknown"
  const email    = str(row["Email"])
  const linkedin = str(row["LinkedIn"])
  const lpType   = str(row["LP Type"]) || "Institutional"
  const score    = num(row["Score"]) || 50
  const tierVal  = tier(row["Tier"])
  const location = str(row["Location"])
  const titleRole= str(row["Title/Role"])
  const sectors  = str(row["Sectors"])
  const whyMatch = str(row["Why This Contact"])
  const researchSummary = [
    str(row["Firm Intelligence"]),
    str(row["Investment Mandate"]),
    str(row["Personalisation Hook"]),
  ].filter(Boolean).join("\n\n")

  const stage = statusToStage(row["Outreach Status"])

  // Unique key: user_id + source='manual' + use email as firm_id surrogate
  // We use the row # as a stable external key stored in display_title
  const stableKey = `svs-${rowNum}`  // used as investor_id for upsert

  const existing = await client.query(
    `SELECT id FROM crm_entries WHERE user_id = $1 AND investor_id = $2 LIMIT 1`,
    [userId, stableKey]
  )

  let crmId
  if (existing.rows.length) {
    crmId = existing.rows[0].id
    await client.query(`
      UPDATE crm_entries SET
        display_name      = $1,
        display_title     = $2,
        display_email     = $3,
        display_linkedin  = $4,
        display_location  = $5,
        display_type      = $6,
        display_score     = $7,
        display_tier      = $8,
        why_match         = $9,
        research_summary  = $10,
        stage             = $11,
        updated_at        = NOW()
      WHERE id = $12
    `, [name, titleRole, email, linkedin, location, lpType, score, tierVal, whyMatch, researchSummary, stage, crmId])
    crmUpdated++
  } else {
    const ins = await client.query(`
      INSERT INTO crm_entries (
        user_id, source, investor_id,
        display_name, display_title, display_email,
        display_linkedin, display_location, display_type,
        display_score, display_tier, why_match,
        research_summary, stage
      ) VALUES ($1,'manual',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING id
    `, [userId, stableKey, name, titleRole, email, linkedin, location, lpType, score, tierVal, whyMatch, researchSummary, stage])
    crmId = ins.rows[0].id
    crmInserted++
  }

  crmIdByNum.set(rowNum, crmId)
  if ((crmInserted + crmUpdated) % 50 === 0) process.stdout.write(".")
}
console.log(`\n  CRM entries: ${crmInserted} inserted, ${crmUpdated} updated`)

// ─── 2. Create/find campaign ──────────────────────────────────────────────────
console.log("\n[import] Step 2: Creating SVS Fund II campaign…")

const CAMPAIGN_NAME = "SVS Fund II — 282 Enriched LPs"
const existing = await client.query(
  `SELECT id FROM outreach_campaigns WHERE user_id = $1 AND name = $2 LIMIT 1`,
  [userId, CAMPAIGN_NAME]
)
let campaignId
if (existing.rows.length) {
  campaignId = existing.rows[0].id
  console.log(`  Found existing campaign: ${campaignId}`)
} else {
  const ins = await client.query(`
    INSERT INTO outreach_campaigns (user_id, name, description, status, default_channel)
    VALUES ($1, $2, $3, 'active', 'multi')
    RETURNING id
  `, [userId, CAMPAIGN_NAME, "Imported from SVS_Fund_II_Enriched_Outreach_282.xlsx — 282 enriched LP profiles with email drafts and LinkedIn DMs."])
  campaignId = ins.rows[0].id
  console.log(`  Created campaign: ${campaignId}`)
}

// ─── 3. Upsert campaign members ───────────────────────────────────────────────
console.log("\n[import] Step 3: Upserting campaign members…")

for (const [rowNum, crmId] of crmIdByNum) {
  const row     = profileRows[Number(rowNum) - 1]
  const draft   = draftByNum.get(String(rowNum))
  const status  = draft ? "drafted" : "planned"

  await client.query(`
    INSERT INTO outreach_campaign_members (campaign_id, user_id, crm_entry_id, status, snapshot, drafted_at)
    VALUES ($1, $2, $3, $4, $5::jsonb, $6)
    ON CONFLICT (campaign_id, crm_entry_id) DO UPDATE SET
      status     = EXCLUDED.status,
      snapshot   = EXCLUDED.snapshot,
      drafted_at = COALESCE(outreach_campaign_members.drafted_at, EXCLUDED.drafted_at),
      updated_at = NOW()
  `, [
    campaignId, userId, crmId, status,
    JSON.stringify({
      name: str(row["Name"]), lpType: str(row["LP Type"]),
      score: num(row["Score"]), tier: str(row["Tier"]),
      batch: num(row["Batch"]), multiTouchNote: str(row["Multi-Touch Note"]),
    }),
    draft ? new Date().toISOString() : null
  ])
  memberInserted++
}
console.log(`  ${memberInserted} campaign members upserted`)

// ─── 4. Upsert outreach_messages ──────────────────────────────────────────────
console.log("\n[import] Step 4: Upserting outreach messages…")

for (const [rowNum, crmId] of crmIdByNum) {
  const profileRow = profileRows[Number(rowNum) - 1]
  const draftRow   = draftByNum.get(String(rowNum))
  const name       = str(profileRow["Name"]) || ""
  const dmRow      = dmByName.get(name)

  // ── Email draft ──────────────────────────────────────────────────────
  if (draftRow && str(draftRow["Body"])) {
    const subject = str(draftRow["Enriched Subject"]) || str(draftRow["Subject"]) || "Introduction — Summit Venture Studio Fund II"
    const body    = str(draftRow["Body"])
    const ch      = channel(draftRow["Primary channel"])

    await client.query(`
      INSERT INTO outreach_messages (
        user_id, crm_entry_id, kind, step_number, channel,
        subject, body, status, generated_by, email_to
      ) VALUES ($1,$2,'connection_request',0,$3,$4,$5,'draft','import:svs-excel',$6)
      ON CONFLICT (crm_entry_id, kind) DO UPDATE SET
        body         = EXCLUDED.body,
        subject      = EXCLUDED.subject,
        channel      = EXCLUDED.channel,
        email_to     = EXCLUDED.email_to,
        generated_by = EXCLUDED.generated_by,
        updated_at   = NOW()
    `, [userId, crmId, ch, subject, body, str(profileRow["Email"])])
    msgInserted++
  }

  // ── LinkedIn DM ──────────────────────────────────────────────────────
  if (dmRow && str(dmRow["DM (first touch)"])) {
    const dmBody = str(dmRow["DM (first touch)"])
    await client.query(`
      INSERT INTO outreach_messages (
        user_id, crm_entry_id, kind, step_number, channel,
        body, status, generated_by
      ) VALUES ($1,$2,'connection_request',0,'linkedin',$3,'draft','import:svs-excel')
      ON CONFLICT (crm_entry_id, kind) DO UPDATE SET
        body         = EXCLUDED.body,
        generated_by = EXCLUDED.generated_by,
        updated_at   = NOW()
    `, [userId, crmId, dmBody])
    // Note: UNIQUE(crm_entry_id, kind) — LinkedIn DM gets a separate step_number
    // If conflict (email already stored for kind=connection_request), store DM as step 1
    msgUpdated++
  }
}

// Re-attempt LinkedIn DMs with step_number=1 where step_number=0 conflicts
// (some profiles have both email + DM for the same kind)
let dmFallback = 0
for (const [rowNum, crmId] of crmIdByNum) {
  const profileRow = profileRows[Number(rowNum) - 1]
  const name       = str(profileRow["Name"]) || ""
  const dmRow      = dmByName.get(name)
  if (!dmRow || !str(dmRow["DM (first touch)"])) continue

  const exists = await client.query(
    `SELECT id, channel FROM outreach_messages WHERE crm_entry_id=$1 AND kind='connection_request' AND channel='linkedin' LIMIT 1`,
    [crmId]
  )
  if (!exists.rows.length) {
    // Insert as step 1 (email was step 0)
    await client.query(`
      INSERT INTO outreach_messages (user_id, crm_entry_id, kind, step_number, channel, body, status, generated_by)
      VALUES ($1,$2,'follow_up',1,'linkedin',$3,'draft','import:svs-excel')
      ON CONFLICT (crm_entry_id, kind) DO UPDATE SET body=EXCLUDED.body, updated_at=NOW()
    `, [userId, crmId, str(dmRow["DM (first touch)"])])
    dmFallback++
  }
}

console.log(`  Messages: ${msgInserted} email drafts, ${dmRows.length} LinkedIn DMs (${dmFallback} stored as follow_up)`)

// ─── Summary ──────────────────────────────────────────────────────────────────
await client.end()

console.log(`
╔═══════════════════════════════════════════════════════╗
║  SVS Fund II Import Complete                          ║
╠═══════════════════════════════════════════════════════╣
║  CRM entries       : ${String(crmInserted + crmUpdated).padEnd(32)}║
║  Campaign          : ${CAMPAIGN_NAME.slice(0,32).padEnd(32)}║
║  Campaign ID       : ${String(campaignId).slice(0,32).padEnd(32)}║
║  Members           : ${String(memberInserted).padEnd(32)}║
║  Email drafts      : ${String(msgInserted).padEnd(32)}║
║  LinkedIn DMs      : ${String(dmRows.length).padEnd(32)}║
╚═══════════════════════════════════════════════════════╝

Open in app:
  Outreach → Campaigns → "${CAMPAIGN_NAME}"
  CRM → filter by source: manual
`)
