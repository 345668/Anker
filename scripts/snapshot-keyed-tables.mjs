#!/usr/bin/env node
// Writes lib/tenant/keyed-tables.snapshot.json: every table in the live database with a workspace, fund or owner key.
// The tenant registry test compares against it, so a new table fails CI until it is classified in lib/tenant/registry.ts.
//   NEON_DATABASE_URL=... node scripts/snapshot-keyed-tables.mjs
import { neon } from "@neondatabase/serverless"
import { writeFileSync } from "node:fs"
const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL
if (!url) { console.error("Set NEON_DATABASE_URL"); process.exit(1) }
const sql = neon(url)
const rows = await sql.query(`select table_name, array_agg(column_name order by column_name) cols from information_schema.columns
  where table_schema = 'public' and column_name in ('org_id','fund_id','workspace_id','owner_user_id')
  and table_name not like 'neon\\_%' group by 1 order by 1`)
const out = Object.fromEntries(rows.map((r) => [r.table_name, Array.isArray(r.cols) ? r.cols : String(r.cols).replace(/[{}]/g, "").split(",")]))
writeFileSync("lib/tenant/keyed-tables.snapshot.json", JSON.stringify({ takenAt: new Date().toISOString().slice(0, 10), tables: out }, null, 2) + "\n")
console.log(`${rows.length} keyed tables`)
