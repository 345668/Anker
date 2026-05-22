#!/usr/bin/env node
/**
 * Seed the Anker `investment_firms` table from data/investment_firms.xlsx
 * (the 20,261-row export of the firm database).
 *
 * Idempotent: INSERT ... ON CONFLICT (id) DO NOTHING, so re-running only
 * adds rows that aren't already present. Assumes the investment_firms
 * table already exists (it ships with the base schema / migrations).
 *
 * Usage:
 *   DATABASE_URL=postgres://anker:anker@localhost:5432/anker node scripts/seed-firms.mjs
 *   pnpm seed:firms
 */
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const { Client } = require("pg");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function loadEnvLocal() {
  const f = path.join(ROOT, ".env.local");
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
}
loadEnvLocal();
const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
if (!dbUrl) { console.error("No DATABASE_URL / POSTGRES_URL set (checked env + .env.local)."); process.exit(1); }

const FILE = process.env.FIRMS_XLSX || path.join(ROOT, "data", "investment_firms.xlsx");
if (!fs.existsSync(FILE)) { console.error("Missing", FILE); process.exit(1); }

// Columns of the investment_firms export (matches load-postgres.mjs FIRM_COLS).
const FIRM_COLS = ["id","name","description","website","logo","type","aum","location","stages","sectors","check_size_min","check_size_max","portfolio_count","linkedin_url","twitter_url","created_at","folk_id","folk_workspace_id","folk_list_ids","folk_updated_at","source","updated_at","hq_location","industry","emails","phones","addresses","urls","funding_raised","last_funding_date","foundation_year","employee_range","status","folk_custom_fields","url_1","url_2","firm_classification","typical_check_size","enrichment_status","last_enrichment_date","enrichment_error","logo_url"];
const jsonCols = new Set(["stages","sectors","folk_list_ids","emails","phones","addresses","urls","folk_custom_fields"]);
const intCols = new Set(["check_size_min","check_size_max","portfolio_count","foundation_year"]);

async function main() {
  const client = new Client({ connectionString: dbUrl, ssl: /localhost|127\.0\.0\.1/.test(dbUrl) ? false : { rejectUnauthorized: false } });
  await client.connect();
  console.log("[seed-firms] connected to", dbUrl.replace(/:[^:@]+@/, ":***@"));

  // Discover which of FIRM_COLS actually exist on the table (schema drift tolerant).
  const colRes = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='investment_firms'",
  );
  const tableCols = new Set(colRes.rows.map((r) => r.column_name));
  if (tableCols.size === 0) { console.error("investment_firms table not found — run migrations / load-postgres first."); process.exit(1); }
  const cols = FIRM_COLS.filter((c) => tableCols.has(c));

  const wb = XLSX.readFile(FILE);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null, raw: true });
  console.log(`[seed-firms] ${rows.length} rows → investment_firms (${cols.length} cols)`);

  const before = (await client.query("SELECT COUNT(*)::int c FROM investment_firms")).rows[0].c;
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const values = []; const placeholders = []; let p = 1;
    for (const row of batch) {
      const ph = [];
      for (const col of cols) {
        let v = row[col];
        if (v === undefined) v = null;
        if (v != null && jsonCols.has(col)) {
          if (typeof v === "object") v = JSON.stringify(v);
          else if (typeof v === "string") { try { JSON.parse(v); } catch { v = JSON.stringify([v]); } }
        }
        if (v != null && intCols.has(col)) { const n = Number(v); v = Number.isFinite(n) ? Math.trunc(n) : null; }
        ph.push(`$${p++}`); values.push(v);
      }
      placeholders.push(`(${ph.join(",")})`);
    }
    await client.query(
      `INSERT INTO investment_firms (${cols.join(",")}) VALUES ${placeholders.join(",")} ON CONFLICT (id) DO NOTHING`,
      values,
    );
    if ((i + BATCH) % 5000 < BATCH) process.stdout.write(`\r  ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
  process.stdout.write("\n");
  const after = (await client.query("SELECT COUNT(*)::int c FROM investment_firms")).rows[0].c;
  await client.end();
  console.log(`[seed-firms] done. investment_firms: ${before} -> ${after} (+${after - before})`);
}
main().catch((e) => { console.error(e); process.exit(1); });
