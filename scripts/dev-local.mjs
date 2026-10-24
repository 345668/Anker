#!/usr/bin/env node
// Runs the app against the LOCAL database (.local-db) with every outbound key blanked, so nothing can reach production, send an email, or call a paid service
// (docs/architecture/75). Build the database first: node scripts/db/build-local.mjs && node scripts/db/seed-demo.mjs
//   node scripts/dev-local.mjs [port]      default port 3100
import { readFileSync, existsSync } from "node:fs"
import { spawn } from "node:child_process"

if (!existsSync(".local-db")) { console.error("No .local-db. Run: node scripts/db/build-local.mjs && node scripts/db/seed-demo.mjs"); process.exit(2) }
const env = { ...process.env }
const names = existsSync(".env.local") ? readFileSync(".env.local", "utf8").split("\n").map((l) => /^([A-Z][A-Z0-9_]*)=/.exec(l)?.[1]).filter(Boolean) : []
for (const n of names) if (/(KEY|TOKEN|SECRET|PASSWORD|DSN|WEBHOOK|URL)/.test(n) && !n.startsWith("NEXT_PUBLIC_") && n !== "SECRET_KEY") env[n] = ""
Object.assign(env, { LOCAL_EMAIL_OUTBOX: "1", LOCAL_DB: "true", LOCAL_AUTH_BYPASS: "true", SECRET_KEY: "local-dev-secret-key-not-production", NEXT_PUBLIC_SUPABASE_URL: "https://stub.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "stub", NEXT_PUBLIC_APP_URL: `http://localhost:${process.argv[2] || 3100}`, APP_URL: `http://localhost:${process.argv[2] || 3100}` })
console.log("emails are written to .local-outbox.jsonl, not sent")
console.log(`local mode: database .local-db, ${names.filter((n) => env[n] === "").length} outbound settings blanked`)
spawn("pnpm", ["exec", "next", "dev", "-p", String(process.argv[2] || 3100)], { stdio: "inherit", env })
