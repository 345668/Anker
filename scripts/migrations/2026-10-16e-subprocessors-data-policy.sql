-- Sub-processor register and per-workspace data policy (docs/architecture/54, slices D5 and D6). Additive.
-- The register is the single source for the public sub-processor page and for the AI router's region rules. Nothing here claims a contract term that has not been checked:
-- dpa_status and training_opt_out start as 'unverified', and a region marked 'inferred' was read from configuration, not from a contract.
CREATE TABLE IF NOT EXISTS ai_subprocessors (
  slug text PRIMARY KEY,
  provider text NOT NULL,
  role text NOT NULL CHECK (role IN ('ai_model', 'hosting', 'database', 'storage', 'email', 'payments', 'auth', 'self_hosted')),
  purpose text NOT NULL,
  -- eu, us, sg (Singapore), self (our own infrastructure), other, unknown
  region text NOT NULL DEFAULT 'unknown' CHECK (region IN ('eu', 'us', 'sg', 'self', 'other', 'unknown')),
  region_basis text NOT NULL DEFAULT 'inferred' CHECK (region_basis IN ('inferred', 'confirmed')),
  data_classes text[] NOT NULL DEFAULT '{}',
  dpa_status text NOT NULL DEFAULT 'unverified' CHECK (dpa_status IN ('unverified', 'requested', 'signed')),
  training_opt_out text NOT NULL DEFAULT 'unverified' CHECK (training_opt_out IN ('unverified', 'yes', 'no')),
  retention text,
  terms_url text,
  last_verified date,
  -- active: in use today. public: shown on the public page (an unused provider is not listed).
  active boolean NOT NULL DEFAULT true,
  public boolean NOT NULL DEFAULT true,
  notes text,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ai_subprocessors (slug, provider, role, purpose, region, region_basis, data_classes, active, public, notes) VALUES
  ('qwen', 'Alibaba Cloud (Qwen / DashScope)', 'ai_model', 'Text, document and image/video generation requested in the product, and search embeddings', 'sg', 'inferred', ARRAY['prompts','decks','documents','images'], true, true, 'The international (Singapore) endpoint is the default (doc 35).'),
  ('mistral', 'Mistral AI', 'ai_model', 'Text generation when selected or used as a fallback', 'eu', 'inferred', ARRAY['prompts','documents'], true, true, 'Key on file; the default model was archived once (2026-10-16).'),
  ('openai', 'OpenAI', 'ai_model', 'Text generation and embeddings when selected or used as a fallback', 'us', 'inferred', ARRAY['prompts','documents'], true, true, NULL),
  ('anthropic', 'Anthropic', 'ai_model', 'Text generation when a key is configured', 'us', 'inferred', ARRAY['prompts','documents'], false, false, 'No key on file in production; listed in the old policy text.'),
  ('gemini', 'Google (Gemini)', 'ai_model', 'Text generation when a key is configured', 'us', 'inferred', ARRAY['prompts','documents'], false, false, 'No key on file in production; listed in the old policy text.'),
  ('ollama', 'Self-hosted model (Ollama)', 'self_hosted', 'Text generation on infrastructure we operate', 'self', 'confirmed', ARRAY['prompts','documents'], false, false, 'Not running in production (doc 53).'),
  ('neon', 'Neon', 'database', 'Primary database', 'us', 'inferred', ARRAY['account data','workspace content','investor directory'], true, true, 'Region read from the connection host (AWS us-east-1).'),
  ('vercel', 'Vercel', 'hosting', 'Application hosting and file storage', 'us', 'inferred', ARRAY['all content processed by the application','uploaded files'], true, true, 'No region is pinned in vercel.json; the platform default applies.'),
  ('supabase', 'Supabase', 'auth', 'Sign-in and account authentication', 'unknown', 'inferred', ARRAY['account data'], true, true, NULL),
  ('resend', 'Resend', 'email', 'Sending email on behalf of the platform and its customers', 'unknown', 'inferred', ARRAY['recipient addresses','message content'], true, true, NULL),
  ('stripe', 'Stripe', 'payments', 'Billing and payment processing', 'unknown', 'inferred', ARRAY['billing details'], true, true, NULL)
ON CONFLICT (slug) DO NOTHING;

-- A workspace's choice of where its content may be sent for AI processing. 'standard' is today's behaviour.
CREATE TABLE IF NOT EXISTS workspace_data_policy (
  org_id text PRIMARY KEY,
  preset text NOT NULL DEFAULT 'standard' CHECK (preset IN ('standard', 'eu_only', 'no_external')),
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform_flags (key, enabled, rollout_pct, description)
VALUES ('ai_self_hosted_lane', false, 100, 'Doc 54 D6: a self-hosted model is running and may be offered to workspaces with the no-external-provider policy (doc 53). Off: that preset cannot be chosen.')
ON CONFLICT (key) DO NOTHING;
