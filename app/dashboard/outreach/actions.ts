"use server"

import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { sendEmail, isResendConfigured } from "@/lib/email/resend"
import { buildInvestorProfile } from "@/lib/agents/profile-builder"
import { generateEmailSequence, generateFollowUpEmail } from "@/lib/ai/email-personalizer"
import type { FounderContext, PartnerContext } from "@/lib/ai/dm-personalizer"

/**
 * Outreach server actions.
 *
 * Sending: Resend (lib/email/resend.ts) is primary, from OUTREACH_FROM_EMAIL
 * (vc@an-ker.de).  SendGrid stays as a legacy fallback ONLY when no
 * RESEND_API_KEY is configured, so existing setups don't break.
 *
 * Generation: local AI (Ollama via lib/ai/provider) + web-crawl-backed
 * investor profile, NOT cloud OpenAI/Mistral.  The first-outreach draft
 * is tailored to the fund/startup doing outreach AND the recipient
 * investor + their CRM stage.
 */

// ─── helpers ────────────────────────────────────────────────────────────
function firstWord(s?: string | null): string {
  return (s ?? "").trim().split(/\s+/)[0] ?? ""
}

async function loadFounderContext(userId: string, overrides?: Partial<FounderContext>): Promise<FounderContext> {
  const startups = await sql`SELECT name, description FROM startups WHERE founder_id = ${userId} LIMIT 1`
  const s = startups[0] as any
  return {
    companyName: overrides?.companyName || s?.name || "Our startup",
    oneLiner: overrides?.oneLiner || s?.description || "",
    facts: overrides?.facts ?? [],
    founderName: overrides?.founderName,
    calendarUrl: overrides?.calendarUrl,
    currency: overrides?.currency ?? "USD",
  }
}

// ─── Send (Resend primary, SendGrid legacy fallback) ────────────────────
export async function sendOutreachEmailAction(data: {
  to: string
  toName: string
  subject: string
  body: string
  outreachId?: string
  /** Threading: prior Message-ID to set In-Reply-To. */
  inReplyTo?: string
  // Legacy SendGrid overrides (only used when Resend isn't configured)
  customSenderEmail?: string
  customSenderName?: string
  customSendGridKey?: string
}): Promise<{ success: boolean; error?: string; messageId?: string; provider?: string; dryRun?: boolean }> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: "Unauthorized" }

  if (!data.to || !data.subject || !data.body) {
    return { success: false, error: "Recipient, subject, and body are all required." }
  }

  // Personalization variable replacement (kept for template compatibility)
  const startups = await sql`SELECT name FROM startups WHERE founder_id = ${user.id} LIMIT 1`
  const startupName = (startups[0] as any)?.name || "Our Startup"
  const subject = data.subject.replace(/\{\{investor_name\}\}/g, data.toName).replace(/\{\{startup_name\}\}/g, startupName)
  const body = data.body.replace(/\{\{investor_name\}\}/g, data.toName).replace(/\{\{startup_name\}\}/g, startupName)

  // ── Resend path (primary) ──
  if (isResendConfigured()) {
    try {
      const res = await sendEmail({
        to: data.to,
        subject,
        text: body,
        inReplyTo: data.inReplyTo,
      })
      if (data.outreachId) {
        try {
          await sql`
            UPDATE outreaches SET
              sent_at = NOW(), stage = 'sent',
              email_subject = ${subject}, email_body = ${body},
              updated_at = NOW()
            WHERE id = ${data.outreachId}`
        } catch (e) { console.error("[outreach] update failed:", e) }
      }
      revalidatePath("/dashboard/outreach")
      revalidatePath("/dashboard/crm")
      return {
        success: true,
        messageId: res.resendId,
        provider: res.dryRun ? "resend(dry-run)" : "resend",
        dryRun: res.dryRun,
      }
    } catch (e: any) {
      return { success: false, error: `Resend send failed: ${e?.message ?? "unknown error"}` }
    }
  }

  // ── SendGrid legacy fallback (only if Resend not configured) ──
  const sendGridKey = data.customSendGridKey || process.env.SENDGRID_API_KEY
  const senderEmail = data.customSenderEmail || process.env.SENDGRID_SENDER_EMAIL || user.email
  const senderName = data.customSenderName || process.env.SENDGRID_SENDER_NAME || user.user_metadata?.first_name || "Anker"
  if (!sendGridKey) {
    return { success: false, error: "No email provider configured. Set RESEND_API_KEY in .env.local (recommended) or a SendGrid key in Settings." }
  }
  if (!senderEmail) return { success: false, error: "Sender email not configured." }
  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${sendGridKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: data.to, name: data.toName }], subject }],
        from: { email: senderEmail, name: senderName },
        content: [{ type: "text/plain", value: body }],
        tracking_settings: { open_tracking: { enable: true }, click_tracking: { enable: true } },
      }),
    })
    if (!response.ok) {
      return { success: false, error: `SendGrid failed: ${response.status} ${await response.text()}` }
    }
    const messageId = response.headers.get("x-message-id") || crypto.randomUUID()
    if (data.outreachId) {
      await sql`
        UPDATE outreaches SET sent_at = NOW(), stage = 'sent',
          email_subject = ${subject}, email_body = ${body}, updated_at = NOW()
        WHERE id = ${data.outreachId}`
    }
    revalidatePath("/dashboard/outreach")
    revalidatePath("/dashboard/crm")
    return { success: true, messageId, provider: "sendgrid" }
  } catch (e: any) {
    return { success: false, error: `SendGrid send failed: ${e?.message ?? "unknown error"}` }
  }
}

// ─── Generate first-outreach email (local AI + investor profile) ────────
export async function generateEmailWithAIAction(data: {
  startupName: string
  startupDescription: string
  investorName: string
  firmName: string
  senderName: string
  // New optional context for a tailored, profile-backed draft:
  investorId?: string
  firmId?: string
  stage?: string
  founderFacts?: string[]
  calendarUrl?: string
}): Promise<{
  success: boolean
  email?: { subject: string; body: string }
  profile?: { headline: string; primaryHook: string | null; talkingPoints: string[]; fundThesis: string | null; urgency: string }
  generatedBy?: string
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: "Unauthorized" }

  const founder = await loadFounderContext(user.id, {
    companyName: data.startupName,
    oneLiner: data.startupDescription,
    facts: data.founderFacts ?? [],
    founderName: data.senderName,
    calendarUrl: data.calendarUrl,
  })

  // Build an investor profile when we have ids — AI + web crawl of the
  // firm site + LinkedIn public snippet.  Best-effort; the personalizer
  // still works without it.
  let profileSummary: any = undefined
  let recommendedHook: string | undefined
  let primaryPost: any = undefined
  if (data.investorId || data.firmId) {
    try {
      const profile = await buildInvestorProfile({
        investorId: data.investorId,
        firmId: data.firmId,
      })
      recommendedHook = profile.primaryHook?.text ?? profile.talkingPoints?.[0]
      if (profile.primaryHook?.source === "linkedin-post") {
        primaryPost = { text: profile.primaryHook.text, url: profile.primaryHook.url, timestamp: profile.primaryHook.recency }
      }
      profileSummary = {
        headline: profile.headline,
        primaryHook: profile.primaryHook?.text ?? null,
        talkingPoints: profile.talkingPoints ?? [],
        fundThesis: profile.fundThesis ?? null,
        urgency: profile.urgency,
      }
    } catch (e) {
      console.error("[outreach] profile build failed:", e)
    }
  }

  const partner: PartnerContext = {
    firstName: firstWord(data.investorName) || "there",
    fullName: data.investorName || "Investor",
    firm: data.firmName || "their fund",
    recommendedHook,
    primaryPost,
  }

  try {
    const seq = await generateEmailSequence(founder, partner)
    return {
      success: true,
      email: { subject: seq.day0.subject, body: seq.day0.body },
      profile: profileSummary,
      generatedBy: seq.notes ? "ollama:email" : "ollama:email",
    }
  } catch (e: any) {
    return { success: false, error: `Generation failed: ${e?.message ?? "unknown error"}` }
  }
}

// ─── Generate follow-up (meeting notes + investor reply aware) ──────────
export async function generateFollowUpEmailAction(data: {
  investorName: string
  firmName: string
  stage?: string
  threadSubject?: string
  priorThread?: string
  investorReply?: string
  meetingNotes?: string
  startupName?: string
  startupDescription?: string
  founderFacts?: string[]
  calendarUrl?: string
}): Promise<{ success: boolean; email?: { subject: string; body: string }; notes?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: "Unauthorized" }

  const founder = await loadFounderContext(user.id, {
    companyName: data.startupName,
    oneLiner: data.startupDescription,
    facts: data.founderFacts ?? [],
    calendarUrl: data.calendarUrl,
  })
  const partner: PartnerContext = {
    firstName: firstWord(data.investorName) || "there",
    fullName: data.investorName || "Investor",
    firm: data.firmName || "their fund",
  }

  try {
    const msg = await generateFollowUpEmail({
      founder,
      partner,
      stage: data.stage,
      threadSubject: data.threadSubject,
      priorThread: data.priorThread,
      investorReply: data.investorReply,
      meetingNotes: data.meetingNotes,
    })
    return { success: true, email: { subject: msg.subject, body: msg.body }, notes: msg.notes }
  } catch (e: any) {
    return { success: false, error: `Follow-up generation failed: ${e?.message ?? "unknown error"}` }
  }
}

// ─── Templates ──────────────────────────────────────────────────────────
export async function saveEmailTemplateAction(data: {
  name: string
  subject: string
  body: string
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: "Unauthorized" }
  try {
    const id = crypto.randomUUID()
    await sql`
      INSERT INTO email_templates (id, user_id, name, subject, body, created_at, updated_at)
      VALUES (${id}, ${user.id}, ${data.name}, ${data.subject}, ${data.body}, NOW(), NOW())`
    revalidatePath("/dashboard/outreach")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: "Failed to save template" }
  }
}

// ─── Bulk send ──────────────────────────────────────────────────────────
export async function sendBulkOutreachAction(outreachIds: string[]): Promise<{
  success: boolean; sent: number; failed: number; errors?: string[]
}> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, sent: 0, failed: outreachIds.length, errors: ["Unauthorized"] }

  let sent = 0, failed = 0
  const errors: string[] = []
  for (const outreachId of outreachIds) {
    const rows = await sql`
      SELECT o.*, i.email, CONCAT(i.first_name, ' ', i.last_name) AS investor_name
      FROM outreaches o LEFT JOIN investors i ON o.investor_id = i.id
      WHERE o.id = ${outreachId}`
    const outreach = rows[0] as any
    if (!outreach?.email) { failed++; errors.push(`No email for outreach ${outreachId}`); continue }
    const result = await sendOutreachEmailAction({
      to: outreach.email,
      toName: outreach.investor_name || "Investor",
      subject: outreach.email_subject || "Investment Opportunity",
      body: outreach.email_body || "",
      outreachId,
    })
    if (result.success) sent++; else { failed++; errors.push(result.error || "Unknown error") }
    await new Promise((r) => setTimeout(r, 120))
  }
  return { success: failed === 0, sent, failed, errors: errors.length ? errors : undefined }
}

// ─── Tracking helpers (legacy outreaches table) ─────────────────────────
export async function trackEmailOpenAction(outreachId: string): Promise<void> {
  try {
    await sql`
      UPDATE outreaches SET opened_at = COALESCE(opened_at, NOW()),
        stage = CASE WHEN stage = 'sent' THEN 'opened' ELSE stage END, updated_at = NOW()
      WHERE id = ${outreachId}`
  } catch (e) { console.error("[outreach] track open:", e) }
}

export async function markEmailRepliedAction(outreachId: string): Promise<{ success: boolean }> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false }
  await sql`
    UPDATE outreaches SET replied_at = NOW(), stage = 'replied', updated_at = NOW()
    WHERE id = ${outreachId}`
  revalidatePath("/dashboard/outreach")
  revalidatePath("/dashboard/crm")
  return { success: true }
}
