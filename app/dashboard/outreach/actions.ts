"use server"

import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"
import { revalidatePath } from "next/cache"

// SendGrid email sending
export async function sendOutreachEmailAction(data: {
  to: string
  toName: string
  subject: string
  body: string
  outreachId?: string
}): Promise<{ success: boolean; error?: string; messageId?: string }> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false, error: "Unauthorized" }
  }

  // Get user's SendGrid API key from settings
  // In production, this would be stored encrypted in the database
  // For now, we'll check if it's set as an environment variable
  const sendGridKey = process.env.SENDGRID_API_KEY
  const senderEmail = process.env.SENDGRID_SENDER_EMAIL || user.email
  const senderName = process.env.SENDGRID_SENDER_NAME || user.user_metadata?.first_name || 'Anker AI'

  if (!sendGridKey) {
    return { success: false, error: "SendGrid API key not configured. Please add it in Settings." }
  }

  // Get startup info for personalization
  const startups = await sql`SELECT name FROM startups WHERE founder_id = ${user.id} LIMIT 1`
  const startupName = startups[0]?.name || 'Our Startup'

  // Replace personalization variables
  let personalizedSubject = data.subject
    .replace(/\{\{investor_name\}\}/g, data.toName)
    .replace(/\{\{startup_name\}\}/g, startupName)

  let personalizedBody = data.body
    .replace(/\{\{investor_name\}\}/g, data.toName)
    .replace(/\{\{startup_name\}\}/g, startupName)

  try {
    // Send via SendGrid API
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sendGridKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: data.to, name: data.toName }],
          subject: personalizedSubject,
        }],
        from: {
          email: senderEmail,
          name: senderName,
        },
        content: [{
          type: 'text/plain',
          value: personalizedBody,
        }],
        tracking_settings: {
          open_tracking: { enable: true },
          click_tracking: { enable: true },
        },
      }),
    })

    if (!response.ok) {
      const errorData = await response.text()
      console.error('SendGrid error:', errorData)
      return { success: false, error: `Failed to send email: ${response.status}` }
    }

    const messageId = response.headers.get('x-message-id') || crypto.randomUUID()

    // Update outreach record if provided
    if (data.outreachId) {
      await sql`
        UPDATE outreaches 
        SET sent_at = NOW(), 
            stage = 'sent', 
            email_subject = ${personalizedSubject},
            email_body = ${personalizedBody},
            message_id = ${messageId},
            updated_at = NOW()
        WHERE id = ${data.outreachId}
      `
    }

    revalidatePath('/dashboard/outreach')
    revalidatePath('/dashboard/crm')

    return { success: true, messageId }
  } catch (error) {
    console.error('Email send error:', error)
    return { success: false, error: 'Failed to send email. Please check your SendGrid configuration.' }
  }
}

// Generate email with AI (OpenAI/Mistral)
export async function generateEmailWithAIAction(data: {
  startupName: string
  startupDescription: string
  investorName: string
  firmName: string
  senderName: string
}): Promise<{ success: boolean; email?: { subject: string; body: string }; error?: string }> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false, error: "Unauthorized" }
  }

  // Try to use OpenAI or Mistral
  const openAIKey = process.env.OPENAI_API_KEY
  const mistralKey = process.env.MISTRAL_API_KEY

  const prompt = `Generate a professional, personalized cold outreach email from a startup founder to a venture capital investor.

Startup Details:
- Name: ${data.startupName}
- Description: ${data.startupDescription || 'A promising startup'}

Recipient:
- Investor Name: ${data.investorName || 'the investor'}
- Firm: ${data.firmName || 'their firm'}

Sender: ${data.senderName}

Requirements:
1. Keep it concise (under 150 words)
2. Be professional but personable
3. Highlight what makes the startup unique
4. Include a clear call to action (meeting request)
5. Don't be overly salesy

Return ONLY a JSON object with "subject" and "body" fields, no markdown or explanation.`

  try {
    if (openAIKey) {
      // Use OpenAI
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are an expert at writing investor outreach emails. Return only valid JSON.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
        }),
      })

      if (!response.ok) {
        throw new Error('OpenAI API error')
      }

      const result = await response.json()
      const content = result.choices[0]?.message?.content || ''
      
      // Parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const email = JSON.parse(jsonMatch[0])
        return { success: true, email }
      }
    } else if (mistralKey) {
      // Use Mistral
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mistralKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'mistral-small-latest',
          messages: [
            { role: 'system', content: 'You are an expert at writing investor outreach emails. Return only valid JSON.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
        }),
      })

      if (!response.ok) {
        throw new Error('Mistral API error')
      }

      const result = await response.json()
      const content = result.choices[0]?.message?.content || ''
      
      // Parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const email = JSON.parse(jsonMatch[0])
        return { success: true, email }
      }
    } else {
      // No AI key configured - return template
      return {
        success: true,
        email: {
          subject: `${data.startupName} - Investment Opportunity`,
          body: `Hi ${data.investorName || '{{investor_name}}'},

I'm ${data.senderName}, founder of ${data.startupName}.

${data.startupDescription || 'We are building something exciting in our space.'}

I noticed your portfolio at ${data.firmName || '{{firm_name}}'} and believe there could be great synergy between our vision and your investment thesis.

Would you be open to a brief 15-minute call this week to discuss?

Best regards,
${data.senderName}
${data.startupName}`
        }
      }
    }

    return { success: false, error: 'Failed to generate email' }
  } catch (error) {
    console.error('AI generation error:', error)
    return { success: false, error: 'Failed to generate email with AI' }
  }
}

// Save email template
export async function saveEmailTemplateAction(data: {
  name: string
  subject: string
  body: string
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    const id = crypto.randomUUID()
    await sql`
      INSERT INTO email_templates (id, user_id, name, subject, body, created_at, updated_at)
      VALUES (${id}, ${user.id}, ${data.name}, ${data.subject}, ${data.body}, NOW(), NOW())
    `
    
    revalidatePath('/dashboard/outreach')
    return { success: true }
  } catch (error) {
    console.error('Save template error:', error)
    return { success: false, error: 'Failed to save template' }
  }
}

// Bulk send emails
export async function sendBulkOutreachAction(outreachIds: string[]): Promise<{ 
  success: boolean
  sent: number
  failed: number
  errors?: string[]
}> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false, sent: 0, failed: outreachIds.length, errors: ["Unauthorized"] }
  }

  let sent = 0
  let failed = 0
  const errors: string[] = []

  for (const outreachId of outreachIds) {
    // Get outreach details
    const outreaches = await sql`
      SELECT o.*, i.email, CONCAT(i.first_name, ' ', i.last_name) as investor_name
      FROM outreaches o
      LEFT JOIN investors i ON o.investor_id = i.id
      WHERE o.id = ${outreachId}
    `
    const outreach = outreaches[0]

    if (!outreach?.email) {
      failed++
      errors.push(`No email for outreach ${outreachId}`)
      continue
    }

    // For bulk sending, we'd use a default template
    const result = await sendOutreachEmailAction({
      to: outreach.email,
      toName: outreach.investor_name || 'Investor',
      subject: outreach.email_subject || 'Investment Opportunity',
      body: outreach.email_body || 'Default email body',
      outreachId,
    })

    if (result.success) {
      sent++
    } else {
      failed++
      errors.push(result.error || 'Unknown error')
    }

    // Rate limit - wait 100ms between sends
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  return { success: failed === 0, sent, failed, errors: errors.length > 0 ? errors : undefined }
}

// Track email opens (webhook endpoint would call this)
export async function trackEmailOpenAction(messageId: string): Promise<void> {
  await sql`
    UPDATE outreaches 
    SET opened_at = COALESCE(opened_at, NOW()), 
        stage = CASE WHEN stage = 'sent' THEN 'opened' ELSE stage END,
        updated_at = NOW()
    WHERE message_id = ${messageId}
  `
}

// Track email replies
export async function markEmailRepliedAction(outreachId: string): Promise<{ success: boolean }> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false }
  }

  await sql`
    UPDATE outreaches 
    SET replied_at = NOW(), 
        stage = 'replied',
        updated_at = NOW()
    WHERE id = ${outreachId}
  `

  revalidatePath('/dashboard/outreach')
  revalidatePath('/dashboard/crm')

  return { success: true }
}
