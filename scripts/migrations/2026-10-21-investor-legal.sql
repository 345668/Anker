-- Consent recorded by version (docs/architecture/73). Additive.
ALTER TABLE IF EXISTS passport_shares ADD COLUMN IF NOT EXISTS consent_version text;
ALTER TABLE investor_entities ADD COLUMN IF NOT EXISTS discoverable_version text;
ALTER TABLE fund_relationships ADD COLUMN IF NOT EXISTS statement_version text;

-- Erasure must anonymise an entity, never delete it: a fund's relationship records hang off the entity (ON DELETE CASCADE), so deleting a profile that cascaded to its
-- entities would have deleted what funds are entitled to keep. The entity's owner is now a plain marker ('erased' once anonymised); erasure removes the profile explicitly.
ALTER TABLE investor_entities DROP CONSTRAINT IF EXISTS investor_entities_user_id_fkey;
