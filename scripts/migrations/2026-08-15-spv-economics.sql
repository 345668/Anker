-- SPV economics: carry and preferred-return (hurdle) terms that drive the
-- per-SPV distribution waterfall. Additive and idempotent.
-- No semicolons inside comments (the migration runner splits on them).

ALTER TABLE spvs ADD COLUMN IF NOT EXISTS carry_pct  numeric(5,2) NOT NULL DEFAULT 20;
ALTER TABLE spvs ADD COLUMN IF NOT EXISTS hurdle_pct numeric(5,2) NOT NULL DEFAULT 0;
