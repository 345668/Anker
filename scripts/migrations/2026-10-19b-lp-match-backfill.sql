-- The v1 default for these two columns was 0, not NULL, so the backfill in 2026-10-19-lp-match-workspace.sql left v2 runs at 0 and the raise path still saw them as empty.
UPDATE lp_match_sessions SET
  total_firms_matched = qualified_firms,
  total_contacts_matched = qualified_contacts
  WHERE engine_version = 'v2' AND COALESCE(total_firms_matched, 0) = 0 AND COALESCE(total_contacts_matched, 0) = 0
    AND (COALESCE(qualified_firms, 0) > 0 OR COALESCE(qualified_contacts, 0) > 0);
