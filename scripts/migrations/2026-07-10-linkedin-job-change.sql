-- Job-change detection: when a re-capture sees a different company/title,
-- the upsert stows the old values and stamps job_changed_at. Movers are the
-- classic re-engagement trigger.

alter table linkedin_connections add column if not exists previous_company text;
alter table linkedin_connections add column if not exists previous_title text;
alter table linkedin_connections add column if not exists job_changed_at timestamptz;
