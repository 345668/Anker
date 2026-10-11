-- The extension reports its own version on every call so the extension page can show what is installed and whether an update is due.
-- A version string only (for example 0.11.1): no content, no identifiers.
ALTER TABLE extension_tokens ADD COLUMN IF NOT EXISTS last_version text;
