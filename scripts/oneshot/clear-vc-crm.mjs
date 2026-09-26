/**
 * Clear the VC workspace's CRM records so they can be re-promoted.
 *
 *   node scripts/oneshot/clear-vc-crm.mjs            # dry run
 *   node scripts/oneshot/clear-vc-crm.mjs --apply
 *
 * Why: the LPs promoted before the 2026-09-25 scoring fix (doc 19 §10) were
 * chosen by a model that could not read "North America" as a geography and
 * scored a $300M endowment as a perfect fit for a $5M fund. Nothing re-scores
 * rows already in a CRM, so they have to be removed and promoted again.
 *
 * Scope: VC workspaces only (organizations.kind <> 'company'). The founder CRM
 * is not touched, and the check below fails the run if its count moves.
 *
 * Deliberately NOT deleted:
 *   lp_match_sessions / lp_firm_matches / lp_contact_matches — the record of
 *     which runs happened, which stays true regardless of what was promoted.
 *   crm_activities — append-only by trigger (doc 25 §4.3). The script refuses to
 *     run if any exist rather than trying to delete them, because a workspace
 *     with logged history is one where someone has done work worth keeping.
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
      if (val.length >= 2 && ((val[0] === '"' && val.at(-1) === '"') || (val[0] === "'" && val.at(-1) === "'"))) val = val.slice(1, -1)
      process.env[key] = val
    }
  }
}
loadEnvFiles()

const APPLY = process.argv.includes("--apply")
const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

let host = "unknown"
try { host = new URL(url).host } catch {}
console.log(`${APPLY ? "APPLY" : "DRY RUN"} → ${host}\n`)

const vcOrgs = await sql`SELECT id, name FROM organizations WHERE kind <> 'company'`
if (!vcOrgs.length) { console.error("No VC workspace found."); process.exit(1) }
const ids = vcOrgs.map((o) => o.id)
console.log(`VC workspaces: ${vcOrgs.map((o) => `${o.name}`).join(", ")}`)

const counts = async () => {
  const [r] = await sql`
    SELECT (SELECT count(*)::int FROM crm_deals     WHERE org_id = ANY(${ids})) AS deals,
           (SELECT count(*)::int FROM crm_people    WHERE org_id = ANY(${ids})) AS people,
           (SELECT count(*)::int FROM crm_companies WHERE org_id = ANY(${ids})) AS companies,
           (SELECT count(*)::int FROM crm_entries   WHERE org_id = ANY(${ids})) AS entries,
           (SELECT count(*)::int FROM crm_activities WHERE org_id = ANY(${ids})) AS activities,
           (SELECT count(*)::int FROM crm_tasks     WHERE org_id = ANY(${ids})) AS tasks,
           (SELECT count(*)::int FROM crm_deals d JOIN organizations o ON o.id = d.org_id
             WHERE o.kind = 'company') AS founder_deals`
  return r
}

const before = await counts()
console.log(`  deals ${before.deals} · people ${before.people} · companies ${before.companies} · entries ${before.entries}`)
console.log(`  activities ${before.activities} · tasks ${before.tasks}`)
console.log(`  founder deals (must not move): ${before.founder_deals}\n`)

if (before.activities > 0) {
  console.error(`Refusing: ${before.activities} logged activities in this workspace.`)
  console.error("crm_activities is append-only and is evidence of real work. Review before clearing.")
  process.exit(1)
}

if (!APPLY) {
  console.log("Dry run — nothing deleted. Re-run with --apply.")
  process.exit(0)
}

// Children first. crm_deals' links are ON DELETE SET NULL, so strict ordering is
// not required, but deleting in dependency order keeps the intent legible.
const d = await sql`DELETE FROM crm_deals     WHERE org_id = ANY(${ids}) RETURNING id`
const p = await sql`DELETE FROM crm_people    WHERE org_id = ANY(${ids}) RETURNING id`
const c = await sql`DELETE FROM crm_companies WHERE org_id = ANY(${ids}) RETURNING id`
const e = await sql`DELETE FROM crm_entries   WHERE org_id = ANY(${ids}) RETURNING id`
// Findings about rows that no longer exist would otherwise sit in the report for
// good, and their NOT EXISTS guards key on entry_id.
const r = await sql`DELETE FROM crm_migration_report WHERE migration = 'crm_split:vc' RETURNING id`

console.log(`deleted: deals ${d.length} · people ${p.length} · companies ${c.length} · entries ${e.length} · findings ${r.length}`)

const after = await counts()
if (after.founder_deals !== before.founder_deals) {
  console.error(`\nFOUNDER CRM CHANGED: ${before.founder_deals} → ${after.founder_deals}. Investigate immediately.`)
  process.exit(1)
}
console.log(`founder deals unchanged at ${after.founder_deals}`)
console.log(`VC now: deals ${after.deals} · people ${after.people} · companies ${after.companies} · entries ${after.entries}`)
console.log("\nNext: re-run the pipeline with persist to promote from the corrected scoring.")
