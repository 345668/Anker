/** Seed the 3 "Let's connect" resource-card articles into the newsroom. Idempotent. */
import { neon } from "@neondatabase/serverless"
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

const ARTICLES = [
  {
    slug: "anker-plugins-for-claude",
    headline: "Introducing Anker Plugins for Claude: the future of private capital operations",
    blog_type: "Announcements",
    sentiment: "bullish",
    summary: "Anker connects the private-capital workflow — capital calls, distributions, LP reporting, and the data room — directly into Claude, so fund operators can run the back office in natural language.",
    content: `Private capital runs on a thousand small operations: calling capital, cutting distributions, reconciling the quarter, keeping LPs informed. Most of it still happens in spreadsheets and email.\n\nAnker Plugins for Claude bring those operations into one conversational surface. Draft a capital call, generate the per-LP notices, reconcile the close, and answer an LP's question about their capital account — without leaving the assistant.\n\nThis is an early concept, built in the open. The goal is simple: make fund operations feel like a conversation, backed by a real system of record.`,
  },
  {
    slug: "fund-economics-report-2025",
    headline: "Fund Economics Report 2025",
    blog_type: "Insights",
    sentiment: "neutral",
    summary: "A first-principles look at how venture fund economics actually work — management fees, carry, waterfalls, and the metrics LPs underwrite (TVPI, DPI, RVPI, MOIC, IRR).",
    content: `Fund economics are often treated as a black box. This report opens it up.\n\nWe walk through the mechanics every GP and LP should share a language for: how management fees and carried interest are structured, how a distribution waterfall pays out, and how the headline performance metrics — TVPI, DPI, RVPI, MOIC, and net IRR — are computed from dated cashflows rather than estimates.\n\nThe aim is a shared, honest baseline for how a fund creates and reports value.`,
  },
  {
    slug: "q4-2025-vc-fund-performance",
    headline: "Q4 2025 VC Fund Performance",
    blog_type: "Analysis",
    sentiment: "neutral",
    summary: "What the close looks like heading into 2026: pacing, mark discipline, and why quarterly-close rigor is becoming the differentiator for emerging managers.",
    content: `The quarter that closes the year is the one LPs read most closely.\n\nWe look at what a disciplined Q4 close involves — reconciling bank transactions, finalizing the schedule of investments, marking the book honestly, and publishing to LPs on time. The managers who treat the close as a product, not a scramble, are the ones building trust with their base.\n\nThis is a directional analysis, not investment advice.`,
  },
]

let created = 0
for (const a of ARTICLES) {
  const exists = await sql`SELECT 1 FROM news_articles WHERE slug = ${a.slug} LIMIT 1`
  if (exists.length) { console.log(`  = ${a.slug} (exists)`); continue }
  await sql`
    INSERT INTO news_articles (slug, headline, executive_summary, content, author, blog_type, sentiment, status, published_at, created_at, updated_at)
    VALUES (${a.slug}, ${a.headline}, ${a.summary}, ${a.content}, 'Anker', ${a.blog_type}, ${a.sentiment}, 'published', NOW(), NOW(), NOW())
  `
  created++
  console.log(`  + ${a.slug}`)
}
console.log(`Done. created ${created}.`)
