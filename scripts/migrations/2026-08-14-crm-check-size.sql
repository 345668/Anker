-- Founder raise pipeline: track the expected/committed check size per investor
-- entry so the pipeline can aggregate soft-circled vs. committed capital.
ALTER TABLE crm_entries
  ADD COLUMN IF NOT EXISTS check_size numeric(14, 2);
