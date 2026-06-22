/**
 * Patch — bring the production news_articles table up to the schema the
 * admin CRUD expects.
 *
 * Production reported:
 *   POST /api/admin/newsroom failed with
 *   'column "created_by" of relation "news_articles" does not exist'
 *
 * Same pattern as the funds-table mismatch we fixed earlier: the existing
 * news_articles table predates the 2026-05-08 + 2026-06-20 migrations and
 * is missing one or more of the columns the admin CRUD writes to.
 *
 * This script:
 *   1. Snapshots the existing column list
 *   2. ALTER TABLE ADD COLUMN IF NOT EXISTS for every column the admin
 *      CRUD references, with safe defaults (no NOT NULL on add — backfill
 *      conventions live in the application layer)
 *   3. Adds the slug UNIQUE constraint when missing (with a backfill of
 *      placeholder slugs for any legacy rows that don't have one)
 *   4. Adds the status CHECK and the partial scheduled_for index
 *   5. Prints final column list for verification
 *
 * Idempotent. Safe to re-run.
 */

const { neon } = await import("@neondatabase/serverless")
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

// ── snapshot ────────────────────────────────────────────────────────────

const before = await sql`
  SELECT column_name, data_type FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'news_articles'
   ORDER BY ordinal_position
`
console.log("Existing news_articles columns:")
for (const c of before) console.log(`  - ${c.column_name} (${c.data_type})`)

// ── ADD COLUMNs the admin CRUD touches ──────────────────────────────────
//
// We deliberately don't enforce NOT NULL here — the migration file does
// (because new tables start empty) but production may already have rows
// without these values. Defaults handle the immediate insert case, and
// callers can backfill historical rows separately.

const addColumns = [
  // The known-broken one from the user's report
  ["created_by",     "TEXT"],
  // The other 2026-06-20 newsroom-polish additions
  ["slug",           "TEXT"],
  ["scheduled_for",  "TIMESTAMPTZ"],
  ["source_pdf_url", "TEXT"],
  // Standard columns — these probably exist, but ADD COLUMN IF NOT EXISTS
  // is cheap and protects us against any further drift.
  ["headline",       "TEXT"],
  ["executive_summary", "TEXT"],
  ["content",        "TEXT"],
  ["author",         "TEXT DEFAULT 'Anker'"],
  ["blog_type",      "TEXT DEFAULT 'Insights'"],
  ["tags",           "JSONB DEFAULT '[]'::jsonb"],
  ["status",         "TEXT DEFAULT 'draft'"],
  ["image_url",      "TEXT"],
  ["published_at",   "TIMESTAMPTZ"],
  ["created_at",     "TIMESTAMPTZ DEFAULT NOW()"],
  ["updated_at",     "TIMESTAMPTZ DEFAULT NOW()"],
]

console.log("\nAdding missing columns…")
for (const [col, type] of addColumns) {
  try {
    await sql.query(`ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS ${col} ${type}`)
    console.log(`  OK  ADD COLUMN ${col}`)
  } catch (e) {
    console.error(`  ERR ADD COLUMN ${col}: ${e.message}`)
  }
}

// ── backfill slugs on any legacy rows without one ───────────────────────

console.log("\nBackfilling slugs on legacy rows…")
try {
  const r = await sql`
    UPDATE news_articles
       SET slug = COALESCE(
         NULLIF(slug, ''),
         trim(both '-' from regexp_replace(
           regexp_replace(lower(COALESCE(headline, 'untitled')), '[''"\`]', '', 'g'),
           '[^a-z0-9]+', '-', 'g'
         )) || '-' || substr(id, 1, 6)
       )
     WHERE slug IS NULL OR slug = ''
   RETURNING id, slug
  `
  console.log(`  Patched ${r.length} row(s)`)
} catch (e) {
  console.error(`  ERR backfill: ${e.message}`)
}

// ── UNIQUE constraint on slug ───────────────────────────────────────────

console.log("\nAdding slug UNIQUE index…")
try {
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS news_articles_slug_unique_idx
      ON news_articles (slug)
      WHERE slug IS NOT NULL
  `
  console.log("  OK  news_articles_slug_unique_idx")
} catch (e) {
  console.error(`  ERR ${e.message}`)
}

// ── scheduled_for partial index (for the cron promoter) ─────────────────

console.log("\nAdding scheduled_for partial index…")
try {
  await sql`
    CREATE INDEX IF NOT EXISTS news_articles_scheduled_for_idx
      ON news_articles (scheduled_for)
      WHERE status = 'draft' AND scheduled_for IS NOT NULL
  `
  console.log("  OK  news_articles_scheduled_for_idx")
} catch (e) {
  console.error(`  ERR ${e.message}`)
}

// ── status CHECK constraint (if missing) ────────────────────────────────

console.log("\nAdding status CHECK constraint…")
try {
  const exists = await sql`
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.news_articles'::regclass
       AND contype  = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%status%draft%'
  `
  if (exists.length === 0) {
    await sql`
      ALTER TABLE news_articles ADD CONSTRAINT news_articles_status_check
        CHECK (status IN ('draft', 'published', 'archived'))
    `
    console.log("  OK  news_articles_status_check added")
  } else {
    console.log("  ✓ status check already present")
  }
} catch (e) {
  console.error(`  ERR ${e.message}`)
}

// ── verify ──────────────────────────────────────────────────────────────

const after = await sql`
  SELECT column_name, data_type FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'news_articles'
   ORDER BY ordinal_position
`
console.log("\nFinal news_articles columns:")
for (const c of after) console.log(`  - ${c.column_name} (${c.data_type})`)

const cnt = await sql`SELECT COUNT(*) AS n FROM news_articles`
console.log(`\nnews_articles: ${cnt[0].n} row(s)`)
