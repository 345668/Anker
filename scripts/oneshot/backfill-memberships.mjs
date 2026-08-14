/**
 * Backfill: give every existing `users` row a personal workspace
 * (organizations + memberships) so the entity switcher has data.
 *
 * Idempotent — skips users that already have a membership. Kind/persona derive
 * from users.user_type (vc → fund, else company/founder).
 *
 * Usage: NEON_DATABASE_URL=… node scripts/oneshot/backfill-memberships.mjs
 */
import { neon } from "@neondatabase/serverless"

const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

const users = await sql`SELECT id, email, user_type, company_name, first_name FROM users WHERE email IS NOT NULL`
let created = 0, skipped = 0
for (const u of users) {
  const has = await sql`SELECT 1 FROM memberships WHERE user_id = ${u.id} LIMIT 1`
  if (has.length) { skipped++; continue }
  const persona = u.user_type === "vc" ? "vc" : "founder"
  const kind = persona === "vc" ? "fund" : "company"
  const name = u.company_name || (u.first_name ? `${u.first_name}'s ${kind}` : (persona === "vc" ? "My fund" : "My company"))
  const oid = `org_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const mid = `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  await sql`INSERT INTO organizations (id, kind, name, owner_user_id, created_by) VALUES (${oid}, ${kind}, ${name}, ${u.id}, ${u.id}) ON CONFLICT (id) DO NOTHING`
  await sql`INSERT INTO memberships (id, user_id, org_id, org_role, persona, can_send_outreach) VALUES (${mid}, ${u.id}, ${oid}, 'workspace_owner', ${persona}, true) ON CONFLICT (user_id, org_id) DO NOTHING`
  created++
  console.log(`  + ${u.email} → ${kind} "${name}"`)
}
console.log(`\nDone. created ${created}, skipped ${skipped} (already had a workspace).`)
