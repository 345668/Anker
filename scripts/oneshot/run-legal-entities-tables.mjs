/**
 * Patch — create legal_entities + legal_documents tables.
 *
 * legal_entities (one row per entity in a fund):
 *   id          uuid PK
 *   fund_id     uuid not null
 *   kind        text not null  CHECK (management_company | general_partner | fund)
 *   name        text not null  (legal entity name, e.g. "X Fund II GP, LLC")
 *   slug        text not null  (URL slug within the fund)
 *   status      text default 'draft'  (draft | filed | dissolved)
 *   metadata    jsonb default '{}'
 *   created_at  timestamptz default NOW()
 *   updated_at  timestamptz default NOW()
 *
 * legal_documents (one row per doc per fund):
 *   id              uuid PK
 *   fund_id         uuid not null
 *   entity_id       uuid not null (FK in spirit — no enforced FK per repo convention)
 *   doc_key         text not null  (matches lib/portfolio/legal-catalogue.ts)
 *   title           text not null
 *   short_title     text not null
 *   status          text default 'draft'  (draft | pending_review | reviewed | approved | filed)
 *   completion_pct  numeric default 0      (0..1)
 *   body_md         text                   (template substituted; null until phase 6)
 *   review_notes    text
 *   created_at      timestamptz default NOW()
 *   updated_at      timestamptz default NOW()
 *
 * Idempotent. Run from your Mac:
 *   NEON_DATABASE_URL='...' node scripts/oneshot/run-legal-entities-tables.mjs
 */

const { neon } = await import("@neondatabase/serverless")
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

console.log("Creating legal_entities table…")
try {
  await sql`
    CREATE TABLE IF NOT EXISTS legal_entities (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      fund_id     UUID NOT NULL,
      kind        TEXT NOT NULL,
      name        TEXT NOT NULL,
      slug        TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'draft',
      metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT  legal_entities_kind_check
        CHECK (kind IN ('management_company','general_partner','fund')),
      CONSTRAINT  legal_entities_status_check
        CHECK (status IN ('draft','filed','dissolved'))
    )
  `
  console.log("  OK  legal_entities")
} catch (e) { console.error(`  ERR ${e.message}`); process.exit(1) }

console.log("Creating legal_documents table…")
try {
  await sql`
    CREATE TABLE IF NOT EXISTS legal_documents (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      fund_id         UUID NOT NULL,
      entity_id       UUID NOT NULL,
      doc_key         TEXT NOT NULL,
      title           TEXT NOT NULL,
      short_title     TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'draft',
      completion_pct  NUMERIC NOT NULL DEFAULT 0,
      body_md         TEXT,
      review_notes    TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT      legal_documents_status_check
        CHECK (status IN ('draft','pending_review','reviewed','approved','filed'))
    )
  `
  console.log("  OK  legal_documents")
} catch (e) { console.error(`  ERR ${e.message}`); process.exit(1) }

console.log("\nIndexes…")
try {
  await sql`CREATE INDEX IF NOT EXISTS legal_entities_fund_idx ON legal_entities (fund_id, kind)`
  console.log("  OK  legal_entities_fund_idx")
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS legal_entities_slug_unique_idx ON legal_entities (fund_id, slug)`
  console.log("  OK  legal_entities_slug_unique_idx")
  await sql`CREATE INDEX IF NOT EXISTS legal_documents_fund_idx ON legal_documents (fund_id, entity_id)`
  console.log("  OK  legal_documents_fund_idx")
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS legal_documents_key_unique_idx ON legal_documents (fund_id, doc_key)`
  console.log("  OK  legal_documents_key_unique_idx")
} catch (e) { console.error(`  ERR ${e.message}`) }

const ec = await sql`SELECT COUNT(*) AS n FROM legal_entities`
const dc = await sql`SELECT COUNT(*) AS n FROM legal_documents`
console.log(`\nlegal_entities: ${ec[0].n} row(s)`)
console.log(`legal_documents: ${dc[0].n} row(s)`)
console.log("\nDone. The /dashboard/portfolio/fund/legal canvas will auto-seed 3 entities + 13 docs on first visit.")
