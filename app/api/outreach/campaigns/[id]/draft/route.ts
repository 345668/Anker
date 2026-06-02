/**
 * POST /api/outreach/campaigns/[id]/draft
 *
 * Bulk-draft outreach across a campaign's members using a chosen
 * template.  Two modes:
 *
 *   - personalize = false (default true if AI is available):
 *       deterministic template render only — fast, no AI calls.
 *   - personalize = true:
 *       runs the rendered template through generateBatch() to tighten
 *       it per-investor.  Batched + capped + 429-safe via provider.ts.
 *
 * For each member we upsert one outreach_messages row (kind matches
 * channel: email_intro for "email", dm_intro for "linkedin") and flip
 * the member status to "drafted".  Drafts only — never sends.
 *
 * Body:
 *   {
 *     templateId: string         // "builtin:..." or uuid
 *     memberIds?: string[]       // limit to these members (default: all planned)
 *     founder: FounderCtx        // company, oneLiner, facts, calendarUrl, founderName
 *     channel?: "email"|"linkedin"   // overrides campaign default for this run
 *     personalize?: boolean      // default true; false = template-only
 *     provider?: AiProvider      // per-run override
 *   }
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { generate, type AiProvider } from "@/lib/ai/provider"
import { PROVIDER_NAMES } from "@/lib/ai/runtime-config"
import { BUILTIN_TEMPLATES, renderTemplate, buildTemplateVars, type TemplateDef } from "@/lib/outreach/builtin-templates"

export const runtime = "nodejs"
export const maxDuration = 300

const CAP_MEMBERS = 50  // hard cap per draft run — keeps AI calls bounded

interface BodyShape {
  templateId: string
  memberIds?: string[]
  founder?: any
  channel?: "email" | "linkedin"
  personalize?: boolean
  provider?: AiProvider
}

function builtinById(id: string): TemplateDef | null {
  return BUILTIN_TEMPLATES.find((t) => t.id === id) ?? null
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const { id } = await ctx.params
    const body = (await req.json().catch(() => ({}))) as BodyShape
    const templateId = String(body?.templateId ?? "").trim()
    if (!templateId) return NextResponse.json({ error: "templateId required" }, { status: 400 })

    const [campaign] = await sql`
      SELECT * FROM outreach_campaigns WHERE id = ${id} AND user_id = ${user.id}
    ` as any[]
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 })

    // Resolve template — built-in by prefix, otherwise user template.
    let template: TemplateDef | null = null
    if (templateId.startsWith("builtin:")) {
      template = builtinById(templateId)
    } else {
      const [row] = await sql`
        SELECT * FROM outreach_templates WHERE id = ${templateId} AND user_id = ${user.id}
      ` as any[]
      if (row) {
        template = {
          id: row.id,
          name: row.name,
          category: row.category,
          channel: row.channel,
          subject: row.subject_template ?? undefined,
          body: row.body_template,
          variables: Array.isArray(row.variables) ? row.variables : [],
          builtin: true as any,  // structurally compatible
        }
      }
    }
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 })

    // Channel: explicit > template > campaign default.  For "multi" we
    // default to email but a DM is also rendered when the template's
    // channel is "multi".
    const channel: "email" | "linkedin" = (body?.channel as any)
      ?? (template.channel === "linkedin" ? "linkedin" : "email")

    // Member set — bounded.
    let memberRows: any[]
    if (Array.isArray(body?.memberIds) && body.memberIds.length) {
      const ids = body.memberIds.slice(0, CAP_MEMBERS)
      memberRows = await sql`
        SELECT m.*, e.display_name, e.display_title, e.display_email, e.display_linkedin,
               e.display_type, e.display_location, e.why_match, e.research_summary
        FROM outreach_campaign_members m
        LEFT JOIN crm_entries e ON e.id = m.crm_entry_id AND e.user_id = m.user_id
        WHERE m.id = ANY(${ids}::text[]) AND m.campaign_id = ${id} AND m.user_id = ${user.id}
      `
    } else {
      memberRows = await sql`
        SELECT m.*, e.display_name, e.display_title, e.display_email, e.display_linkedin,
               e.display_type, e.display_location, e.why_match, e.research_summary
        FROM outreach_campaign_members m
        LEFT JOIN crm_entries e ON e.id = m.crm_entry_id AND e.user_id = m.user_id
        WHERE m.campaign_id = ${id} AND m.user_id = ${user.id} AND m.status IN ('planned','drafted')
        ORDER BY m.added_at ASC
        LIMIT ${CAP_MEMBERS}
      `
    }
    if (!memberRows.length) {
      return NextResponse.json({ error: "No members to draft" }, { status: 400 })
    }

    const founder = body?.founder ?? null
    const personalize = body?.personalize !== false
    const provider =
      body?.provider && PROVIDER_NAMES.includes(body.provider as any) && body.provider !== "none"
        ? (body.provider as AiProvider)
        : undefined

    // Kind for outreach_messages: dictated by chosen channel.
    const kind = channel === "linkedin" ? "dm_intro" : "email_intro"
    const updates: any[] = []

    for (const m of memberRows) {
      const vars = buildTemplateVars({
        member: {
          displayName: m.display_name,
          displayTitle: m.display_title,
          displayType: m.display_type,
          displayLocation: m.display_location,
          whyMatch: m.why_match,
          researchSummary: m.research_summary,
        },
        founder,
      })

      let body_ = renderTemplate(template.body, vars).trim()
      let subject_ = channel === "email" && template.subject
        ? renderTemplate(template.subject, vars).trim()
        : null

      // Optional AI tightening pass.
      let generatedBy = "template"
      if (personalize) {
        const research = m.research_summary ? `\n\nKnown research:\n${String(m.research_summary).slice(0, 1200)}` : ""
        const prompt = channel === "email"
          ? `Tighten this outreach email so it sounds specific to this investor and natural to this founder. Keep it under 160 words. No em-dashes. Keep one clear CTA.${research}\n\nSUBJECT: ${subject_ ?? ""}\n\nDRAFT:\n${body_}\n\nReturn the body only, no headers, no labels.`
          : `Tighten this LinkedIn DM. Under 300 characters. One specific hook, one ask. No em-dashes.${research}\n\nDRAFT:\n${body_}\n\nReturn only the DM body.`
        const out = await generate(prompt, {
          task: "dm_personalize",
          maxTokens: channel === "email" ? 500 : 180,
          temperature: 0.5,
          provider,
        })
        if (out && out.trim()) {
          body_ = out.trim()
          generatedBy = provider ? `ai:${provider}` : "ai"
        }
      }

      // Append campaign-level signature on email drafts (LinkedIn DMs stay short).
      // Idempotent: only appends if the signature isn't already present in body_.
      if (
        channel === "email" &&
        typeof campaign.signature === "string" &&
        campaign.signature.trim().length > 0
      ) {
        const sigKey = campaign.signature.slice(0, 80)
        if (!body_.includes(sigKey)) {
          // Strip any existing trailing sign-off the template / AI tightening left,
          // so we don't end up with two sign-offs stacked.
          body_ = body_
            .replace(/\n\n(Warmly|Best regards|Best|With respect|Sincerely|Regards|Warm regards|Cheers|Thanks),[\s\S]*$/, "")
            .trimEnd()
          body_ = body_ + "\n\n" + campaign.signature.trim()
        }
      }

      // Upsert into outreach_messages.
      const inserted = await sql`
        INSERT INTO outreach_messages (
          user_id, crm_entry_id, kind, step_number, channel,
          body, subject, email_to, status, generated_by, model_notes, created_at, updated_at
        ) VALUES (
          ${user.id}, ${m.crm_entry_id}, ${kind}, 0, ${channel},
          ${body_}, ${subject_}, ${channel === "email" ? (m.display_email ?? null) : null}, 'draft',
          ${generatedBy}, ${`campaign:${id} template:${template.id}`},
          NOW(), NOW()
        )
        ON CONFLICT (crm_entry_id, kind) DO UPDATE SET
          body = EXCLUDED.body,
          subject = EXCLUDED.subject,
          email_to = EXCLUDED.email_to,
          channel = EXCLUDED.channel,
          status = CASE WHEN outreach_messages.status IN ('sent','delivered','replied','accepted')
                        THEN outreach_messages.status ELSE 'draft' END,
          generated_by = EXCLUDED.generated_by,
          model_notes = EXCLUDED.model_notes,
          updated_at = NOW()
        RETURNING id, kind, channel, body, subject, status
      ` as any[]

      // Flip member status to drafted (if not already sent/replied).
      await sql`
        UPDATE outreach_campaign_members SET
          status = CASE WHEN status IN ('sent','replied') THEN status ELSE 'drafted' END,
          drafted_at = COALESCE(drafted_at, NOW()),
          updated_at = NOW()
        WHERE id = ${m.id} AND user_id = ${user.id}
      `
      updates.push({ memberId: m.id, message: inserted[0] ?? null, personalized: personalize })
    }

    await sql`
      UPDATE outreach_campaigns SET status = 'active', updated_at = NOW()
      WHERE id = ${id} AND user_id = ${user.id} AND status = 'draft'
    `

    return NextResponse.json({
      drafted: updates.length,
      personalized: personalize,
      provider: provider ?? null,
      template: { id: template.id, name: template.name, channel },
      updates,
    })
  } catch (e: any) {
    console.error("[campaigns/draft] error:", e)
    return NextResponse.json({ error: e?.message ?? "Draft failed" }, { status: 500 })
  }
}
