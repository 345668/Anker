/**
 * Seed realistic tasks per user so the "My To-Dos" feed is populated.
 * Idempotent: skips users that already have tasks. Persona-aware (user_type).
 *
 * Usage: NEON_DATABASE_URL=… node scripts/oneshot/seed-tasks.mjs
 */
import { neon } from "@neondatabase/serverless"
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

const FOUNDER = (ent) => [
  { title: "Send intro emails to 10 investors", entity_label: ent, stage: "in_progress", priority: "high", due_date: day(-2) },
  { title: "Follow up with lead partner", entity_label: ent, stage: "to_do", priority: "high", due_date: day(-1) },
  { title: "Finalize pitch deck v3", entity_label: ent, stage: "to_do", priority: "normal", due_date: day(3) },
  { title: "Update cap table for new SAFE", entity_label: ent, stage: "review", priority: "normal", due_date: day(5) },
  { title: "Prepare data room financials", entity_label: ent, stage: "to_do", priority: "low", due_date: day(7) },
  { title: "Draft investor update — this month", entity_label: ent, stage: "done", priority: "normal", due_date: day(-6) },
]
const VC = (ent) => [
  { title: "Review capital call for $10,100", entity_label: ent, stage: "in_progress", priority: "high", due_date: day(-2) },
  { title: "Send LP quarterly report", entity_label: ent, stage: "to_do", priority: "high", due_date: day(-1) },
  { title: "Screen 8 new inbound deals", entity_label: ent, stage: "to_do", priority: "normal", due_date: day(2) },
  { title: "IC memo — Northstar Labs", entity_label: ent, stage: "review", priority: "normal", due_date: day(4) },
  { title: "Update fund NAV", entity_label: ent, stage: "to_do", priority: "low", due_date: day(6) },
  { title: "Close Series A — EA Therapeutics", entity_label: ent, stage: "done", priority: "high", due_date: day(-8) },
]

const users = await sql`SELECT id, email, user_type, company_name, first_name FROM users WHERE email IS NOT NULL`
let created = 0, skipped = 0
for (const u of users) {
  const has = await sql`SELECT 1 FROM tasks WHERE assignee_id = ${u.id} LIMIT 1`
  if (has.length) { skipped++; continue }
  const persona = u.user_type === "vc" ? "vc" : "founder"
  const ent = u.company_name || (u.first_name ? `${u.first_name}'s ${persona === "vc" ? "fund" : "company"}` : (persona === "vc" ? "My fund" : "My company"))
  const tasks = persona === "vc" ? VC(ent) : FOUNDER(ent)
  for (const t of tasks) {
    const id = `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    await sql`INSERT INTO tasks (id, assignee_id, title, entity_label, stage, priority, due_date)
              VALUES (${id}, ${u.id}, ${t.title}, ${t.entity_label}, ${t.stage}, ${t.priority}, ${t.due_date})`
  }
  created++
  console.log(`  + ${u.email} (${persona}) → ${tasks.length} tasks`)
}
console.log(`\nDone. seeded ${created} users, skipped ${skipped}.`)
