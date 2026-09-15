-- Read-only preflight. Run before the September 13 workspace migrations.
-- Requires the prior CRM, fundraising and organization migrations.
-- Every returned row needs review before release. No rows means these checks passed;
-- it does not validate authentication, provider configuration or database grants.
WITH issues AS (
  SELECT 'canonical_owner_missing_or_inconsistent' AS issue, o.id AS record_id
  FROM organizations o
  WHERE NOT EXISTS (
    SELECT 1 FROM memberships m WHERE m.org_id=o.id AND m.user_id=o.owner_user_id
      AND m.org_role='workspace_owner'
      AND m.persona=(CASE WHEN o.kind='company' THEN 'founder' ELSE 'vc' END)
  )
  UNION ALL
  SELECT 'additional_workspace_owner', m.org_id || ':' || m.user_id
  FROM memberships m JOIN organizations o ON o.id=m.org_id
  WHERE m.org_role='workspace_owner' AND m.user_id IS DISTINCT FROM o.owner_user_id
  UNION ALL
  SELECT 'round_board_missing', r.id
  FROM fundraising_rounds r LEFT JOIN crm_boards b ON b.id=r.board_id WHERE b.id IS NULL
  UNION ALL
  SELECT 'board_linked_to_multiple_workspaces', board_id
  FROM fundraising_rounds GROUP BY board_id HAVING count(DISTINCT org_id)>1
  UNION ALL
  SELECT 'multiple_rounds_for_one_workspace_board', org_id || ':' || board_id
  FROM fundraising_rounds GROUP BY org_id,board_id HAVING count(*)>1
  UNION ALL
  SELECT 'round_board_workspace_mismatch', r.id
  FROM fundraising_rounds r JOIN crm_boards b ON b.id=r.board_id
  WHERE to_jsonb(b)->>'org_id' IS NOT NULL AND to_jsonb(b)->>'org_id'<>r.org_id
  UNION ALL
  SELECT 'legacy_board_has_other_creators_or_assigned_contacts', b.id
  FROM crm_boards b
  WHERE to_jsonb(b)->>'org_id' IS NULL AND EXISTS (
    SELECT 1 FROM crm_entries e WHERE e.board_id=b.id
      AND (e.user_id IS DISTINCT FROM b.user_id OR to_jsonb(e)->>'org_id' IS NOT NULL)
  )
  UNION ALL
  SELECT 'legacy_contact_has_other_creators_or_assigned_tasks', e.id
  FROM crm_entries e
  WHERE to_jsonb(e)->>'org_id' IS NULL AND EXISTS (
    SELECT 1 FROM crm_tasks t WHERE t.crm_entry_id=e.id
      AND (t.user_id IS DISTINCT FROM e.user_id OR to_jsonb(t)->>'org_id' IS NOT NULL)
  )
  UNION ALL
  SELECT 'contact_board_workspace_mismatch', e.id
  FROM crm_entries e JOIN crm_boards b ON b.id=e.board_id
  WHERE to_jsonb(e)->>'org_id' IS DISTINCT FROM to_jsonb(b)->>'org_id'
  UNION ALL
  SELECT 'task_contact_workspace_mismatch', t.id::text
  FROM crm_tasks t JOIN crm_entries e ON e.id=t.crm_entry_id
  WHERE to_jsonb(t)->>'org_id' IS DISTINCT FROM to_jsonb(e)->>'org_id'
  UNION ALL
  SELECT 'duplicate_workspace_import_session', coalesce(to_jsonb(b)->>'org_id',k.org_id) || ':' || b.source_session_id
  FROM crm_boards b LEFT JOIN (
    SELECT board_id,min(org_id) org_id FROM fundraising_rounds
    GROUP BY board_id HAVING count(DISTINCT org_id)=1
  ) k ON k.board_id=b.id
  WHERE b.source_session_id IS NOT NULL AND coalesce(to_jsonb(b)->>'org_id',k.org_id) IS NOT NULL
  GROUP BY coalesce(to_jsonb(b)->>'org_id',k.org_id),b.source_session_id HAVING count(*)>1
  UNION ALL
  SELECT 'duplicate_sender_contact_draft', user_id || ':' || crm_entry_id || ':' || kind
  FROM outreach_messages GROUP BY user_id,crm_entry_id,kind HAVING count(*)>1
)
SELECT issue,record_id FROM issues ORDER BY issue,record_id;
