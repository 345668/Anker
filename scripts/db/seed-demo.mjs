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
console.log(`seeded: founder@demo.test (company ${co.slice(0, 8)}), vc@demo.test (fund workspace ${fo.slice(0, 8)}); password demo-password-1`)
await db.close()
