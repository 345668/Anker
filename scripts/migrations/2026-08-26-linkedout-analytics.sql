-- LinkedOut — connection-acceptance signal + analytics support.
--
-- accepted_at records when a campaign member accepted the connection request
-- (reported by the extension's invite scraper). It powers the funnel's
-- "accepted" metric and unlocks true 'if_accepted' sequence branching.

alter table li_campaign_members
  add column if not exists accepted_at timestamptz;

create index if not exists li_campaign_members_accepted_idx
  on li_campaign_members (campaign_id) where accepted_at is not null;
