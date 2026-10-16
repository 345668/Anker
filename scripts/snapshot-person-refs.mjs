#!/usr/bin/env node
/** Retakes lib/directory/person-refs.snapshot.json from the live schema: every base-table column that ends in investor_id (docs/architecture/54, D4). Needs NEON_DATABASE_URL. */
import { createRequire } from "node:module"
import fs from "node:fs"
const require = createRequire(import.meta.url)
const { Client } = require("pg")
const c = new Client({ connectionString: process.env.NEON_DATABASE_URL }); await c.connect()
const rows = (await c.query(`SELECT c.table_name, c.column_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
  WHERE c.table_schema = 'public' AND c.column_name ~ 'investor_id$' ORDER BY 1, 2`)).rows
fs.writeFileSync("lib/directory/person-refs.snapshot.json", JSON.stringify({ takenAt: new Date().toISOString().slice(0, 10), refs: rows.map((r) => `${r.table_name}.${r.column_name}`) }, null, 2) + "\n")
console.log(`${rows.length} columns`); await c.end()
