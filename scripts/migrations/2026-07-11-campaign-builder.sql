-- Campaign builder — scoring + shortlist + email quality columns.
--
-- Adds the columns the wizard reads/writes on top of the existing
-- outreach_campaign_members table. All nullable so existing rows
-- (from the current CRM → Outreach flow) survive untouched.
--
-- New columns:
--   score              — raw score from the IP-topic scoring model
--   tier               — 't1' | 't2' | 't3' when included in the shortlist
--   lp_type            — 'family_office' | 'hnw_angel' | 'mfo_ifo' | 'vc' | 'other'
--   sources            — where this contact came from (array)
--   selected           — was this row picked for the shortlist send
--   email              — cached email (may differ from crm_entries.display_email)
--   email_status       — result of the local verification pipeline
--   email_quality_reason — human-readable "why we set this status"
--   contact_type       — 'cold' | 'warm' | 'follow-up' | 'reengage' — used by
--                        the draft-generation step to pick opener variant
--   score_details      — JSONB of individual factors so users can see WHY
--                        this contact scored what it did (audit / trust)

alter table outreach_campaign_members add column if not exists score numeric;
alter table outreach_campaign_members add column if not exists tier text;
alter table outreach_campaign_members add column if not exists lp_type text;
alter table outreach_campaign_members add column if not exists sources text[];
alter table outreach_campaign_members add column if not exists selected boolean not null default false;
alter table outreach_campaign_members add column if not exists email text;
alter table outreach_campaign_members add column if not exists email_status text;
alter table outreach_campaign_members add column if not exists email_quality_reason text;
alter table outreach_campaign_members add column if not exists contact_type text;
alter table outreach_campaign_members add column if not exists score_details jsonb;

create index if not exists outreach_campaign_members_selected_idx
  on outreach_campaign_members (campaign_id, selected)
  where selected = true;

create index if not exists outreach_campaign_members_tier_idx
  on outreach_campaign_members (campaign_id, tier)
  where tier is not null;

-- Also extend outreach_campaigns with an event context — the wizard
-- creates campaigns anchored on a specific event (webinar, dinner, etc.).
-- Nullable so existing campaigns are unaffected.
alter table outreach_campaigns add column if not exists event_slug text;
alter table outreach_campaigns add column if not exists event_date date;
alter table outreach_campaigns add column if not exists event_url text;
alter table outreach_campaigns add column if not exists event_topic text;
alter table outreach_campaigns add column if not exists cc_addresses text[];
alter table outreach_campaigns add column if not exists bcc_addresses text[];
alter table outreach_campaigns add column if not exists shortlist_config jsonb;
