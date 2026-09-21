-- Attribution for ai_calls.
--
-- workspace_id and actor_email were on the table from the start and written
-- null, because resolving who was calling inside lib/ai/provider.ts would have
-- meant reaching into request-scoped auth from the AI layer.
--
-- That changed: lib/assistant/context.ts now carries an AiPrincipal through an
-- AsyncLocalStorage, and provider.ts already imports it for the budget check.
-- Reading userId/orgId there costs nothing and couples nothing — the context
-- is ambient, and absent outside a wrapped request rather than an error.
--
-- actor_id, not actor_email: the principal carries a user id. Writing an id
-- into a column named for an email is the kind of small lie that makes a
-- dashboard untrustworthy later.
--
-- Attribution is PARTIAL by design. Only calls made inside withAiContext() —
-- assistant requests — carry a principal. A matching run started from a route
-- that does not wrap itself records null, and that is honest: the alternative
-- is inventing an actor for a background job.

ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS actor_id text;

-- persona distinguishes a founder's call from an LP's from platform ops, which
-- is the grouping an operator actually asks for.
ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS persona text;

CREATE INDEX IF NOT EXISTS ai_calls_actor_idx ON ai_calls (actor_id, created_at DESC);
