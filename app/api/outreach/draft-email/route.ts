import { crmWorkspaceResponse } from "@/lib/crm/workspace"
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
import { aiErrorMessage } from "@/lib/ai/route-error"
import { firstWord, senderBlock as buildSenderBlock, buildPrompt, parseDraft, fallbackDraft } from "@/lib/outreach/draft-intro"

export const runtime = "nodejs"
export const maxDuration = 180

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
    const crmScope = await crmWorkspaceResponse(true)
    if (crmScope instanceof NextResponse) return crmScope

    const body = await req.json().catch(() => ({}))
    const crmEntryId = String(body?.crmEntryId ?? "").trim()
    if (!crmEntryId) return NextResponse.json({ error: "crmEntryId required" }, { status: 400 })

    const [entry] = await sql`
      SELECT * FROM crm_entries WHERE id = ${crmEntryId} AND org_id = ${crmScope.orgId}
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
    const sender = buildSenderBlock(senderProfile?.built_profile, founder)
    if (!sender.trim()) {
      return NextResponse.json(
        { error: "No sender context. Build a sender profile or fill in your founder context first." },
        { status: 400 },
      )
    }

    const prompt = buildPrompt(entry, sender, founder)
    const ai = await generateDetailed(prompt, { task: "dm_personalize", maxTokens: 700, temperature: 0.6 })
    // Deterministic fallback if the model returned nothing parseable.
    const draft = parseDraft(ai.text, entry, founder)
    const subject = draft.subject, emailBody = draft.email, dmBody = draft.dm
    const provider: string = draft.usedModel ? ai.provider : (ai.text ? ai.provider : "heuristic")

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
      ON CONFLICT (user_id, crm_entry_id, kind) WHERE call_id IS NULL DO UPDATE SET
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
      ON CONFLICT (user_id, crm_entry_id, kind) WHERE call_id IS NULL DO UPDATE SET
        body = EXCLUDED.body,
        status = CASE WHEN outreach_messages.status IN ('sent','delivered','replied','accepted')
                      THEN outreach_messages.status ELSE 'draft' END,
        generated_by = EXCLUDED.generated_by, updated_at = NOW()
      RETURNING id, kind, channel, body, char_count, status
    `

    return NextResponse.json({
      provider,
      aiError: ai.text ? null : aiErrorMessage(ai, "dm_personalize"),
      email: emailRow,
      dm: dmRow,
      senderProfileId: senderProfile?.id ?? null,
    })
  } catch (e: any) {
    console.error("[outreach/draft-email] error:", e)
    return NextResponse.json({ error: e?.message ?? "draft-email failed" }, { status: 500 })
  }
}
