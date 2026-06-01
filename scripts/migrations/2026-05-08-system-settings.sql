-- system_settings: a generic admin-toggleable key/value store.
--
-- Currently used by the AI router for per-task on/off + model
-- overrides, but reserved for any future admin config that wants
-- a runtime knob without a redeploy.

CREATE TABLE IF NOT EXISTS system_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the AI-router knob with empty defaults — every admin override
-- lives under this key.  Shape:
--   {
--     enabled: { [task]: boolean },              // default true
--     modelOverride: { [task]: "model:tag" },    // default empty
--     providerOverride: "anthropic" | "ollama" | "none" | null,
--   }
INSERT INTO system_settings (key, value, description)
  VALUES (
    'ai_router_v1',
    '{"enabled": {}, "modelOverride": {}, "providerOverride": null}'::jsonb,
    'Per-task AI router config (see lib/ai/runtime-config.ts).  Admin-managed via /dashboard/admin/ai-config.'
  )
  ON CONFLICT (key) DO NOTHING;
