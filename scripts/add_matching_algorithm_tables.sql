-- Migration: Add matching algorithm configuration and pipeline action tables
-- Date: 2026-04-19

-- Algorithm configurations for multiple matching strategies
CREATE TABLE IF NOT EXISTS matching_algorithms (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) DEFAULT 'general',
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  weights JSONB DEFAULT '{}',
  thresholds JSONB DEFAULT '{}',
  features JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Match pipeline actions for accept/reject tracking
CREATE TABLE IF NOT EXISTS match_pipeline_actions (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id VARCHAR(255) NOT NULL REFERENCES investor_matches(id) ON DELETE CASCADE,
  session_id VARCHAR(255) NOT NULL REFERENCES match_sessions(id) ON DELETE CASCADE,
  user_id VARCHAR(255) REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  previous_status VARCHAR(50),
  new_status VARCHAR(50) NOT NULL,
  reason TEXT,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add algorithm columns to match_sessions if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_sessions' AND column_name = 'algorithm_id') THEN
    ALTER TABLE match_sessions ADD COLUMN algorithm_id VARCHAR(255);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_sessions' AND column_name = 'algorithm_name') THEN
    ALTER TABLE match_sessions ADD COLUMN algorithm_name VARCHAR(255);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_sessions' AND column_name = 'used_data_room_content') THEN
    ALTER TABLE match_sessions ADD COLUMN used_data_room_content BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_sessions' AND column_name = 'data_room_documents_used') THEN
    ALTER TABLE match_sessions ADD COLUMN data_room_documents_used INTEGER DEFAULT 0;
  END IF;
END $$;

-- Insert default matching algorithms
INSERT INTO matching_algorithms (id, name, display_name, description, category, is_active, is_default, weights, thresholds, features) VALUES
  ('alg_standard', 'v2-standard', 'Standard Matching', 'Balanced multi-factor scoring across all dimensions. Best for general use cases.', 'general', true, true,
   '{"industry": 0.30, "stage": 0.22, "geo": 0.15, "checkSize": 0.13, "investorType": 0.12, "teamSignal": 0.08}',
   '{"minScore": 35, "maxResults": 200, "tierChampion": 85, "tierA": 70, "tierB": 55, "tierC": 35}',
   '{"useSemanticMatching": true, "useNicheKeywords": true, "useDocumentKeywords": true, "useFeedbackLoop": true, "useDataRoomContent": true}'),
   
  ('alg_accelerated', 'v2-accelerated', 'Accelerated Matching', 'Fast mode with pre-filtered candidates. Best when startup profile is complete.', 'general', true, false,
   '{"industry": 0.35, "stage": 0.25, "geo": 0.10, "checkSize": 0.15, "investorType": 0.10, "teamSignal": 0.05}',
   '{"minScore": 40, "maxResults": 100, "tierChampion": 85, "tierA": 70, "tierB": 55, "tierC": 40}',
   '{"useSemanticMatching": false, "useNicheKeywords": true, "useDocumentKeywords": false, "useFeedbackLoop": true, "useDataRoomContent": false}'),
   
  ('alg_film', 'niche-film', 'Film & Entertainment', 'Specialized for film finance, content, and entertainment verticals. Uses 25+ film keywords.', 'film', true, false,
   '{"industry": 0.40, "stage": 0.15, "geo": 0.15, "checkSize": 0.15, "investorType": 0.10, "teamSignal": 0.05}',
   '{"minScore": 30, "maxResults": 150, "tierChampion": 80, "tierA": 65, "tierB": 50, "tierC": 30}',
   '{"useSemanticMatching": true, "useNicheKeywords": true, "useDocumentKeywords": true, "useFeedbackLoop": true, "useDataRoomContent": true}'),
   
  ('alg_realestate', 'niche-realestate', 'Real Estate', 'Optimized for real estate, proptech, and construction. Uses 30+ RE keywords.', 'realestate', true, false,
   '{"industry": 0.35, "stage": 0.15, "geo": 0.20, "checkSize": 0.15, "investorType": 0.10, "teamSignal": 0.05}',
   '{"minScore": 30, "maxResults": 150, "tierChampion": 80, "tierA": 65, "tierB": 50, "tierC": 30}',
   '{"useSemanticMatching": true, "useNicheKeywords": true, "useDocumentKeywords": true, "useFeedbackLoop": true, "useDataRoomContent": true}'),
   
  ('alg_semantic', 'enhanced-semantic', 'Semantic Deep Match', 'Heavy semantic analysis using document content and investment thesis matching.', 'general', true, false,
   '{"industry": 0.25, "stage": 0.20, "geo": 0.10, "checkSize": 0.15, "investorType": 0.10, "teamSignal": 0.05}',
   '{"minScore": 35, "maxResults": 150, "tierChampion": 85, "tierA": 70, "tierB": 55, "tierC": 35}',
   '{"useSemanticMatching": true, "useNicheKeywords": true, "useDocumentKeywords": true, "useFeedbackLoop": true, "useDataRoomContent": true}'),
   
  ('alg_dataroom', 'dataroom-enhanced', 'Data Room Enhanced', 'Prioritizes data room document analysis. Requires complete data room.', 'general', true, false,
   '{"industry": 0.20, "stage": 0.20, "geo": 0.15, "checkSize": 0.15, "investorType": 0.10, "teamSignal": 0.05}',
   '{"minScore": 30, "maxResults": 200, "tierChampion": 80, "tierA": 65, "tierB": 50, "tierC": 30}',
   '{"useSemanticMatching": true, "useNicheKeywords": true, "useDocumentKeywords": true, "useFeedbackLoop": true, "useDataRoomContent": true}')
ON CONFLICT (id) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_matching_algorithms_active ON matching_algorithms(is_active);
CREATE INDEX IF NOT EXISTS idx_matching_algorithms_category ON matching_algorithms(category);
CREATE INDEX IF NOT EXISTS idx_match_pipeline_actions_match ON match_pipeline_actions(match_id);
CREATE INDEX IF NOT EXISTS idx_match_pipeline_actions_session ON match_pipeline_actions(session_id);
CREATE INDEX IF NOT EXISTS idx_match_pipeline_actions_user ON match_pipeline_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_match_sessions_algorithm ON match_sessions(algorithm_id);
