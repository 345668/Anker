-- Add the LP persona to the workspace membership model.
-- Founder / VC / LP are the three first-class personas; null stays valid for
-- legacy rows (treated as "all access" by the nav filter).
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_persona_check;
ALTER TABLE memberships ADD CONSTRAINT memberships_persona_check
  CHECK (persona IN ('founder','vc','lp'));
