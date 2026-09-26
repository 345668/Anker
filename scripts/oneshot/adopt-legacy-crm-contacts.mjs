/**
 * Bulk-adopt legacy board-less crm_entries into a workspace.
 *
 * Doc: docs/architecture/25-per-persona-crm.md §6.1-6.2
 *
 *   node scripts/oneshot/adopt-legacy-crm-contacts.mjs                 # dry run
 *   node scripts/oneshot/adopt-legacy-crm-contacts.mjs --apply
 *   node scripts/oneshot/adopt-legacy-crm-contacts.mjs --user <id> --org <id> [--apply] [--limit N]
 *
 * Why this exists: /dashboard/workspaces/legacy adopts ONE record per request and
 * lists at most 200, so a user holding hundreds of board-less contacts cannot
 * realistically use it. This is a loop around the same database function the UI
 * calls — `workspace_adopt_record` — not a way around it. That function re-checks
 * membership, role and persona inside the database and writes a
 * workspace_access_events row per move, so nothing here is privileged that the UI
 * is not, and every move stays audited.
 *
 * It adopts only entries that are:
 *   org_id IS NULL      — not already in a workspace
 *   board_id IS NULL    — the p_kind='contact' branch requires it; entries on a
 *                         board must be adopted via the board instead
 *   user_id = the actor — the function enforces this too; we filter so the dry
 *                         run reports an honest count
 *
 * Dry run is the default and prints what would happen. Nothing is written without
 * --apply.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { neon } from "@neondatabase/serverless"

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

function loadEnvFiles() {
  for (const name of [".env.local", ".env"]) {
    let text
    try { text = readFileSync(path.join(REPO_ROOT, name), "utf8") } catch { continue }
    for (let line of text.split("\n")) {
      line = line.trim()
      if (!line || line.startsWith("#")) continue
      if (line.startsWith("export ")) line = line.slice(7).trim()
      const eq = line.indexOf("=")
      if (eq === -1) continue
      const key = line.slice(0, eq).trim()
      if (!key || key in process.env) continue
      let val = line.slice(eq + 1).trim()
      if (val.length >= 2 && ((val[0] === '"' && val.at(-1) === '"') || (val[0] === "'" && val.at(-1) === "'"))) {
        val = val.slice(1, -1)
      }
      process.env[key] = val
    }
  }
}
loadEnvFiles()

const argv = process.argv.slice(2)
const flag = (name) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? null : argv[i + 1]
}
const APPLY = argv.includes("--apply")
const LIMIT = flag("limit") ? Number(flag("limit")) : null
let userId = flag("user")
let orgId = flag("org")

const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing (set it, or add it to .env.local)"); process.exit(1) }
const sql = neon(url)

let host = "unknown"
try { host = new URL(url).host } catch {}
console.log(`${APPLY ? "APPLY" : "DRY RUN"} → ${host}\n`)

// ─── Resolve the destination, or refuse ─────────────────────────────────────
// Candidates are (owner of legacy board-less entries) × (their founder workspace).
// More than one candidate is not resolved by picking: doc 00 §3 is explicit that a
// multi-workspace user's rows must not be assigned by inference.
if (!userId || !orgId) {
  const candidates = await sql`
    SELECT e.user_id, m.org_id, o.name AS org_name, o.kind, m.persona, m.org_role,
           count(*)::int AS entries
      FROM crm_entries e
      JOIN memberships m ON m.user_id = e.user_id
      JOIN organizations o ON o.id = m.org_id AND o.archived_at IS NULL
     WHERE e.org_id IS NULL AND e.board_id IS NULL
       AND o.kind = 'company' AND m.persona = 'founder'
       AND m.org_role IN ('workspace_owner','admin','member')
     GROUP BY e.user_id, m.org_id, o.name, o.kind, m.persona, m.org_role
     ORDER BY entries DESC
  `
  if (!candidates.length) {
    console.error("No (user, founder workspace) pair owns legacy board-less entries. Nothing to do.")
    process.exit(1)
  }
  if (candidates.length > 1) {
    console.error(`${candidates.length} candidate destinations — refusing to choose. Pass --user and --org:\n`)
    for (const c of candidates) {
      console.error(`  --user ${c.user_id} --org ${c.org_id}   # ${c.org_name} (${c.kind}/${c.persona}) — ${c.entries} entries`)
    }
    process.exit(1)
  }
  userId = candidates[0].user_id
  orgId = candidates[0].org_id
  console.log(`Resolved destination: ${candidates[0].org_name} (${candidates[0].kind}/${candidates[0].persona}, ${candidates[0].org_role})`)
}

const [org] = await sql`SELECT id, name, kind, archived_at FROM organizations WHERE id = ${orgId}`
if (!org) { console.error(`Org ${orgId} not found.`); process.exit(1) }
if (org.archived_at) { console.error(`Org ${org.name} is archived.`); process.exit(1) }

const [member] = await sql`SELECT persona, org_role FROM memberships WHERE org_id = ${orgId} AND user_id = ${userId}`
if (!member) { console.error(`User has no membership in ${org.name}.`); process.exit(1) }

console.log(`  workspace : ${org.name} (${org.kind})`)
console.log(`  actor     : ${String(userId).slice(0, 8)}… as ${member.persona}/${member.org_role}`)

const rows = await sql`
  SELECT id, display_name FROM crm_entries
   WHERE user_id = ${userId} AND org_id IS NULL AND board_id IS NULL
   ORDER BY added_at
   ${LIMIT ? sql`LIMIT ${LIMIT}` : sql``}
`
console.log(`  entries   : ${rows.length} board-less legacy contacts\n`)

if (!rows.length) { console.log("Nothing to adopt."); process.exit(0) }

if (!APPLY) {
  console.log("Dry run — nothing written. Sample of what would move:")
  for (const r of rows.slice(0, 5)) console.log(`  ${r.id}  ${r.display_name}`)
  if (rows.length > 5) console.log(`  … and ${rows.length - 5} more`)
  console.log(`\nRe-run with --apply to adopt all ${rows.length} into ${org.name}.`)
  process.exit(0)
}

// ─── Apply, one call per entry, failures tallied not fatal ──────────────────
// A single row that conflicts should not abandon the other 626; each call is its
// own transaction inside the function.
let ok = 0
const failures = new Map()
for (const [i, r] of rows.entries()) {
  try {
    await sql`SELECT workspace_adopt_record(${userId}, ${orgId}, 'contact', ${r.id})`
    ok++
  } catch (e) {
    const msg = (e?.message ?? String(e)).split("\n")[0]
    failures.set(msg, (failures.get(msg) ?? 0) + 1)
  }
  if ((i + 1) % 50 === 0 || i + 1 === rows.length) {
    console.log(`  ${i + 1}/${rows.length}  adopted ${ok}, failed ${rows.length ? (i + 1 - ok) : 0}`)
  }
}

console.log(`\nAdopted ${ok} of ${rows.length}.`)
if (failures.size) {
  console.log("\nFailures by reason:")
  for (const [msg, n] of [...failures].sort((a, b) => b[1] - a[1])) console.log(`  ${n}×  ${msg}`)
}

const [remaining] = await sql`
  SELECT count(*)::int AS n FROM crm_entries
   WHERE user_id = ${userId} AND org_id IS NULL AND board_id IS NULL
`
console.log(`\n${remaining.n} legacy board-less contacts remain for this user.`)
console.log("Next: re-run scripts/migrations/2026-09-25-crm-entities.sql — it is idempotent and will pick these up.")
