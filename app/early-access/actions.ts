"use server"

import { sql } from "@/lib/db"

const NOTIFICATION_EMAILS = [
  "masindetphilippe@gmail.com",
  "vc@philippemasindet.com",
]

const PERSONA_LABELS: Record<string, string> = {
  founder: "Founder",
  investor: "Investor / VC",
  lp: "Limited Partner (LP)",
  other: "Other",
}

export interface EarlyAccessInput {
  name: string
  email: string
  persona: string
  company?: string
  role?: string
  website?: string
  stage?: string
  useCase?: string
  heardFrom?: string
  referralSource?: string
}

export async function submitEarlyAccessRequest(
  formData: EarlyAccessInput,
): Promise<{ success: boolean; message: string }> {
  // Required fields.
  if (!formData.name?.trim() || !formData.email?.trim() || !formData.persona?.trim()) {
    return { success: false, message: "Please fill in your name, email, and who you are." }
  }

  // Basic email validation.
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(formData.email)) {
    return { success: false, message: "Please enter a valid email address." }
  }

  const persona = formData.persona.trim()
  const personaLabel = PERSONA_LABELS[persona] ?? persona

  try {
    // Store the request. Falls back to the contact tables if the dedicated
    // table isn't present yet (mirrors the contact form's resilience).
    try {
      await sql`
        INSERT INTO early_access_requests
          (name, email, persona, company, role, website, stage, use_case, heard_from, referral_source, status, created_at, updated_at)
        VALUES (
          ${formData.name.trim()}, ${formData.email.trim()}, ${persona},
          ${formData.company?.trim() || null}, ${formData.role?.trim() || null},
          ${formData.website?.trim() || null}, ${formData.stage?.trim() || null},
          ${formData.useCase?.trim() || null}, ${formData.heardFrom?.trim() || null},
          ${formData.referralSource?.trim() || null},
          'pending', NOW(), NOW()
        )
      `
    } catch (dbError) {
      console.error("early_access_requests insert failed, falling back to contact_submissions:", dbError)
      try {
        await sql`
          INSERT INTO contact_submissions (name, email, company, inquiry_type, message, status, created_at)
          VALUES (
            ${formData.name.trim()}, ${formData.email.trim()}, ${formData.company?.trim() || null},
            ${`early_access:${persona}`},
            ${`Role: ${formData.role || "—"}\nWebsite/LinkedIn: ${formData.website || "—"}\nStage: ${formData.stage || "—"}\nUse case: ${formData.useCase || "—"}\nHeard from: ${formData.heardFrom || "—"}\nSource: ${formData.referralSource || "—"}`},
            'pending', NOW()
          )
        `
      } catch {
        // Continue even if DB insert fails — the email notification still goes out.
      }
    }

    // Notify the team via SendGrid (same transport as the contact form).
    const sendGridKey = process.env.SENDGRID_API_KEY
    if (sendGridKey) {
      const rows: [string, string][] = [
        ["Name", formData.name],
        ["Email", formData.email],
        ["Who they are", personaLabel],
        ["Company / Fund", formData.company || "Not provided"],
        ["Role / Title", formData.role || "Not provided"],
        ["Website / LinkedIn", formData.website || "Not provided"],
        ["Stage", formData.stage || "Not provided"],
        ["Use case", formData.useCase || "Not provided"],
        ["Heard from", formData.heardFrom || "Not provided"],
        ["Source", formData.referralSource || "direct"],
      ]

      const emailContent =
        `New Early-Access Request\n\n` +
        rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
        `\n\n---\nSubmitted from the Anker early-access form.`

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
    .field { margin-bottom: 14px; }
    .label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
    .value { font-size: 15px; color: #1a1a1a; white-space: pre-wrap; }
    .badge { display: inline-block; background: #e5e5e5; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 500; }
    .footer { padding: 16px 24px; background: #fafafa; border: 1px solid #e5e5e5; border-top: 0; border-radius: 0 0 8px 8px; font-size: 13px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>New Early-Access Request</h1></div>
    <div class="content">
      ${rows
        .map(([k, v], i) =>
          i === 2
            ? `<div class="field"><div class="label">${k}</div><div class="value"><span class="badge">${v}</span></div></div>`
            : `<div class="field"><div class="label">${k}</div><div class="value">${
                k === "Email"
                  ? `<a href="mailto:${v}">${v}</a>`
                  : v === "Not provided" || v === "direct"
                    ? `<span style="color:#999;">${v}</span>`
                    : v
              }</div></div>`,
        )
        .join("")}
    </div>
    <div class="footer">Reply directly to this email to reach ${formData.name}.</div>
  </div>
</body>
</html>`.trim()

      for (const toEmail of NOTIFICATION_EMAILS) {
        try {
          const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${sendGridKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: toEmail }] }],
              from: {
                email: process.env.SENDGRID_SENDER_EMAIL || "noreply@an-ker.info",
                name: "Anker Early Access",
              },
              reply_to: { email: formData.email, name: formData.name },
              subject: `[Early Access · ${personaLabel}] ${formData.name}`,
              content: [
                { type: "text/plain", value: emailContent },
                { type: "text/html", value: htmlContent },
              ],
            }),
          })
          if (!response.ok) {
            console.error(`SendGrid error for ${toEmail}:`, await response.text())
          }
        } catch (emailError) {
          console.error(`Failed to send early-access email to ${toEmail}:`, emailError)
        }
      }
    } else {
      console.warn("SendGrid API key not configured — early-access notification not sent")
    }

    return {
      success: true,
      message: "You're on the list. We review requests weekly and will email you when your access is ready.",
    }
  } catch (error) {
    console.error("Error submitting early-access request:", error)
    return { success: false, message: "There was an error submitting your request. Please try again." }
  }
}
