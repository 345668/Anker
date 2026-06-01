-- Cache structured LinkedIn profile snippets on each crm_entries row.
--
-- Populated by /api/agents/linkedin/ingest when a user pipes HTML
-- captured from their authenticated Chrome session (via the Claude in
-- Chrome extension) into the Anker server.  Stored as JSONB so the
-- shape can evolve without further migrations.
--
-- Shape (see lib/agents/linkedin-public.ts LinkedInPublicSnippet):
--   {
--     url, finalUrl, ok, status, fetchedAt, loginWall,
--     displayLabel, fullName, headline, description, bodyText, notes[],
--     extracted: {
--       fullName, title, firm, location, summary, pastFirms[], confidence
--     },
--     source: "chrome-extension" | "bot-fetch" | "manual"
--   }
ALTER TABLE crm_entries
  ADD COLUMN IF NOT EXISTS linkedin_data JSONB,
  ADD COLUMN IF NOT EXISTS linkedin_data_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS crm_entries_linkedin_data_idx
  ON crm_entries (user_id, linkedin_data_at DESC NULLS LAST)
  WHERE linkedin_data IS NOT NULL;
