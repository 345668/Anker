"use server"

import { sql } from "@/lib/db"

const NOTIFICATION_EMAILS = [
  "masindetphilippe@gmail.com",
  "vc@philippemasindet.com"
]

export async function submitContactForm(formData: {
  name: string
  email: string
  company?: string
  inquiryType: string
  message: string
}): Promise<{ success: boolean; message: string }> {
  
  if (!formData.name || !formData.email || !formData.inquiryType || !formData.message) {
    return { success: false, message: "Please fill in all required fields" }
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(formData.email)) {
    return { success: false, message: "Please enter a valid email address" }
  }

  try {
    // Store in database
    try {
      await sql`
        INSERT INTO contact_submissions (name, email, company, inquiry_type, message, status, created_at)
        VALUES (${formData.name}, ${formData.email}, ${formData.company || null}, ${formData.inquiryType}, ${formData.message}, 'pending', NOW())
      `
    } catch (dbError) {
      // If contact_submissions table doesn't exist, try outreaches table as fallback
      console.error("contact_submissions insert failed, trying outreaches:", dbError)
      try {
        await sql`
          INSERT INTO outreaches (
            type, status, subject, body, recipient_email, recipient_name, created_at, updated_at
          ) VALUES (
            'inbound', 'pending',
            ${`[${formData.inquiryType}] Contact Form Submission`},
            ${`From: ${formData.name} (${formData.email})${formData.company ? `\nCompany: ${formData.company}` : ''}\n\nMessage:\n${formData.message}`},
            ${formData.email}, ${formData.name}, NOW(), NOW()
          )
        `
      } catch {
        // Continue even if DB insert fails - email notification is more important
      }
    }

    // Send email notification via SendGrid
    const sendGridKey = process.env.SENDGRID_API_KEY
    
    if (sendGridKey) {
      const emailContent = `
New Contact Form Submission

Name: ${formData.name}
Email: ${formData.email}
Company: ${formData.company || 'Not provided'}
Inquiry Type: ${formData.inquiryType}

Message:
${formData.message}

---
This message was sent from the Optimus contact form.
Reply directly to this email to respond to ${formData.name}.
      `.trim()

      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #0a0a0a; color: white; padding: 24px; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 20px; }
    .content { background: #f9f9f9; padding: 24px; border: 1px solid #e5e5e5; }
    .field { margin-bottom: 16px; }
    .label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .value { font-size: 15px; color: #1a1a1a; }
    .message-box { background: white; border: 1px solid #e5e5e5; padding: 16px; border-radius: 6px; margin-top: 16px; }
    .footer { padding: 16px 24px; background: #fafafa; border: 1px solid #e5e5e5; border-top: 0; border-radius: 0 0 8px 8px; font-size: 13px; color: #666; }
    .badge { display: inline-block; background: #e5e5e5; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 500; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>New Contact Form Submission</h1>
    </div>
    <div class="content">
      <div class="field">
        <div class="label">Name</div>
        <div class="value">${formData.name}</div>
      </div>
      <div class="field">
        <div class="label">Email</div>
        <div class="value"><a href="mailto:${formData.email}">${formData.email}</a></div>
      </div>
      <div class="field">
        <div class="label">Company</div>
        <div class="value">${formData.company || '<span style="color: #999;">Not provided</span>'}</div>
      </div>
      <div class="field">
        <div class="label">Inquiry Type</div>
        <div class="value"><span class="badge">${formData.inquiryType}</span></div>
      </div>
      <div class="message-box">
        <div class="label">Message</div>
        <div class="value" style="white-space: pre-wrap;">${formData.message}</div>
      </div>
    </div>
    <div class="footer">
      Reply directly to this email to respond to ${formData.name}.
    </div>
  </div>
</body>
</html>
      `.trim()

      // Send to all notification emails
      for (const toEmail of NOTIFICATION_EMAILS) {
        try {
          const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${sendGridKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: toEmail }] }],
              from: { 
                email: process.env.SENDGRID_SENDER_EMAIL || 'noreply@an-ker.info',
                name: 'Optimus Contact Form'
              },
              reply_to: { email: formData.email, name: formData.name },
              subject: `[${formData.inquiryType}] New Contact from ${formData.name}`,
              content: [
                { type: 'text/plain', value: emailContent },
                { type: 'text/html', value: htmlContent }
              ]
            })
          })

          if (!response.ok) {
            console.error(`SendGrid error for ${toEmail}:`, await response.text())
          }
        } catch (emailError) {
          console.error(`Failed to send email to ${toEmail}:`, emailError)
        }
      }
    } else {
      console.warn('SendGrid API key not configured - email notification not sent')
    }

    return { success: true, message: "Thank you for your message. We'll be in touch shortly." }
  } catch (error) {
    console.error("Error submitting contact form:", error)
    return { success: false, message: "There was an error submitting your message. Please try again." }
  }
}
