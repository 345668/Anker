-- Documents table for pitch decks and data room files
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  startup_id UUID REFERENCES startups(id) ON DELETE SET NULL,
  type VARCHAR(50) NOT NULL, -- 'pitch-deck' or 'data-room'
  folder VARCHAR(100) DEFAULT 'general',
  name VARCHAR(500) NOT NULL,
  blob_pathname TEXT NOT NULL,
  content_type VARCHAR(100),
  size BIGINT,
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  
  -- AI Analysis fields
  ai_analysis_status VARCHAR(50) DEFAULT 'pending', -- pending, analyzing, completed, failed
  ai_analyzed_at TIMESTAMPTZ,
  ai_score INTEGER,
  ai_feedback JSONB,
  
  -- Sharing
  is_shared BOOLEAN DEFAULT FALSE,
  share_token UUID,
  share_expires_at TIMESTAMPTZ,
  
  -- Tracking
  view_count INTEGER DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_startup ON documents(startup_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);

-- Add matching algorithm preferences to investor_matches
ALTER TABLE investor_matches 
ADD COLUMN IF NOT EXISTS algorithm VARCHAR(50) DEFAULT 'balanced',
ADD COLUMN IF NOT EXISTS match_factors JSONB,
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending', -- pending, accepted, rejected, contacted
ADD COLUMN IF NOT EXISTS user_notes TEXT,
ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Add document-based matching scores
ALTER TABLE investor_matches
ADD COLUMN IF NOT EXISTS pitch_relevance_score NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS data_room_score NUMERIC(5,2);

-- Matching algorithm configurations
CREATE TABLE IF NOT EXISTS matching_algorithms (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  weight_industry NUMERIC(3,2) DEFAULT 0.25,
  weight_stage NUMERIC(3,2) DEFAULT 0.20,
  weight_geography NUMERIC(3,2) DEFAULT 0.15,
  weight_check_size NUMERIC(3,2) DEFAULT 0.15,
  weight_investor_type NUMERIC(3,2) DEFAULT 0.10,
  weight_team_signals NUMERIC(3,2) DEFAULT 0.10,
  weight_recency NUMERIC(3,2) DEFAULT 0.05,
  weight_document_fit NUMERIC(3,2) DEFAULT 0.00,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default algorithms
INSERT INTO matching_algorithms (id, name, description, weight_industry, weight_stage, weight_geography, weight_check_size, weight_investor_type, weight_team_signals, weight_recency, weight_document_fit)
VALUES 
  ('balanced', 'Balanced', 'Equal weighting across all factors for general matching', 0.20, 0.20, 0.15, 0.15, 0.10, 0.10, 0.05, 0.05),
  ('industry-first', 'Industry Focus', 'Prioritizes investors with strong industry alignment', 0.40, 0.15, 0.10, 0.10, 0.10, 0.05, 0.05, 0.05),
  ('stage-first', 'Stage Focus', 'Prioritizes investors who invest at your stage', 0.15, 0.40, 0.10, 0.15, 0.05, 0.05, 0.05, 0.05),
  ('check-size', 'Check Size Focus', 'Optimizes for investors whose typical check matches your raise', 0.15, 0.15, 0.10, 0.40, 0.05, 0.05, 0.05, 0.05),
  ('local', 'Local Investors', 'Emphasizes geographic proximity', 0.15, 0.15, 0.40, 0.10, 0.05, 0.05, 0.05, 0.05),
  ('fund-i', 'Fund I/II Emerging', 'Optimized for emerging fund managers - thesis-driven, more accessible', 0.30, 0.25, 0.05, 0.15, 0.10, 0.10, 0.00, 0.05),
  ('fund-iii-iv', 'Fund III/IV Institutional', 'Optimized for institutional investors - metrics-focused, larger checks', 0.20, 0.20, 0.10, 0.25, 0.05, 0.05, 0.10, 0.05),
  ('venture-studio', 'Venture Studio', 'Optimized for venture studios - co-building focus', 0.35, 0.10, 0.10, 0.05, 0.15, 0.15, 0.05, 0.05)
ON CONFLICT (id) DO NOTHING;

-- Track algorithm usage and results
CREATE TABLE IF NOT EXISTS matching_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  startup_id UUID REFERENCES startups(id) ON DELETE CASCADE,
  algorithm VARCHAR(50) REFERENCES matching_algorithms(id),
  matches_generated INTEGER,
  avg_score NUMERIC(5,2),
  execution_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
