-- LinkedIn connection profiles: editable summary + notes. (Applied to Neon
-- 2026-07-10.)
--
-- summary : the profile "about" text (AI-extracted on profile capture, or
--           hand-edited on the platform)
-- notes   : free-form GP notes, platform-only

alter table linkedin_connections add column if not exists summary text;
alter table linkedin_connections add column if not exists notes text;
