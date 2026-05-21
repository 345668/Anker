#!/usr/bin/env node
/**
 * Seed the Anker `investors` table from data/investors_import.csv.
 *
 * Source data: the consolidated Decile / 8fundraising prospect datasets
 * (98 + 150 family offices, 1,000 VC firms, 100 funds-of-funds, 2,189
 * accelerators) normalized to the public.investors schema — 3,431 rows.
 *
 * Idempotent: existing rows (matched on lower(name)+website) are skipped,
 * so this is safe to re-run.
 *
 * Usage:
 *   DATABASE_URL=postgres://anker:anker@localhost:5432/anker node scripts/seed-investors.mjs
 *   # or it reads DATABASE_URL / POSTGRES_URL from .env.local automatically
 *   pnpm seed:investors
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── load DATABASE_URL from env or .env.local ──────────────────────────────
function loadEnvLocal() {
  const f = path.join(ROOT, ".env.local");
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  }
}
loadEnvLocal();
const DB = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
if (!DB) {
  console.error("No DATABASE_URL / POSTGRES_URL set (checked env + .env.local).");
  process.exit(1);
}

// ── minimal RFC-4180 CSV parser (handles quotes, commas, newlines) ─────────
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\r") { /* skip */ }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const ALLOWED_TYPES = new Set(["angel", "vc", "family-office", "corporate", "accelerator", "crowdfunding"]);

function jsonOrEmpty(s) {
  if (!s) return "[]";
  try { JSON.parse(s); return s; } catch { return "[]"; }
}
function numOrNull(s) {
  if (s === undefined || s === null || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const csvPath = path.join(ROOT, "data", "investors_import.csv");
  if (!fs.existsSync(csvPath)) { console.error("Missing", csvPath); process.exit(1); }
  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const header = rows.shift().map((h) => h.trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  console.log(`Parsed ${rows.length} rows from data/investors_import.csv`);

  const client = new pg.Client({ connectionString: DB, ssl: /localhost|127\.0\.0\.1/.test(DB) ? false : { rejectUnauthorized: false } });
  await client.connect();

  // Existing keys for idempotent skip
  const existing = new Set();
  const ex = await client.query("SELECT lower(name) n, lower(coalesce(website,'')) w FROM investors");
  for (const r of ex.rows) existing.add(r.n + "|" + r.w);
  console.log(`Existing investors in DB: ${existing.size}`);

  let inserted = 0, skipped = 0;
  const BATCH = 400;
  let batch = [];

  async function flush() {
    if (!batch.length) return;
    const cols = ["name", "type", "firm_name", "description", "website", "location",
      "check_size_min", "check_size_max", "industries", "stages", "contact_email", "linkedin_url", "is_verified"];
    const values = [];
    const params = [];
    let p = 1;
    for (const rec of batch) {
      const ph = cols.map((c) => {
        if (c === "industries" || c === "stages") return `$${p++}::jsonb`;
        return `$${p++}`;
      });
      values.push(`(${ph.join(",")})`);
      params.push(rec.name, rec.type, rec.firm_name, rec.description, rec.website, rec.location,
        rec.check_size_min, rec.check_size_max, rec.industries, rec.stages, rec.contact_email, rec.linkedin_url, false);
    }
    await client.query(
      `INSERT INTO investors (${cols.join(",")}) VALUES ${values.join(",")}`,
      params,
    );
    inserted += batch.length;
    batch = [];
  }

  for (const r of rows) {
    const name = (r[idx.name] || "").trim();
    if (!name) continue;
    const website = (r[idx.website] || "").trim();
    const key = name.toLowerCase() + "|" + website.toLowerCase();
    if (existing.has(key)) { skipped++; continue; }
    existing.add(key);
    let type = (r[idx.type] || "").trim().toLowerCase();
    if (!ALLOWED_TYPES.has(type)) type = "corporate";
    batch.push({
      name,
      type,
      firm_name: (r[idx.firm_name] || name).trim() || name,
      description: (r[idx.description] || "").trim() || null,
      website: website || null,
      location: (r[idx.location] || "").trim() || null,
      check_size_min: numOrNull(r[idx.check_size_min]),
      check_size_max: numOrNull(r[idx.check_size_max]),
      industries: jsonOrEmpty((r[idx.industries] || "").trim()),
      stages: jsonOrEmpty((r[idx.stages] || "").trim()),
      contact_email: (r[idx.contact_email] || "").trim() || null,
      linkedin_url: (r[idx.linkedin_url] || "").trim() || null,
    });
    if (batch.length >= BATCH) await flush();
  }
  await flush();

  const total = await client.query("SELECT type, COUNT(*)::int c FROM investors GROUP BY type ORDER BY c DESC");
  await client.end();
  console.log(`\nInserted: ${inserted}  Skipped (already present): ${skipped}`);
  console.log("investors by type:");
  for (const r of total.rows) console.log(`  ${r.type.padEnd(16)} ${r.c}`);
  console.log("\nDone. Open /dashboard/find-investors or /dashboard/lp-matchmaking to run matchmaking.");
}

main().catch((e) => { console.error(e); process.exit(1); });
