/**
 * POST /api/outreach/replies
 *
 * Layer 4: classify an inbound reply and draft the response.
 *
 * Body:
 *   {
 *     crmEntryId: string,
 *     replyText: string,
 *     inReplyToMessageId?: string,    // outreach_messages.id (the DM we sent)
 *     founder: { companyName, oneLiner, facts[], calendarUrl? }
 *   }
 *
 * Side effects:
 *   - Insert a row into outreach_replies (classification + draft + recommended_stage)
 *   - Advance crm_entries.stage to recommended_stage iff caller doesn't
 *     explicitly opt out (?advanceStage=false)
 *
 * GET /api/outreach/replies?crmEntryId=...
 *   List replies for a CRM entry (most recent first).
 */

import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { classifyAndDraftReply, type ReplyContext } from "@/lib/ai/reply-handler"
import { resolveProvider } from "@/lib/ai/provider"
import { suppressFollowupsOnReply } from "@/lib/outreach/reply-actions"

export const runtime = "nodejs"
export const maxDuration = 120

interface PostBody {
  crmEntryId: string
  replyText: string
  inReplyToMessageId?: string
  founder: ReplyContext["founder"]
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const body = (await req.json()) as PostBody
    if (!body?.crmEntryId || !body?.replyText) {
      return NextResponse.json({ error: "crmEntryId + replyText required" }, { status: 400 })
    }
    if (!body.founder?.companyName || !body.founder?.oneLiner) {
      return NextResponse.json({ error: "founder.companyName + founder.oneLiner required" }, { status: 400 })
    }

    const url = new URL(req.url)
    const advanceStage = url.searchParams.get("advanceStage") !== "false"

    const [entry] = await sql`
      SELECT * FROM crm_entries WHERE user_id = ${user.id} AND id = ${body.crmEntryId} LIMIT 1
    `
    if (!entry) return NextResponse.json({ error: "CRM entry not found" }, { status: 404 })

    // Look up the original DM for context (so the model can match tone)
    let originalDm = ""
    if (body.inReplyToMessageId) {
      const [m] = await sql`
        SELECT body FROM outreach_messages
        WHERE id = ${body.inReplyToMessageId} AND user_id = ${user.id} LIMIT 1
      `
      if (m) originalDm = (m as any).body
    } else {
      // Fall back to the most recent connection_request / follow_up we sent
      const [m] = await sql`
        SELECT body FROM outreach_messages
        WHERE crm_entry_id = ${body.crmEntryId}
          AND user_id = ${user.id}
          AND status IN ('sent','delivered')
        ORDER BY sent_at DESC NULLS LAST
        LIMIT 1
      `
      if (m) originalDm = (m as any).body
    }

    const provider = await resolveProvider()
    const generatedBy = provider === "anthropic" ? "anthropic:claude-sonnet-4-6"
      : provider === "ollama" ? `ollama:${process.env.OLLAMA_MODEL ?? "default"}`
      : "heuristic"

    const result = await classifyAndDraftReply({
      partnerName: (entry as any).display_name,
      partnerFirm: (entry as any).display_type ?? "their fund",
      partnerTitle: (entry as any).display_title ?? undefined,
      ourOriginalDm: originalDm,
      theirReply: body.replyText,
      founder: body.founder,
    })

    // Persist the classification + draft
    const [reply] = await sql`
      INSERT INTO outreach_replies (
        user_id, crm_entry_id, in_reply_to_message_id,
        inbound_text, classification, draft_response,
        recommended_stage, reengage_on, generated_by, notes,
        received_at, created_at, updated_at
      ) VALUES (
        ${user.id}, ${body.crmEntryId}, ${body.inReplyToMessageId ?? null},
        ${body.replyText}, ${result.classification}, ${result.draft},
        ${result.recommendedStage}, ${result.reengageOnIso ?? null}::date,
        ${generatedBy}, ${result.notes ?? null},
        NOW(), NOW(), NOW()
      ) RETURNING *
    `

    // A reply landed: stop the sequence from talking over it — mark the
    // replied-to message, clear pending follow-ups, cancel future steps.
    await suppressFollowupsOnReply(user.id, body.crmEntryId, body.inReplyToMessageId ?? null).catch(() => {})

    // Advance the CRM stage if the recommendation is forward-progressing
    if (advanceStage && result.recommendedStage) {
      await sql`
        UPDATE crm_entries SET
          stage             = ${result.recommendedStage},
          last_contacted_at = COALESCE(last_contacted_at, NOW()),
          updated_at        = NOW()
        WHERE id = ${body.crmEntryId} AND user_id = ${user.id}
      `
    }

    return NextResponse.json({ reply, classification: result.classification, draft: result.draft, recommendedStage: result.recommendedStage })
  } catch (e: any) {
    console.error("[outreach/replies POST] error:", e)
    return NextResponse.json({ error: e?.message ?? "Reply handling failed" }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
    const url = new URL(req.url)
    const crmEntryId = url.searchParams.get("crmEntryId")
    if (!crmEntryId) return NextResponse.json({ error: "crmEntryId required" }, { status: 400 })
    const rows = await sql`
      SELECT * FROM outreach_replies
      WHERE user_id = ${user.id} AND crm_entry_id = ${crmEntryId}
      ORDER BY received_at DESC
      LIMIT 200
    `
    return NextResponse.json({ replies: rows })
  } catch (e: any) {
    console.error("[outreach/replies GET] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed to load" }, { status: 500 })
  }
}
