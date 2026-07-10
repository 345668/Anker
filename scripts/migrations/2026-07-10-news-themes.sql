-- Dynamic thematic focus for the newsroom.
--
-- Themes are admin-managed editorial lenses: each carries keywords that
-- (a) ground AI drafting in matching news_source_items and (b) steer the
-- fetch/drafting focus without code changes. Seeded with the house themes.

create table if not exists news_themes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  description text,
  keywords    text[] not null default '{}',
  enabled     boolean not null default true,
  position    int,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

insert into news_themes (name, slug, description, keywords, position)
values
  ('Venture Capital',   'venture-capital',  'Fund launches, LP commitments, emerging managers', array['venture capital','vc fund','emerging manager','fund launch','LP commitment'], 1),
  ('Family Offices',    'family-offices',   'Family office allocations and direct investing',   array['family office','single family office','wealth management','direct investment'], 2),
  ('Climate & Energy',  'climate-energy',   'Climate tech, energy transition, green capital',   array['climate tech','energy transition','decarbonization','green hydrogen','cleantech'], 3),
  ('AI Infrastructure', 'ai-infrastructure','AI compute, models, and the capital behind them',  array['artificial intelligence','ai infrastructure','data center','gpu','foundation model'], 4),
  ('Secondaries & Liquidity', 'secondaries','Secondary sales, continuation funds, GP-led deals', array['secondaries','continuation fund','gp-led','tender offer','liquidity'], 5)
on conflict (slug) do nothing;
