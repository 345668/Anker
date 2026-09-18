-- Make fetched news storable, so drafting can actually be grounded in it.
--
-- news_source_items is read by the newsroom drafting endpoint to ground an
-- article in reported facts, but nothing in either app has written to it since
-- the original ingestion pipeline was removed: the newest row is 2026-01-21.
-- Every "ground from news" retrieval filters to the last 45 days, so it has
-- been returning zero rows and silently drafting ungrounded articles.
--
-- Fetching already works (eight providers, keys managed in the portal). It was
-- fetch-and-forget: results were rendered and dropped. Persisting them is what
-- closes the loop.
--
-- Dedupe is by source_url. The same story surfaces from several providers at
-- once (Marketaux and Finnhub routinely carry the same wire item), and a
-- grounding block that lists one story three times spends the model's context
-- on repetition. Verified before adding: 0 duplicate URLs across the 441
-- existing rows, so this index builds cleanly.
CREATE UNIQUE INDEX IF NOT EXISTS news_source_items_source_url_idx
  ON news_source_items (source_url);

-- Retrieval is always "recent items matching these words, best first".
CREATE INDEX IF NOT EXISTS news_source_items_recent_idx
  ON news_source_items (published_at DESC NULLS LAST);

-- Providers are registered in news_sources (source_id is NOT NULL with an FK),
-- so an ingest needs a row per provider to attach items to. These ids are
-- deterministic: re-running must not create a second "Finnhub".
INSERT INTO news_sources (id, name, type, url, category, tier, is_active, is_enabled)
VALUES
  ('prov-alpha-vantage', 'Alpha Vantage',   'api', 'https://www.alphavantage.co',      'tier1_media', 'tier1', true, true),
  ('prov-finnhub',       'Finnhub',         'api', 'https://finnhub.io',               'tier1_media', 'tier1', true, true),
  ('prov-marketaux',     'Marketaux',       'api', 'https://www.marketaux.com',        'tier1_media', 'tier1', true, true),
  ('prov-newsapi',       'NewsAPI',         'api', 'https://newsapi.org',              'tier1_media', 'tier2', true, true),
  ('prov-fred',          'FRED',            'api', 'https://fred.stlouisfed.org',      'macro',       'tier1', true, true),
  ('prov-massive',       'Massive',         'api', 'https://massive.app',              'tier1_media', 'tier2', true, true),
  ('prov-sec-edgar',     'SEC EDGAR',       'api', 'https://www.sec.gov/edgar',        'regulatory',  'tier1', true, true),
  ('prov-hacker-news',   'Hacker News',     'api', 'https://news.ycombinator.com',     'community',   'tier3', true, true)
ON CONFLICT (id) DO NOTHING;
