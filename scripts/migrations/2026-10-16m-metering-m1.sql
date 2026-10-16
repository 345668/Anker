-- Metering M1 (docs/architecture/58): prices in a table SAIL can edit, and a cost state and owner on every AI call. Additive.
-- The prices seeded here are PLACEHOLDERS (verified = false): they exist so a call is counted instead of read as free. Correct them in SAIL, Model prices.
CREATE TABLE IF NOT EXISTS model_prices (
  model text PRIMARY KEY,
  provider text,
  price_in numeric NOT NULL CHECK (price_in >= 0),   -- USD per million input tokens (list price)
  price_out numeric NOT NULL CHECK (price_out >= 0), -- USD per million output tokens
  note text,
  verified boolean NOT NULL DEFAULT false,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO model_prices (model, provider, price_in, price_out, note, verified) VALUES
  ('mistral-small-latest', 'mistral', 0.2, 0.6, 'placeholder, check the Mistral price list', false),
  ('gpt-4o-mini', 'openai', 0.15, 0.6, 'placeholder, check the OpenAI price list', false)
ON CONFLICT (model) DO NOTHING;

ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS cost_state text CHECK (cost_state IN ('exact', 'estimated', 'unpriced', 'none'));
ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS cost_center text;

-- Backfill: price what has tokens and a known price; never touch a cost that is already there.
UPDATE ai_calls c SET cost_usd = round(((coalesce(c.prompt_tokens, 0) * p.price_in + coalesce(c.output_tokens, 0) * p.price_out) / 1000000.0)::numeric, 6)
  FROM model_prices p WHERE c.model = p.model AND c.cost_usd IS NULL AND (c.prompt_tokens IS NOT NULL OR c.output_tokens IS NOT NULL);
UPDATE ai_calls SET cost_state = CASE
    WHEN cost_usd IS NOT NULL THEN 'exact'
    WHEN provider IN ('disabled', 'rejected') OR (NOT ok AND prompt_tokens IS NULL) THEN 'none'
    ELSE 'unpriced' END
  WHERE cost_state IS NULL;
UPDATE ai_calls SET cost_center = CASE WHEN workspace_id IS NOT NULL THEN 'workspace:' || workspace_id WHEN task IS NOT NULL THEN 'platform:' || task ELSE 'unknown' END
  WHERE cost_center IS NULL;
CREATE INDEX IF NOT EXISTS ai_calls_cost_state_idx ON ai_calls (created_at DESC, cost_state);
