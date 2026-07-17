/**
 * Phase 0 · Resend diagnostic for the June 18 campaign.
 *
 * Queries Resend's API for send / delivered / opened / clicked / bounced /
 * complained rates on emails Philippe sent for the Jun 18 webinar batch.
 * Writes a JSON summary that Claude turns into the diagnostic memo.
 *
 * Usage:
 *   RESEND_API_KEY='re_...' node scripts/oneshot/01-resend-diagnostic.mjs
 *
 * If the emails weren't tagged, adjust FROM_FILTER / SUBJECT_HINT below.
 */
import { writeFileSync } from "node:fs"

const RESEND_KEY = process.env.RESEND_API_KEY
if (!RESEND_KEY) {
  console.error("RESEND_API_KEY missing. Try:")
  console.error("  RESEND_API_KEY='re_...' node scripts/oneshot/01-resend-diagnostic.mjs")
  console.error("Or find it in Vercel: vercel env pull .env.local && RESEND_API_KEY=$(grep RESEND_API_KEY .env.local | cut -d= -f2- | tr -d '\"') node …")
  process.exit(1)
}

// June batch shipped from vc@an-ker.de via Resend (an-ker.de is Anker's owned
// sending domain). pj@summitventurestudio.com is a SVS-side reply contact.
const FROM_FILTER = "vc@an-ker.de"
const SUBJECT_HINT = "Summit Venture Studio"
const SINCE = new Date("2026-06-01T00:00:00Z")
const UNTIL = new Date("2026-06-30T23:59:59Z")

async function resend(path) {
  const r = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${RESEND_KEY}` },
  })
  if (!r.ok) {
    const body = await r.text()
    throw new Error(`Resend ${path}: HTTP ${r.status} ${body.slice(0, 300)}`)
  }
  return r.json()
}

console.log("Fetching Resend email history…")
const relevant = []
let cursor = null
let pages = 0
let done = false

while (!done) {
  pages++
  const path = cursor ? `/emails?limit=100&after=${cursor}` : "/emails?limit=100"
  const page = await resend(path)
  const items = page.data || []
  if (!items.length) break
  for (const e of items) {
    const created = new Date(e.created_at)
    if (created < SINCE) { done = true; break }
    if (created > UNTIL) continue
    const fromLc = (e.from || "").toLowerCase()
    const subjLc = (e.subject || "").toLowerCase()
    if (fromLc.includes(FROM_FILTER.toLowerCase()) || subjLc.includes(SUBJECT_HINT.toLowerCase())) {
      relevant.push(e)
    }
  }
  if (pages > 200) break  // safety net
  cursor = items[items.length - 1]?.id
  if (!cursor) break
}

console.log(`Scanned ${pages} page(s). Found ${relevant.length} emails matching filters.`)

// Aggregate by last_event
const byStatus = {}
for (const e of relevant) byStatus[e.last_event] = (byStatus[e.last_event] || 0) + 1

// Also aggregate by day so we can spot the actual send window
const byDay = {}
for (const e of relevant) {
  const day = (e.created_at || "").slice(0, 10)
  byDay[day] = (byDay[day] || 0) + 1
}

const total = relevant.length
const opened = (byStatus.opened || 0) + (byStatus.clicked || 0)
const bounced = (byStatus.bounced || 0) + (byStatus.complained || 0)
const delivered = (byStatus.delivered || 0) + opened

const summary = {
  matched: total,
  windowUtc: [SINCE.toISOString(), UNTIL.toISOString()],
  fromFilter: FROM_FILTER,
  subjectHint: SUBJECT_HINT,
  byLastEvent: byStatus,
  byDay,
  deliveredRatePct: total ? Math.round((delivered / total) * 1000) / 10 : null,
  openRatePct: total ? Math.round((opened / total) * 1000) / 10 : null,
  bounceRatePct: total ? Math.round((bounced / total) * 1000) / 10 : null,
  perEmail: relevant.map((e) => ({
    id: e.id,
    from: e.from,
    to: e.to,
    subject: e.subject,
    created_at: e.created_at,
    last_event: e.last_event,
  })),
}

const path = "resend-diagnostic-june.json"
writeFileSync(path, JSON.stringify(summary, null, 2))
console.log(`\n✓ Wrote ${path}`)
console.log(`   Total matched: ${total}`)
console.log(`   Delivered:     ${summary.deliveredRatePct}%`)
console.log(`   Opened+clicked:${summary.openRatePct}%`)
console.log(`   Bounced+spam:  ${summary.bounceRatePct}%`)
console.log(`   By event:      ${JSON.stringify(byStatus)}`)
