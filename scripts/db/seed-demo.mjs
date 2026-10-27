#!/usr/bin/env node
// Seeds a LOCAL database (.local-db, built by scripts/db/build-local.mjs) with a demo sign-in and two workspaces, so the app can be walked through without touching production
// (docs/architecture/75). Refuses anything but a local PGlite directory. Stop the dev server first: PGlite allows one process at a time.
//   node scripts/db/seed-demo.mjs [dir]        sign in at /auth/login as founder@demo.test / vc@demo.test, password "demo-password-1"
import { existsSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { vector } from "@electric-sql/pglite/vector"
import bcrypt from "bcryptjs"
import { randomUUID } from "node:crypto"

const dir = process.argv[2] || ".local-db"
if (!existsSync(dir)) { console.error(`${dir} does not exist; run node scripts/db/build-local.mjs ${dir} first.`); process.exit(2) }
const db = new PGlite(dir, { extensions: { vector } }); await db.waitReady
const hash = await bcrypt.hash("demo-password-1", 10)
const person = async (email, name, role) => {
  const [e] = (await db.query("SELECT id FROM local_users WHERE email = $1", [email])).rows
  if (e) return e.id
  const id = randomUUID()
  await db.query("INSERT INTO local_users (id, email, password_hash, name, role) VALUES ($1,$2,$3,$4,$5)", [id, email, hash, name, role])
  await db.query("INSERT INTO profiles (id, email, full_name) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING", [id, email, name])
  return id
}
const founder = await person("founder@demo.test", "Fiona Founder", "founder")
const vc = await person("vc@demo.test", "Victor Venture", "vc")
const org = async (user, kind, name, slug, persona) => {
  const [e] = (await db.query("SELECT id FROM organizations WHERE slug = $1", [slug])).rows
  if (e) return e.id
  const id = randomUUID()
  await db.query("INSERT INTO organizations (id, kind, name, slug, owner_user_id, created_by) VALUES ($1,$2,$3,$4,$5,$5)", [id, kind, name, slug, user])
  await db.query("INSERT INTO memberships (id, user_id, org_id, org_role, persona) VALUES ($1,$2,$3,'workspace_owner',$4)", [randomUUID(), user, id, persona])
  return id
}
const co = await org(founder, "company", "Demo Startup GmbH", "demo-startup", "founder")
const fo = await org(vc, "fund", "Demo Ventures", "demo-ventures", "vc")
// A fund workspace always has its fund (lib/org/provision.ts creates both); so does the demo one.
await db.query("INSERT INTO funds (id, slug, name, currency, status, vintage_year) VALUES ($1,$2,$3,'EUR','fundraising',2026) ON CONFLICT (id) DO NOTHING", ["demo-fund", "demo-fund", "Demo Ventures Fund I"])
await db.query("UPDATE organizations SET fund_id = 'demo-fund' WHERE id = $1 AND fund_id IS NULL", [fo])
// The investor side is closed by flags in production. The sandbox opens sign-up and the passport so the whole journey can be walked (discoverability stays off).
for (const k of ["investor_signup", "investor_passport", "halyard_web"]) await db.query("INSERT INTO platform_flags (key, enabled) VALUES ($1, true) ON CONFLICT (key) DO UPDATE SET enabled = true", [k])
await db.query("INSERT INTO platform_flags (key, enabled) VALUES ('investor_discoverability', false) ON CONFLICT (key) DO NOTHING")
// What a fund manager has typed into the fund profile, so the fund has something to show.
const [hasProfile] = (await db.query("SELECT 1 AS x FROM fund_profiles WHERE org_id = $1", [fo])).rows
if (!hasProfile) await db.query("INSERT INTO fund_profiles (user_id, name, fund_name, target_raise, org_id, is_active, sectors, geographic_focus, investment_stage, minimum_commitment, thesis_description, fund_life) VALUES ($1,'Demo Ventures Fund I','Demo Ventures Fund I',50000000,$2,true,'[\"climate\",\"AI\"]'::jsonb,'[\"Europe\"]'::jsonb,'seed, series a',250000,'Backs climate and AI founders in Europe at seed and Series A.',10)", [vc, fo])
console.log(`seeded: founder@demo.test (company ${co.slice(0, 8)}), vc@demo.test (fund workspace ${fo.slice(0, 8)}); password demo-password-1`)
await db.close()
