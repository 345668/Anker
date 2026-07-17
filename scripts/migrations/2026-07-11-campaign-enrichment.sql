-- Enrichment fields on outreach_campaign_members.
--
-- Batched enrichment (15 profiles / LLM call) produces these fields per
-- shortlisted contact so the LP Campaign import / Outreach detail view
-- has everything needed for tailored draft generation.

alter table outreach_campaign_members add column if not exists sectors               text;
alter table outreach_campaign_members add column if not exists why_this_contact      text;
alter table outreach_campaign_members add column if not exists firm_intelligence     text;
alter table outreach_campaign_members add column if not exists investment_mandate    text;
alter table outreach_campaign_members add column if not exists personalisation_hook  text;
alter table outreach_campaign_members add column if not exists enriched_subject      text;
alter table outreach_campaign_members add column if not exists website_url           text;
alter table outreach_campaign_members add column if not exists website_title         text;
alter table outreach_campaign_members add column if not exists crawl_status          text;
alter table outreach_campaign_members add column if not exists multi_touch_note      text;
alter table outreach_campaign_members add column if not exists tags                  text;
alter table outreach_campaign_members add column if not exists enrichment_status     text;
alter table outreach_campaign_members add column if not exists enriched_at           timestamptz;
alter table outreach_campaign_members add column if not exists enrichment_batch      integer;

create index if not exists outreach_campaign_members_enrichment_idx
  on outreach_campaign_members (campaign_id, enrichment_status)
  where selected = true;
