// Prints the region of each provider the investor side depends on, so the sub-processor register and the privacy notice can be filled from facts
// (docs/architecture/74 section 1; runbook docs/legal/investor-side/12-eu-region-runbook.md). Run it yourself, with your own keys in the environment:
//   node scripts/legal/read-regions.mjs
//   (optional) RESEND_API_KEY=...            lists each sending domain and its region
//   (optional) SUPABASE_ACCESS_TOKEN=...     a personal access token; with NEXT_PUBLIC_SUPABASE_URL it prints the project's region
// Nothing is changed. Keys are used only for these read requests and are never printed.
const out = (k, v) => console.log(`${k.padEnd(10)} ${v}`)

const dbUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || ""
const host = dbUrl.replace(/^[a-z]+:\/\/[^@]*@/, "").split(/[/:?]/)[0]
const m = /\.([a-z]{2}-[a-z]+-\d)\.aws\.neon\.tech$/.exec(host) || /\.([a-z]{2}-[a-z]+-\d)\./.exec(host)
out("database", host ? `${host.replace(/^ep-[a-z0-9-]+/, "ep-…")} -> region ${m ? m[1] : "not readable from the address"}` : "no database URL in the environment")

if (process.env.RESEND_API_KEY) {
  const r = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } })
  const j = await r.json().catch(() => null)
  if (!r.ok) out("email", `Resend answered ${r.status}`)
  else for (const d of j?.data ?? []) out("email", `${d.name}: region ${d.region} (status ${d.status})`)
} else out("email", "set RESEND_API_KEY to read the sending domains' regions, or read them at resend.com/domains")

const ref = /https?:\/\/([a-z0-9]+)\.supabase\.co/.exec(process.env.NEXT_PUBLIC_SUPABASE_URL || "")?.[1]
if (process.env.SUPABASE_ACCESS_TOKEN && ref) {
  const r = await fetch("https://api.supabase.com/v1/projects", { headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` } })
  const j = await r.json().catch(() => null)
  const p = Array.isArray(j) ? j.find((x) => x.id === ref) : null
  out("sign-in", r.ok ? (p ? `project ${ref.slice(0, 4)}…: region ${p.region}` : "project not found for this token") : `Supabase answered ${r.status}`)
} else out("sign-in", ref ? "set SUPABASE_ACCESS_TOKEN (a personal access token) to read the region, or read it at supabase.com/dashboard > Project Settings > General" : "no NEXT_PUBLIC_SUPABASE_URL in the environment")
