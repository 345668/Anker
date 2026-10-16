-- Metering M2 (docs/architecture/58): one place for the paid calls that are not chat completions (speech, embeddings, document reading, generated media). Additive.
-- The unit prices seeded here are PLACEHOLDERS (verified = false). Check them against the providers' price lists in SAIL, Model prices.
CREATE TABLE IF NOT EXISTS unit_prices (
  unit text PRIMARY KEY,
  price_usd numeric NOT NULL CHECK (price_usd >= 0),   -- USD per one unit
  note text,
  verified boolean NOT NULL DEFAULT false,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO unit_prices (unit, price_usd, note, verified) VALUES
  ('asr_second', 0.00003, 'speech to text, per second of audio (placeholder)', false),
  ('tts_char', 0.00001, 'text to speech, per character (placeholder)', false),
  ('embed_token', 0.00000007, 'embeddings, per token (placeholder)', false),
  ('vision_doc', 0.01, 'a document read by a vision model, per document (placeholder)', false),
  ('vision_page', 0.002, 'a page read by a vision model, per page (placeholder)', false),
  ('image', 0.04, 'one generated image (placeholder)', false),
  ('video_second', 0.1, 'one second of generated video (placeholder)', false)
ON CONFLICT (unit) DO NOTHING;

-- Append-only record of metered use. No content: a unit, a quantity, a cost and where it came from.
CREATE TABLE IF NOT EXISTS usage_events (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id text,                                  -- null for platform jobs
  cost_center text NOT NULL,                    -- workspace:<id> or platform:<source>
  unit text NOT NULL,
  qty numeric NOT NULL CHECK (qty >= 0),
  unit_cost numeric,
  cost_usd numeric,
  cost_state text NOT NULL CHECK (cost_state IN ('exact', 'estimated', 'unpriced')),
  source text NOT NULL,
  ref text
);
CREATE INDEX IF NOT EXISTS usage_events_org_month_idx ON usage_events (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_unit_idx ON usage_events (unit, created_at DESC);
