-- LinkedOut — workspace sharing for lead lists.
--
-- A lead list can be shared with an org (workspace): every member of that org
-- sees it and can enroll it into their own campaigns. Writes (rename, add,
-- delete, re-share) stay with the owner. Sender sharing is intentionally NOT
-- included — senders execute in the owner's own browser session.

alter table li_lead_lists
  add column if not exists shared_org_id text;

create index if not exists li_lead_lists_shared_idx
  on li_lead_lists (shared_org_id) where shared_org_id is not null;
