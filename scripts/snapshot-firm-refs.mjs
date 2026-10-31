#!/usr/bin/env node
/** Retakes lib/directory/firm-refs.snapshot.json from the live schema: every base-table column that holds a firm id, by name (firm_id, *_firm_id) or by foreign key to investment_firms (docs/architecture/55 E3). Needs NEON_DATABASE_URL. */
import { createRequire } from "node:module"
import fs from "node:fs"
const require = createRequire(import.meta.url)
const { Client } = require("pg")
const c = new Client({ connectionString: process.env.NEON_DATABASE_URL }); await c.connect()
const byName = (await c.query(`SELECT c.table_name, c.column_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
  WHERE c.table_schema = 'public' AND (c.column_name = 'firm_id' OR c.column_name ~ '_firm_ids?$')`)).rows
const byFk = (await c.query(`SELECT cl.relname AS table_name, a.attname AS column_name FROM pg_constraint k JOIN pg_class cl ON cl.oid = k.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace
  JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY (k.conkey) WHERE k.contype = 'f' AND k.confrelid = 'public.investment_firms'::regclass AND n.nspname = 'public'`)).rows
const refs = [...new Set([...byName, ...byFk].map((r) => `${r.table_name}.${r.column_name}`))].filter((r) => !/^neon_(bak|del|fix)_/.test(r)).sort()
fs.writeFileSync("lib/directory/firm-refs.snapshot.json", JSON.stringify({ takenAt: new Date().toISOString().slice(0, 10), refs }, null, 2) + "\n")
console.log(`${refs.length} columns`); await c.end()
