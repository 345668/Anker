#!/usr/bin/env node
// Restore drill (docs/architecture/59 R4, runbook docs/runbooks/restore.md). Makes a READ-ONLY point-in-time branch of production, compares row counts, records the outcome, deletes the branch.
//   NEON_API_KEY=... NEON_PROJECT_ID=... NEON_DATABASE_URL=... node scripts/restore-drill.mjs [--age-min 60] [--plan]
// The key and the project id are YOURS to provide in your own shell: nothing here reads them from a file, prints them or stores them. --plan prints what would happen and calls nothing.
import { neon } from "@neondatabase/serverless"
import { runDrill, neonApi, IMPORTANT_TABLES, TOLERANCE } from "./lib/restore-drill.mjs"

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d }
const ageMin = Number(arg("--age-min", 60))
if (process.argv.includes("--plan")) {
  console.log(`Would create a read-only Neon branch of production as it was ${ageMin} minutes ago, compare the row counts of ${IMPORTANT_TABLES.length} tables (tolerance ${TOLERANCE.relative * 100}% or ${TOLERANCE.floor} rows, plus rows written since), run 3 read-only queries, record the result in restore_drills, and delete the branch.`)
  console.log("Needs NEON_API_KEY, NEON_PROJECT_ID and NEON_DATABASE_URL in the environment. Nothing was called."); process.exit(0)
}
const { NEON_API_KEY: apiKey, NEON_PROJECT_ID: projectId, NEON_DATABASE_URL: prodUrl } = process.env
if (!apiKey || !projectId || !prodUrl) { console.error("Set NEON_API_KEY, NEON_PROJECT_ID and NEON_DATABASE_URL in your shell (see docs/runbooks/restore.md). Nothing was called."); process.exit(2) }
if (!Number.isFinite(ageMin) || ageMin < 5 || ageMin > 60 * 24 * 7) { console.error("--age-min must be between 5 minutes and a week."); process.exit(2) }

const prodSql = neon(prodUrl)
const prod = (text, params = []) => prodSql.query(text, params)
const row = await runDrill({
  api: neonApi({ apiKey, projectId }), prod, ageMin, runBy: process.env.USER ?? null,
  connect: (uri) => { const s = neon(uri); return { query: (t, p = []) => s.query(t, p), close: async () => {} } },
  record: async (r) => { await prod(`INSERT INTO restore_drills (started_at, branch_age_min, seconds, passed, tables_checked, tables_off, detail, run_by) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`, [r.startedAt, r.ageMin, r.seconds, r.passed, r.tablesChecked, r.tablesOff, JSON.stringify(r.detail), r.runBy]) },
})
console.log(`${row.passed ? "PASSED" : "FAILED"} in ${row.seconds} s: ${row.tablesChecked} tables compared, ${row.tablesOff} outside tolerance. Branch ${row.detail.branchDeleted ? "deleted" : "NOT deleted: remove it in the Neon console"}.`)
if (!row.passed) { console.log(row.detail.error ?? row.detail.tables.filter((t) => !t.ok).map((t) => `${t.table}: production ${t.prod}, restored ${t.restored}, expected about ${t.expected} (±${t.slack})`).join("\n")); process.exit(1) }
