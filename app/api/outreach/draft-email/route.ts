/**
 * POST /api/outreach/draft-email
 * Body: { crmEntryId, senderProfileId?, founder?, regenerate? }
 *
 * Drafts a personalized intro EMAIL (subject + body) and a LinkedIn DM
 * for one investor, fusing:
 *   - the investor row + cached research_summary (from /crawl-profile)
 *   - the selected sender profile (built_profile) and/or founder context
 *
 * Both drafts are upserted into outreach_messages as 'draft' only:
 *   kind = 'email_intro'  channel = 'email'    (carries subject)
 *   kind = 'dm_intro'     channel = 'linkedin'
 *
 * NEVER sends.  Human-approval gate per the playbook hard rule.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { generateDetailed } from "@/lib/ai/provider"

export const runtime = "nodejs"
export const maxDuration = 180

function firstWord(s: string): string {
  return (s || "").trim().split(/\s+/)[0] ?? ""
}

/** Pull the first balanced {...} JSON object out of a model response. */
function extractJson(text: string): any | null {
  if (!text) return null
  const start = text.indexOf("{")
  if (start < 0) return null
  let depth = 0
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (ch === "{") depth++
    else if (ch === "}") {
      depth--
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)) } catch { return null }
      }
    }
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const crmEntryId = String(body?.crmEntryId ?? "").trim()
    if (!crmEntryId) return NextResponse.json({ error: "crmEntryId required" }, { status: 400 })

    const [entry] = await sql`
      SELECT * FROM crm_entries WHERE id = ${crmEntryId} AND user_id = ${user.id}
    ` as any[]
    if (!entry) return NextResponse.json({ error: "CRM entry not found" }, { status: 404 })

    // Sender profile: explicit id, else the user's default, else founder ctx only.
    let senderProfile: any = null
    if (body?.senderProfileId) {
      const [p] = await sql`
        SELECT * FROM sender_profiles WHERE id = ${String(body.senderProfileId)} AND user_id = ${user.id}
      ` as any[]
      senderProfile = p ?? null
    }
    if (!senderProfile) {
      const [p] = await sql`
        SELECT * FROM sender_profiles WHERE user_id = ${user.id} AND is_default = true
        ORDER BY updated_at DESC LIMIT 1
      ` as any[]
      senderProfile = p ?? null
    }

    const founder = body?.founder ?? senderProfile?.profile_set ?? {}
    const senderBlock = [
      senderProfile?.built_profile && `SENDER PROFILE:\n${senderProfile.built_profile}`,
      founder?.companyName && `Company: ${founder.companyName}`,
      founder?.oneLiner && `One-liner: ${founder.oneLiner}`,
      Array.isArray(founder?.facts) && founder.facts.length
        ? `Facts:\n- ${founder.facts.join("\n- ")}`
        : null,
      founder?.founderName && `Founder name: ${founder.founderName}`,
      founder?.calendarUrl && `Calendar link: ${founder.calendarUrl}`,
    ].filter(Boolean).join("\n")

    if (!senderBlock.trim()) {
      return NextResponse.json(
        { error: "No sender context. Build a sender profile or fill in your founder context first." },
        { status: 400 },
      )
    }

    const investorBlock = [
      entry.display_name && `Name: ${entry.display_name}`,
      entry.display_title && `Title: ${entry.display_title}`,
      entry.display_type && `Type: ${entry.display_type}`,
      entry.display_location && `Location: ${entry.display_location}`,
      entry.why_match && `Why matched: ${entry.why_match}`,
      entry.research_summary && `Research brief:\n${entry.research_summary}`,
    ].filter(Boolean).join("\n")

    const firstName = firstWord(entry.display_name)
    const cal = founder?.calendarUrl || "a quick call"

    const prompt = `You are an expert fundraising copywriter. Draft outreach from a founder to an investor. Use the sender context and the investor research to make it specific — reference a real detail, not a generic compliment. No em-dashes. No hype words. One clear ask (a 15-minute call).

Return ONLY a JSON object, no prose around it:
{
  "subject": "email subject line, under 60 chars, specific not salesy",
  "email": "the email body, 90-150 words, greeting to '${firstName || "there"}', short paragraphs, one CTA referencing ${cal}, sign off with the founder name if known",
  "dm": "a LinkedIn DM under 300 characters, warmer and shorter than the email, one specific hook + one ask"
}

=== SENDER ===
${senderBlock}

=== INVESTOR ===
${investorBlock || "(limited info — keep it honest and brief)"}`

    const ai = await generateDetailed(prompt, { task: "dm_personalize", maxTokens: 700, temperature: 0.6 })
    let subject = ""
    let emailBody = ""
    let dmBody = ""
    let provider: string = ai.provider

    const parsed = extractJson(ai.text)
    if (parsed) {
      subject = String(parsed.subject ?? "").trim()
      emailBody = String(parsed.email ?? "").trim()
      dmBody = String(parsed.dm ?? "").trim()
    }

    // Deterministic fallback if the model returned nothing parseable.
    if (!emailBody) {
      provider = ai.text ? provider : "heuristic"
      const oneLiner = founder?.oneLiner || "what we're building"
      const company = founder?.companyName || "our company"
      const sign = founder?.founderName ? `\n\n${founder.founderName}` : ""
      subject = subject || `${company} <> ${entry.display_name?.split(" ")[0] ?? "you"}`
      emailBody =
        `Hi ${firstName || "there"},\n\n` +
        `${oneLiner}. ${entry.why_match ? `I'm reaching out because ${entry.why_match.toLowerCase()}.` : "I think there may be a strong fit with your thesis."}\n\n` +
        `Would you be open to a 15-minute call? ${founder?.calendarUrl ? `Here's my calendar: ${founder.calendarUrl}` : "Happy to work around your schedule."}${sign}`
      dmBody = dmBody ||
        `Hi ${firstName || "there"} — ${oneLiner}. ${entry.why_match ? "Looks like a fit with what you back." : ""} Open to a quick 15-min call?`.slice(0, 300)
    }

    const generatedBy = provider === "anthropic" ? "anthropic"
      : provider === "heuristic" ? "heuristic" : provider

    // Upsert both drafts (draft-only).
    const [emailRow] = await sql`
      INSERT INTO outreach_messages (
        user_id, crm_entry_id, kind, step_number, channel,
        body, subject, email_to, status, generated_by, model_notes, created_at, updated_at
      ) VALUES (
        ${user.id}, ${crmEntryId}, 'email_intro', 0, 'email',
        ${emailBody}, ${subject}, ${entry.display_email ?? null}, 'draft', ${generatedBy},
        ${senderProfile ? `sender:${senderProfile.id}` : null}, NOW(), NOW()
      )
      ON CONFLICT (crm_entry_id, kind) DO UPDATE SET
        body = EXCLUDED.body, subject = EXCLUDED.subject, email_to = EXCLUDED.email_to,
        status = CASE WHEN outreach_messages.status IN ('sent','delivered','replied','accepted')
                      THEN outreach_messages.status ELSE 'draft' END,
        generated_by = EXCLUDED.generated_by, model_notes = EXCLUDED.model_notes, updated_at = NOW()
      RETURNING id, kind, channel, body, subject, char_count, status
    `

    const [dmRow] = await sql`
      INSERT INTO outreach_messages (
        user_id, crm_entry_id, kind, step_number, channel,
        body, status, generated_by, created_at, updated_at
      ) VALUES (
        ${user.id}, ${crmEntryId}, 'dm_intro', 0, 'linkedin',
        ${dmBody}, 'draft', ${generatedBy}, NOW(), NOW()
      )
      ON CONFLICT (crm_entry_id, kind) DO UPDATE SET
        body = EXCLUDED.body,
        status = CASE WHEN outreach_messages.status IN ('sent','delivered','replied','accepted')
                      THEN outreach_messages.status ELSE 'draft' END,
        generated_by = EXCLUDED.generated_by, updated_at = NOW()
      RETURNING id, kind, channel, body, char_count, status
    `

    return NextResponse.json({
      provider,
      aiError: ai.text ? null : ai.error,
      email: emailRow,
      dm: dmRow,
      senderProfileId: senderProfile?.id ?? null,
    })
  } catch (e: any) {
    console.error("[outreach/draft-email] error:", e)
    return NextResponse.json({ error: e?.message ?? "draft-email failed" }, { status: 500 })
  }
}
