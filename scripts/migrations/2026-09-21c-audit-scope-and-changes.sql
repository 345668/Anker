-- Make audit_events answer "what was it before", for whom.
--
-- The table had no tenant scope, so its only reader was the platform-owner
-- feed: a founder could not see the history of their own cap table. And its
-- metadata was ad hoc per caller — the one equity caller recorded the NEW
-- status and not the old one, which cannot answer the question an audit trail
-- exists for.
--
-- scope_key  the boundary the writing module already uses:
--            'company:<id>' | 'fund:<id>' | 'org:<id>'. Same convention as the
--            persona scope key (docs/architecture/00-persona-isolation.md), so
--            these map onto it when it lands rather than being re-keyed.
-- changes    { before, after, diff } — full row snapshots. Recovers a deleted
--            row from the `before` of its delete event, which is why this
--            design needs no per-entity history tables.
--
-- Additive and nullable: the six existing logAudit() callers keep working and
-- their rows simply carry no scope. See docs/architecture/08.

ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS scope_key text;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS changes   jsonb;

-- A tenant's own trail, newest first. Partial: unscoped rows (the owner feed)
-- never need this index.
CREATE INDEX IF NOT EXISTS audit_events_scope_idx
  ON audit_events (scope_key, created_at DESC)
  WHERE scope_key IS NOT NULL;
