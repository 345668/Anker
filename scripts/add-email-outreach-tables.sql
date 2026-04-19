-- Add email_templates table
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_email_templates_user_id ON email_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_is_default ON email_templates(is_default);

-- Add email columns to outreaches table if they don't exist
ALTER TABLE outreaches ADD COLUMN IF NOT EXISTS email_subject TEXT;
ALTER TABLE outreaches ADD COLUMN IF NOT EXISTS email_body TEXT;
ALTER TABLE outreaches ADD COLUMN IF NOT EXISTS message_id VARCHAR(255);

-- Create index on message_id for webhook tracking
CREATE INDEX IF NOT EXISTS idx_outreaches_message_id ON outreaches(message_id);

-- Insert default email templates
INSERT INTO email_templates (id, name, subject, body, is_default, created_at, updated_at)
VALUES 
  (
    gen_random_uuid(),
    'Introduction',
    '{{startup_name}} - Investment Opportunity',
    'Hi {{investor_name}},

I hope this email finds you well. My name is [Your Name], and I am the founder of {{startup_name}}.

[Brief description of your startup - 2-3 sentences]

I came across your work at {{firm_name}} and was impressed by your portfolio in [relevant sector]. I believe there could be strong alignment between our vision and your investment thesis.

Would you be open to a brief 15-minute call this week to discuss further?

Best regards,
[Your Name]
{{startup_name}}',
    TRUE,
    NOW(),
    NOW()
  ),
  (
    gen_random_uuid(),
    'Follow Up',
    'Following up: {{startup_name}}',
    'Hi {{investor_name}},

I wanted to follow up on my previous email about {{startup_name}}.

Since we last spoke, we have achieved [mention recent milestone or traction].

I would love the opportunity to share more about our progress. Would you have 15 minutes this week for a quick call?

Best regards,
[Your Name]',
    TRUE,
    NOW(),
    NOW()
  ),
  (
    gen_random_uuid(),
    'Warm Introduction',
    'Intro from [Mutual Connection] - {{startup_name}}',
    'Hi {{investor_name}},

[Mutual Connection] suggested I reach out to you regarding {{startup_name}}.

[Brief 2-sentence description of your startup]

Given your focus on [their investment focus], I thought you might be interested in learning more about what we are building.

Would you be available for a brief call next week?

Best regards,
[Your Name]
{{startup_name}}',
    TRUE,
    NOW(),
    NOW()
  )
ON CONFLICT DO NOTHING;
