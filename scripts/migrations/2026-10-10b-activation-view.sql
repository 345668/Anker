-- Activation (docs/architecture/37 section 12, doc 50): how far each workspace has got through the loop, derived from the records the product already writes.
-- A view, not a new write path: it is retroactive, cannot drift from the data, and adds nothing to the tenant registry. Counts and times only, never content.
CREATE OR REPLACE VIEW activation_by_workspace AS
SELECT
  o.id AS org_id, o.name, o.kind, o.created_at AS workspace_created_at,
  c.first_at AS first_contact_at, COALESCE(c.n, 0) AS contacts,
  m.drafted_at AS first_draft_at, m.sent_at AS first_message_sent_at,
  a.first_at AS first_authorization_at,
  s.first_at AS first_send_at, COALESCE(s.n, 0) AS items_sent,
  r.first_at AS first_reply_at,
  p.first_at AS first_proposal_decided_at, COALESCE(p.n, 0) AS proposals_decided,
  g.first_at AS first_agent_run_at, COALESCE(g.n, 0) AS agent_runs,
  GREATEST(o.created_at, c.last_at, m.last_at, a.last_at, s.last_at, r.last_at, p.last_at, g.last_at) AS last_activity_at,
  CASE
    WHEN r.first_at IS NOT NULL THEN 'reply_received'
    WHEN s.first_at IS NOT NULL OR m.sent_at IS NOT NULL THEN 'email_sent'
    WHEN a.first_at IS NOT NULL THEN 'send_authorized'
    WHEN m.drafted_at IS NOT NULL THEN 'outreach_drafted'
    WHEN c.first_at IS NOT NULL THEN 'contacts_added'
    ELSE 'workspace_created'
  END AS furthest
FROM organizations o
LEFT JOIN LATERAL (SELECT min(added_at) AS first_at, max(added_at) AS last_at, count(*) AS n FROM crm_entries WHERE org_id = o.id) c ON true
LEFT JOIN LATERAL (SELECT min(x.created_at) AS drafted_at, max(x.created_at) AS last_at,
    min(x.sent_at) FILTER (WHERE x.status IN ('sent','delivered','replied','accepted')) AS sent_at
  FROM outreach_messages x JOIN crm_entries e ON e.id = x.crm_entry_id WHERE e.org_id = o.id) m ON true
LEFT JOIN LATERAL (SELECT min(approved_at) AS first_at, max(approved_at) AS last_at FROM send_authorizations WHERE org_id = o.id) a ON true
LEFT JOIN LATERAL (SELECT min(sent_at) AS first_at, max(sent_at) AS last_at, count(*) AS n FROM send_items WHERE org_id = o.id AND status = 'sent') s ON true
LEFT JOIN LATERAL (SELECT min(COALESCE(x.received_at, x.created_at)) AS first_at, max(COALESCE(x.received_at, x.created_at)) AS last_at
  FROM outreach_replies x JOIN crm_entries e ON e.id = x.crm_entry_id WHERE e.org_id = o.id) r ON true
LEFT JOIN LATERAL (SELECT min(decided_at) AS first_at, max(decided_at) AS last_at, count(*) AS n FROM action_proposals WHERE org_id = o.id AND decided_at IS NOT NULL AND status IN ('approved','applied','undone','rejected')) p ON true
LEFT JOIN LATERAL (SELECT min(finished_at) AS first_at, max(finished_at) AS last_at, count(*) AS n FROM agent_executions WHERE org_id = o.id AND status = 'completed') g ON true
WHERE o.archived_at IS NULL;
