/**
 * Patch — add news_articles.sentiment column on Neon.
 *
 * 2026-06-22: the public newsroom article header used to show a
 * "Confidence X%" pill driven by news_articles.confidence_score. That UI is
 * gone; in its place we render an editorial sentiment badge — Bullish /
 * Neutral / Bearish. This script adds the column production needs.
 *
 *   - Column: sentiment TEXT (nullable)
 *   - CHECK : sentiment IN ('bullish','neutral','bearish') OR sentiment IS NULL
 *
 * We use a CHECK constraint rather than an enum so future vocabulary changes
 * are one ALTER away (drop CHECK / add new CHECK) and don't require an
 * enum-extension dance on every Neon branch.
 *
 * Idempotent. Safe to re-run.
 *
 *   NEON_DATABASE_URL=... node scripts/oneshot/run-news-articles-sentiment-column.mjs
 */

const { neon } = await import("@neondatabase/serverless")
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

// ── snapshot before ─────────────────────────────────────────────────────

const before = await sql`
  SELECT column_name, data_type FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'news_articles'
     AND column_name IN ('sentiment','confidence_score')
   ORDER BY column_name
`
console.log("Relevant columns BEFORE:")
for (const c of before) console.log(`  - ${c.column_name} (${c.data_type})`)
if (before.length === 0) console.log("  (none yet — sentiment + confidence_score absent)")

// ── ADD COLUMN ─────────────────────────────────────────────────────────

console.log("\nAdding sentiment column…")
try {
  await sql`ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS sentiment TEXT`
  console.log("  OK  sentiment TEXT")
} catch (e) {
  console.error(`  ERR ${e.message}`)
  process.exit(1)
}

// ── CHECK constraint ──────────────────────────────────────────────────-

console.log("\nAdding sentiment CHECK constraint…")
try {
  const existing = await sql`
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.news_articles'::regclass
       AND conname  = 'news_articles_sentiment_check'
  `
  if (existing.length === 0) {
    // Use the modern not-valid trick on existing tables — even though we just
    // added the column (so all rows are NULL and would pass anyway), this
    // gives us a clean two-phase validation pattern we can re-use elsewhere.
    await sql`
      ALTER TABLE news_articles
        ADD CONSTRAINT news_articles_sentiment_check
        CHECK (sentiment IS NULL OR sentiment IN ('bullish','neutral','bearish'))
    `
    console.log("  OK  news_articles_sentiment_check added")
  } else {
    console.log("  ✓ news_articles_sentiment_check already present")
  }
} catch (e) {
  console.error(`  ERR ${e.message}`)
}

// ── snapshot after ──────────────────────────────────────────────────────

const after = await sql`
  SELECT column_name, data_type FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'news_articles'
     AND column_name IN ('sentiment','confidence_score')
   ORDER BY column_name
`
console.log("\nRelevant columns AFTER:")
for (const c of after) console.log(`  - ${c.column_name} (${c.data_type})`)

const cnt = await sql`SELECT COUNT(*) AS n, COUNT(sentiment) AS tagged FROM news_articles`
console.log(`\nnews_articles: ${cnt[0].n} row(s) total, ${cnt[0].tagged} with sentiment set.`)
console.log("\nDone. Editors can now set sentiment via /dashboard/admin/newsroom/[id].")
