-- Directory source and licence register (docs/architecture/54, slice D1). One row per `source` value used in investors / investment_firms.
-- Additive. Existing sources are backfilled as 'unreviewed' with NO invented licence; the vendor sample is recorded as restricted.
CREATE TABLE IF NOT EXISTS directory_sources (
  source text PRIMARY KEY,
  label text,
  kind text NOT NULL DEFAULT 'unknown' CHECK (kind IN ('vendor_purchase','partner_list','customer_upload','public_web','webinar_signup','seed','crm_sync','unknown')),
  acquired_at date,
  supplier text,
  licence_summary text,
  permitted_use text[] NOT NULL DEFAULT '{}',
  forbidden_use text,
  lawful_basis_note text,
  notice_status text NOT NULL DEFAULT 'pending' CHECK (notice_status IN ('not_required','pending','sent')),
  status text NOT NULL DEFAULT 'unreviewed' CHECK (status IN ('recorded','unreviewed','restricted','withdrawn')),
  evidence_ref text,
  reviewed_by text,
  reviewed_at timestamptz,
  withdrawn_at timestamptz,
  withdraw_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (permitted_use <@ ARRAY['internal_matching','outreach_email','outreach_linkedin','display_to_customers','resale']::text[])
);

INSERT INTO directory_sources (source, label)
SELECT s, s FROM (
  SELECT COALESCE(NULLIF(TRIM(source), ''), 'unknown') AS s FROM investors
  UNION SELECT COALESCE(NULLIF(TRIM(source), ''), 'unknown') FROM investment_firms
) x ON CONFLICT (source) DO NOTHING;

-- Internal matching is the baseline for an unreviewed source (the gate enforces it); nothing else is granted by the backfill.
UPDATE directory_sources SET permitted_use = ARRAY['internal_matching'] WHERE status = 'unreviewed' AND cardinality(permitted_use) = 0;

INSERT INTO directory_sources (source, label, kind, acquired_at, licence_summary, permitted_use, forbidden_use, status, reviewed_by, reviewed_at)
VALUES ('drop:2026-10-13', 'Vendor free sample: 40 active family offices (October 2026)', 'vendor_purchase', DATE '2026-10-13',
        'Free sample; the supplier''s terms limit it to internal use.', ARRAY['internal_matching'],
        'No outreach through Anker, no display to customers, no resale, until counsel confirms the terms (doc 54 section 12, question 4).', 'restricted', 'system:doc54', now())
ON CONFLICT (source) DO UPDATE SET kind = EXCLUDED.kind, acquired_at = EXCLUDED.acquired_at, licence_summary = EXCLUDED.licence_summary,
  permitted_use = EXCLUDED.permitted_use, forbidden_use = EXCLUDED.forbidden_use, status = 'restricted', reviewed_by = EXCLUDED.reviewed_by, reviewed_at = now(), updated_at = now();

INSERT INTO platform_flags (key, enabled, rollout_pct, description)
VALUES ('directory_use_gate', false, 100, 'Doc 54 D1: enforce the directory use gate for unreviewed sources. Off = warn only (audit entry). Restricted and withdrawn sources are always enforced.')
ON CONFLICT (key) DO NOTHING;
